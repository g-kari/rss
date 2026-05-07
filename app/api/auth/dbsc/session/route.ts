import { NextResponse } from "next/server";
import { withSession } from "@/lib/server-auth";

/**
 * DELETE /api/auth/dbsc/session — DBSC バインド済みデバイスの登録を解除する
 *
 * @returns 204 No Content — 削除成功（キーが存在しなくても 204 を返す）
 */
export async function DELETE(req: Request) {
  return withSession(req, async ({ session, env }) => {
    await env.RSS_DATA.delete(`users/${session.userId}/dbsc-session.json`);
    return new NextResponse(null, { status: 204 });
  });
}
