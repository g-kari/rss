import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import {
  ClipTokenConflictError,
  createClipToken,
  getClipToken,
  revokeClipToken,
} from "@/lib/clip-token";
import { matchesPushAccount } from "@/lib/push-config";
import { withSession } from "@/lib/server-auth";

async function withTokenSession(
  request: Request,
  action: (bucket: R2Bucket, userId: string) => Promise<NextResponse>,
) {
  // Keep the ordinary session and same-origin CSRF boundary for all token
  // management. A clip bearer credential can never issue or revoke credentials.
  const response = await withSession(request, async ({ session, env }) => {
    try {
      const expectedId = request.headers.get("X-RSS-Account-Id");
      if (
        expectedId !== null &&
        !(await matchesPushAccount(env.RSS_DATA, session.userId, expectedId))
      ) {
        return apiError("The signed-in account changed", 409, { code: "ACCOUNT_CHANGED" });
      }
      return await action(env.RSS_DATA, session.userId);
    } catch (error) {
      if (error instanceof ClipTokenConflictError) {
        return apiError("Token changed concurrently; refresh and try again", 409, {
          code: "CLIP_TOKEN_CONFLICT",
          retryable: true,
        });
      }
      // Never echo or log storage/crypto errors on a credential-management path.
      return apiError("Token storage is temporarily unavailable", 503, {
        code: "CLIP_TOKEN_UNAVAILABLE",
        retryable: true,
      });
    }
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  return withTokenSession(request, async (bucket, userId) =>
    NextResponse.json({ token: await getClipToken(bucket, userId) }),
  );
}

/** Body-free, explicit creation/rotation. No user, scope or lifetime overrides. */
export async function POST(request: Request) {
  return withTokenSession(request, async (bucket, userId) =>
    NextResponse.json(await createClipToken(bucket, userId), { status: 201 }),
  );
}

export async function DELETE(request: Request) {
  return withTokenSession(request, async (bucket, userId) => {
    await revokeClipToken(bucket, userId);
    return NextResponse.json({ ok: true });
  });
}
