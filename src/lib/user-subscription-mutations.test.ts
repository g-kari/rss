// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { UserSubscription } from "../types";
import { mutateUserSubscriptions } from "./user-subscription-mutations";

const a: UserSubscription = {
  feedHash: "aaaaaaaaaaaaaaaa",
  url: "https://example.org/a",
  subscribedAt: "2026-10-06T00:00:00Z",
};
const b: UserSubscription = {
  feedHash: "bbbbbbbbbbbbbbbb",
  url: "https://example.org/b",
  subscribedAt: "2026-10-06T00:00:00Z",
  customTitle: "Preserve",
  priority: "high",
};
function storage(initial?: unknown) {
  let value = initial === undefined ? null : JSON.stringify(initial);
  let etag = "1";
  let revision = 1;
  const get = vi.fn(async () =>
    value === null ? null : { etag, size: value.length, json: async () => JSON.parse(value!) },
  );
  const put = vi.fn(async (_key: string, body: string, options?: R2PutOptions) => {
    const condition = options?.onlyIf as R2Conditional;
    if (
      (condition?.etagDoesNotMatch === "*" && value !== null) ||
      (condition?.etagMatches && condition.etagMatches !== etag)
    )
      return null;
    value = body;
    etag = String(++revision);
    return { etag };
  });
  return {
    bucket: { get, put } as unknown as R2Bucket,
    get,
    put,
    read: () => JSON.parse(value!),
    seed: (next: unknown) => {
      value = JSON.stringify(next);
      etag = String(++revision);
    },
  };
}
const append = (entry: UserSubscription) => (current: UserSubscription[]) => ({
  subscriptions: [...current, entry],
  result: entry,
});
describe("conditional subscription transformations", () => {
  it("creates only if absent and preserves the existing JSON array format", async () => {
    const s = storage();
    await mutateUserSubscriptions(s.bucket, "owner-a", append(a));
    expect(s.read()).toEqual([a]);
    expect(s.put.mock.calls[0][2]?.onlyIf).toEqual({ etagDoesNotMatch: "*" });
  });
  it("preserves existing settings and uses the observed ETag", async () => {
    const s = storage([b]);
    await mutateUserSubscriptions(s.bucket, "owner-a", append(a));
    expect(s.read()).toEqual([b, a]);
    expect(s.put.mock.calls[0][2]?.onlyIf).toEqual({ etagMatches: "1" });
  });
  it("returns a no-op without writes or beforeCommit", async () => {
    const s = storage([a]);
    const beforeCommit = vi.fn();
    expect(
      await mutateUserSubscriptions(
        s.bucket,
        "owner-a",
        (current) => ({ subscriptions: current, result: "existing", changed: false }),
        { beforeCommit },
      ),
    ).toBe("existing");
    expect(s.put).not.toHaveBeenCalled();
    expect(beforeCommit).not.toHaveBeenCalled();
  });
  it("retries a simultaneous add without losing its custom fields", async () => {
    const s = storage([]);
    let once = false;
    await mutateUserSubscriptions(s.bucket, "owner-a", append(a), {
      beforeCommit: async () => {
        if (!once) {
          once = true;
          s.seed([b]);
        }
      },
    });
    expect(s.read()).toEqual([b, a]);
    expect(s.put).toHaveBeenCalledTimes(2);
  });
  it("a lastAccess update re-reads concurrent additions", async () => {
    const s = storage([a]);
    let once = false;
    await mutateUserSubscriptions(
      s.bucket,
      "owner-a",
      (current) => ({
        subscriptions: current.map((sub) => ({ ...sub, lastAccessedAt: "2026-10-06T01:00:00Z" })),
        result: undefined,
      }),
      {
        beforeCommit: async () => {
          if (!once) {
            once = true;
            s.seed([a, b]);
          }
        },
      },
    );
    expect(s.read()).toEqual(
      [a, b].map((sub) => ({ ...sub, lastAccessedAt: "2026-10-06T01:00:00Z" })),
    );
  });
  it("a targeted delete preserves concurrent unrelated additions", async () => {
    const s = storage([a]);
    let once = false;
    await mutateUserSubscriptions(
      s.bucket,
      "owner-a",
      (current) => ({
        subscriptions: current.filter((sub) => sub.feedHash !== a.feedHash),
        result: undefined,
      }),
      {
        beforeCommit: async () => {
          if (!once) {
            once = true;
            s.seed([a, b]);
          }
        },
      },
    );
    expect(s.read()).toEqual([b]);
  });
  it("targeted PATCH preserves concurrently changed unrelated settings", async () => {
    const s = storage([a]);
    let once = false;
    await mutateUserSubscriptions(
      s.bucket,
      "owner-a",
      (current) => ({
        subscriptions: current.map((sub) =>
          sub.feedHash === a.feedHash ? { ...sub, customTitle: "Requested" } : sub,
        ),
        result: undefined,
      }),
      {
        beforeCommit: async () => {
          if (!once) {
            once = true;
            s.seed([{ ...a, priority: "high", mutedUntil: "2026-10-07T00:00:00Z" }]);
          }
        },
      },
    );
    expect(s.read()).toEqual([
      { ...a, customTitle: "Requested", priority: "high", mutedUntil: "2026-10-07T00:00:00Z" },
    ]);
  });
  it("checks before every attempt and stops when revocation rejects commit", async () => {
    const s = storage([b]);
    const beforeCommit = vi.fn().mockRejectedValue(new Error("AUTH_REVOKED"));
    await expect(
      mutateUserSubscriptions(s.bucket, "owner-a", append(a), { beforeCommit }),
    ).rejects.toThrow("AUTH_REVOKED");
    expect(s.put).not.toHaveBeenCalled();
    expect(s.read()).toEqual([b]);
  });
  it("bounds persistent contention", async () => {
    const s = storage([b]);
    s.put.mockResolvedValue(null);
    await expect(mutateUserSubscriptions(s.bucket, "owner-a", append(a))).rejects.toMatchObject({
      code: "SUBSCRIPTION_CONFLICT",
    });
    expect(s.put).toHaveBeenCalledTimes(4);
  });
  it.each([
    null,
    {},
    [{ ...a, feedHash: "invalid" }],
    [{ feedHash: a.feedHash }],
    Array(1001).fill(a),
  ])("corrupt stored snapshot is never treated as empty (%#)", async (value) => {
    const s = storage(value);
    await expect(mutateUserSubscriptions(s.bucket, "owner-a", append(a))).rejects.toMatchObject({
      code: "SUBSCRIPTION_STORAGE_INVALID",
    });
    expect(s.put).not.toHaveBeenCalled();
  });
  it("does not echo storage errors or overwrite on outage", async () => {
    const s = storage([b]);
    s.get.mockRejectedValue(new Error("private-token-value"));
    await expect(mutateUserSubscriptions(s.bucket, "owner-a", append(a))).rejects.toThrow(
      "SUBSCRIPTION_STORAGE_UNAVAILABLE",
    );
    expect(s.put).not.toHaveBeenCalled();
  });
  it.each(["../other", ".", "..", ""])(
    "rejects caller-like invalid identities (%s)",
    async (id) => {
      const s = storage([b]);
      await expect(mutateUserSubscriptions(s.bucket, id, append(a))).rejects.toMatchObject({
        code: "SUBSCRIPTION_ARGUMENT_INVALID",
      });
      expect(s.get).not.toHaveBeenCalled();
    },
  );
});
