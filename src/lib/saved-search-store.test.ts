import { describe, expect, it, vi } from "vitest";
import { createSavedSearchStore, type SavedSearch } from "./saved-search-store";

const entry = (name: string, id = name): SavedSearch => ({
  id,
  name,
  query: `title:${name}`,
  createdAt: "2026-10-18T00:00:00.000Z",
});
function fixture(initial: SavedSearch[] = []) {
  let persisted: readonly SavedSearch[] = structuredClone(initial);
  const write = vi.fn((items: readonly SavedSearch[]) => {
    persisted = structuredClone(items);
    return true;
  });
  const store = createSavedSearchStore(() => structuredClone(persisted), write);
  const unsubscribe = store.subscribe(() => {});
  return { store, write, stored: () => persisted, unsubscribe };
}

describe("shared saved-search snapshot", () => {
  it("notifies both consumers with the same immutable snapshot and leaves input objects untouched", () => {
    const { store } = fixture();
    const one = vi.fn(),
      two = vi.fn();
    store.subscribe(one);
    store.subscribe(two);
    const input = entry("imported");
    const initial = store.getSnapshot();
    expect(store.getSnapshot()).toBe(initial);
    expect(store.importSaved([input])).toBe(true);
    const next = store.getSnapshot();
    expect(next).not.toBe(initial);
    expect(store.getSnapshot()).toBe(next);
    expect(Object.isFrozen(next)).toBe(true);
    expect(Object.isFrozen(next.items)).toBe(true);
    expect(Object.isFrozen(next.items[0])).toBe(true);
    input.name = "mutated input";
    expect(next.items[0].name).toBe("imported");
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
  });
  it("callbacks captured before an import always merge the newest snapshot", () => {
    const { store, stored } = fixture([entry("old")]);
    const save = store.save,
      remove = store.removeSaved,
      importSaved = store.importSaved;
    store.importSaved([entry("first")]);
    save("new", "query");
    importSaved([entry("second")]);
    remove("old");
    expect(stored().map((x) => x.name)).toEqual(["second", "new", "first"]);
  });
  it("preserves existing name replacement order and trims explicit save inputs", () => {
    const { store, stored } = fixture([entry("one"), entry("two")]);
    store.save(" one ", " title:updated ");
    expect(stored().map((x) => x.name)).toEqual(["one", "two"]);
    expect(stored()[0].query).toBe("title:updated");
    expect(stored()[0].id).not.toBe("one");
  });
  it("import-first name dedup and twenty-entry limit retain unrelated entries in order", () => {
    const { store, stored } = fixture(Array.from({ length: 20 }, (_, i) => entry(`old${i}`)));
    const imported = [
      entry("old2", "replacement"),
      entry("imported"),
      entry("imported", "duplicate"),
    ];
    store.importSaved(imported);
    expect(stored()).toHaveLength(20);
    expect(
      stored()
        .slice(0, 3)
        .map((x) => x.id),
    ).toEqual(["replacement", "imported", "old0"]);
    expect(stored().filter((x) => x.name === "old2")).toHaveLength(1);
  });
  it("empty explicit saves and absent deletes do not write", () => {
    const { store, write } = fixture([entry("old")]);
    expect(store.save(" ", "q")).toBe(false);
    expect(store.save("n", " ")).toBe(false);
    expect(store.removeSaved("missing")).toBe(true);
    expect(write).not.toHaveBeenCalled();
  });
  it.each(["save", "remove", "import", "clear"])(
    "failed %s retains the same prior items and reports a shared error",
    (operation) => {
      const { store, write, stored } = fixture([entry("old")]);
      const previous = store.getSnapshot().items;
      write.mockReturnValue(false);
      const ok =
        operation === "save"
          ? store.save("new", "q")
          : operation === "remove"
            ? store.removeSaved("old")
            : operation === "import"
              ? store.importSaved([entry("new")])
              : store.clearSaved();
      expect(ok).toBe(false);
      expect(store.getSnapshot().items).toBe(previous);
      expect(store.getSnapshot().error).toContain("保存できません");
      expect(stored()).toEqual([entry("old")]);
      write.mockImplementation((items) => {
        persistedAfterRetry = structuredClone(items);
        return true;
      });
      let persistedAfterRetry: readonly SavedSearch[] = [];
      expect(store.save("retry", "q")).toBe(true);
      expect(store.getSnapshot().error).toBeNull();
      expect(persistedAfterRetry.map((x) => x.name)).toEqual(["retry", "old"]);
    },
  );
  it("an unexpected persistence throw cannot discard a snapshot or reach the UI as a raw error", () => {
    const { store, write } = fixture([entry("old")]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    write.mockImplementation(() => {
      throw new Error("synthetic storage failure");
    });
    expect(store.importSaved([entry("new")])).toBe(false);
    expect(store.getSnapshot().items[0].name).toBe("old");
    expect(store.getSnapshot().error).not.toContain("synthetic storage");
    log.mockRestore();
  });
  it("last unsubscribe reloads persisted data on later mount without retaining stale cache", () => {
    let data = [entry("before")];
    const store = createSavedSearchStore(
      () => data,
      () => true,
    );
    const off = store.subscribe(() => {});
    expect(store.getSnapshot().items[0].name).toBe("before");
    off();
    data = [entry("after")];
    const off2 = store.subscribe(() => {});
    expect(store.getSnapshot().items[0].name).toBe("after");
    off2();
  });
});
