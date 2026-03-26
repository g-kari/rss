import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";

/** VAPID 公開鍵をクライアントに返す。Push 購読開始時に必要。 */
export async function GET() {
  return withSession(async () => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) {
      return NextResponse.json({ error: "Push notifications not configured" }, { status: 503 });
    }

    return NextResponse.json({ publicKey });
  });
}
