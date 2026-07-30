import { isValidUserId } from "@/lib/validation";
import type { UserProfile } from "@/types";

/**
 * 開発時の認証バイパス（e2e テスト用）。
 *
 * 以下 2 条件の AND が揃った時のみ有効：
 * - `process.env.NODE_ENV !== "production"` — Next.js が build 時に NODE_ENV を inline
 *   するため production ビルドでは dead code として除去される
 * - `process.env.DEV_AUTH_BYPASS_USER_ID` がセット済み + 正規表現で sub フォーマットを満たす
 *
 * 上記が満たされた時は `userId` を返す。それ以外は `null`。
 *
 * `next/*` 非依存の純粋関数として切り出してあり、`getAuthSession`（withSession 経由の
 * 全 API ルート）と `/api/auth/me` の両方から共有する。
 */
export function getDevBypassUserId(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const id = process.env.DEV_AUTH_BYPASS_USER_ID;
  if (!id) return null;
  if (!isValidUserId(id)) return null;
  return id;
}

/** dev バイパス時に `/api/auth/me` が返す fakeProfile を生成する。 */
export function buildDevBypassProfile(userId: string): UserProfile {
  return {
    id: userId,
    sub: userId,
    email: "e2e@test.local",
    name: "E2E Test User",
    picture: "",
  };
}
