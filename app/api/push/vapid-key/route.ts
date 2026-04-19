import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";
import { apiError } from "@/lib/api-error";

/** VAPID 公開鍵をクライアントに返す。Push 購読開始時に必要。 */
export async function GET(request: Request) {
  return withSession(request, async () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return apiError("Push notifications not configured", 503, {
        code: "PUSH_NOT_CONFIGURED",
      });
    }

    return NextResponse.json({ publicKey });
  });
}
