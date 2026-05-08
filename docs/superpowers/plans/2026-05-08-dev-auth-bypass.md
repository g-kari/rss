# Dev 認証バイパス + popup-lock e2e カバレッジ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Issue #607 — 開発時のみ有効な認証バイパスを追加し、認証後画面の e2e カバレッジを拡充する。Issue #606 のような popup-lock バグを実 DOM テストで検出可能にする。

**Architecture:**

- `process.env.NODE_ENV !== "production"` && `process.env.DEV_AUTH_BYPASS_USER_ID` の AND 条件でバイパス。Next.js が build 時に NODE_ENV を inline 化するため production ビルドでは dead code 化される。
- バイパスは 2 箇所に入れる：(1) `getAuthSession` — 全 API ルート (`withSession` 経由) で効く、(2) `/api/auth/me` ルート — useAuth hook の応答経路。
- DOM テストフックとして `ThreePaneLayout` の root に `data-popup-open` 属性を追加。

**Tech Stack:** Next.js 16 / Cloudflare Workers / TypeScript / Playwright (e2e)

---

## File Structure

| ファイル                                      | 役割                                                                                                                                                          |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server-auth.ts` (modify)             | `getAuthSession` 冒頭に dev バイパス分岐を追加。`process.env.NODE_ENV !== "production"` で dead code 化。                                                     |
| `app/api/auth/me/route.ts` (modify)           | `GET` 冒頭に dev バイパス分岐を追加。fakeProfile を返す。                                                                                                     |
| `src/components/ThreePaneLayout.tsx` (modify) | `useHasOpenPopup` を取り込み、root の `<div data-layout="root">` に `data-popup-open={hasOpenPopup ? "true" : "false"}` を追加。                              |
| `playwright.config.ts` (modify)               | `webServer.env` に `DEV_AUTH_BYPASS_USER_ID=e2e-test-user` と `NODE_ENV=development` を設定。                                                                 |
| `e2e/dev-auth-bypass.spec.ts` (create)        | dev バイパスの動作確認 + popup-lock e2e（GET /api/auth/me が fake user を返す / `/` 訪問で main app がレンダリングされる / `data-popup-open=false` を確認）。 |
| `.claude/rules/architecture.md` (modify)      | 「環境変数」セクションに `DEV_AUTH_BYPASS_USER_ID` を追記。                                                                                                   |
| `RELEASE_NOTES.md` (modify)                   | テスト追加カテゴリに記録。                                                                                                                                    |

---

## Task 1: getAuthSession に dev バイパスを追加

**Files:**

- Modify: `src/lib/server-auth.ts:221-269`
- Test: `e2e/dev-auth-bypass.spec.ts` (新規 — 後続 Task で活用)

このタスクではユニットテストは書きづらい（cookies() / Cloudflare context に依存）。Task 2 と統合してエンドツーエンドでテストする方針とし、ここでは実装のみ。

- [ ] **Step 1: getAuthSession に dev バイパス分岐を追加**

`src/lib/server-auth.ts` の `getAuthSession` 冒頭に以下を挿入（既存の `const authBaseUrl = ...` の前）：

```ts
// 開発時の認証バイパス（e2e テスト用）。
// - `process.env.NODE_ENV !== "production"` で本番ビルドでは dead code 化される
//   （Next.js が build 時に NODE_ENV を inline して tree-shake で除去するため）
// - `DEV_AUTH_BYPASS_USER_ID` が未設定なら通常のローカル開発でも有効化されない
// 上記 2 条件の AND が揃って初めて fake session を返す。
if (process.env.NODE_ENV !== "production") {
  const bypassUserId = process.env.DEV_AUTH_BYPASS_USER_ID;
  if (bypassUserId && /^[A-Za-z0-9_\-@.]{1,128}$/.test(bypassUserId)) {
    return { userId: bypassUserId };
  }
}
```

- [ ] **Step 2: typecheck**

Run: `npm run typecheck`
Expected: PASS（出力なし）

- [ ] **Step 3: lint**

Run: `npm run check`
Expected: 0 errors（既存 warnings は許容）

---

## Task 2: /api/auth/me に dev バイパスを追加 + e2e で検証 (Red→Green)

**Files:**

- Modify: `app/api/auth/me/route.ts:42-49`
- Create: `e2e/dev-auth-bypass.spec.ts`

- [ ] **Step 1: e2e テストを書く（Red）**

`e2e/dev-auth-bypass.spec.ts` を新規作成：

```ts
import { test, expect } from "@playwright/test";

test.describe("dev 認証バイパス（DEV_AUTH_BYPASS_USER_ID 設定時）", () => {
  test("/api/auth/me が fakeProfile を返す", async ({ request }) => {
    const res = await request.get("/api/auth/me");
    expect(res.status()).toBe(200);
    const data = (await res.json()) as { user: { id: string; sub: string; email: string } | null };
    expect(data.user).not.toBeNull();
    expect(data.user?.id).toBe("e2e-test-user");
    expect(data.user?.sub).toBe("e2e-test-user");
    expect(data.user?.email).toBe("e2e@test.local");
  });
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `npx playwright test e2e/dev-auth-bypass.spec.ts -g "fakeProfile"`
Expected: FAIL（`data.user` is null — まだバイパス未実装）

※ ただし `playwright.config.ts` の env 設定が完了していないと `DEV_AUTH_BYPASS_USER_ID` が dev サーバーに渡らないため、Task 4 を先に実行する必要がある場合は順序を入れ替える。

- [ ] **Step 3: /api/auth/me に dev バイパス分岐を追加**

`app/api/auth/me/route.ts` の `export async function GET()` 直後に挿入：

```ts
// 開発時の認証バイパス（e2e テスト用）。本番ビルドでは NODE_ENV inline により dead code 化。
// src/lib/server-auth.ts の getAuthSession にも同等のバイパスがあり、両方揃って機能する。
if (process.env.NODE_ENV !== "production") {
  const bypassUserId = process.env.DEV_AUTH_BYPASS_USER_ID;
  if (bypassUserId && /^[A-Za-z0-9_\-@.]{1,128}$/.test(bypassUserId)) {
    const fakeProfile: UserProfile = {
      id: bypassUserId,
      sub: bypassUserId,
      email: "e2e@test.local",
      name: "E2E Test User",
      picture: "",
    };
    return NextResponse.json({ user: fakeProfile });
  }
}
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npx playwright test e2e/dev-auth-bypass.spec.ts -g "fakeProfile"`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/lib/server-auth.ts app/api/auth/me/route.ts e2e/dev-auth-bypass.spec.ts
git commit -m "feat: dev 認証バイパスを追加 (#607)"
```

---

## Task 3: playwright.config に env 追加

**Files:**

- Modify: `playwright.config.ts`

- [ ] **Step 1: webServer.env に環境変数を追加**

既存の `webServer` 設定に `env` を追加：

```ts
webServer: {
  command: "npm run dev",
  url: "http://localhost:3000",
  reuseExistingServer: !process.env.CI,
  env: {
    DEV_AUTH_BYPASS_USER_ID: "e2e-test-user",
    // NODE_ENV は npm run dev で自動的に "development" になるので明示不要
  },
},
```

- [ ] **Step 2: 既存 e2e に影響がないことを確認**

Run: `npx playwright test e2e/landing.spec.ts e2e/auth.spec.ts e2e/popup-lock.spec.ts`
Expected: 全テスト PASS

dev バイパスが有効になっても LandingPage は不要（main app に遷移する）ため、landing.spec.ts のテストはバイパス時は失敗する可能性がある。
そのときは landing.spec.ts に `test.skip(!!process.env.DEV_AUTH_BYPASS_USER_ID, "dev バイパス時はスキップ")` を追加する。

- [ ] **Step 3: コミット**

```bash
git add playwright.config.ts e2e/landing.spec.ts
git commit -m "test: playwright で dev 認証バイパス env を有効化 (#607)"
```

---

## Task 4: ThreePaneLayout に data-popup-open 属性追加 + e2e (Red→Green)

**Files:**

- Modify: `src/components/ThreePaneLayout.tsx:15-34`
- Modify: `e2e/dev-auth-bypass.spec.ts`

- [ ] **Step 1: e2e テストを追記（Red）**

`e2e/dev-auth-bypass.spec.ts` に追加：

```ts
test("起動直後の `/` で data-popup-open=false（リサイザー操作可）", async ({ page }) => {
  await page.goto("/");
  // dev バイパスで認証通過 → main app がレンダリングされる
  const root = page.locator('[data-layout="root"]');
  await expect(root).toBeVisible();
  await expect(root).toHaveAttribute("data-popup-open", "false");
});
```

- [ ] **Step 2: テスト実行で失敗を確認**

Run: `npx playwright test e2e/dev-auth-bypass.spec.ts -g "data-popup-open"`
Expected: FAIL（属性が存在しないため）

- [ ] **Step 3: ThreePaneLayout に属性追加**

`src/components/ThreePaneLayout.tsx` を以下に書き換える：

```tsx
"use client";
import { useHasOpenPopup } from "@/hooks/usePopupLock";

interface Props {
  sidebarWidth: number;
  listWidth: number;
  listFocusMode: boolean;
  children: React.ReactNode;
}

export default function ThreePaneLayout({
  sidebarWidth,
  listWidth,
  listFocusMode,
  children,
}: Props) {
  const hasOpenPopup = useHasOpenPopup();
  return (
    <div
      data-layout="root"
      data-popup-open={hasOpenPopup ? "true" : "false"}
      className="relative h-screen overflow-hidden font-sans antialiased bg-surface-base text-text-strong lg:grid"
      style={{
        gridTemplateColumns: listFocusMode ? `0px 1fr 0px` : `${sidebarWidth}px ${listWidth}px 1fr`,
        gridTemplateRows: "100%",
        transition: "grid-template-columns 0.25s ease",
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: テスト実行で成功を確認**

Run: `npx playwright test e2e/dev-auth-bypass.spec.ts -g "data-popup-open"`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/components/ThreePaneLayout.tsx e2e/dev-auth-bypass.spec.ts
git commit -m "test: ThreePaneLayout に data-popup-open 属性を追加 (#607)"
```

---

## Task 5: ドキュメント追記

**Files:**

- Modify: `.claude/rules/architecture.md`
- Modify: `RELEASE_NOTES.md`

- [ ] **Step 1: architecture.md に DEV_AUTH_BYPASS_USER_ID を追記**

「環境変数・シークレット」セクションの `wrangler.toml vars (公開情報)` ブロックの直後または `### Cloudflare Workers シークレット` ブロックの末尾に追加：

````markdown
### 開発時のみの環境変数（dev / e2e 用）

```bash
# 開発・e2e 時のみ認証バイパスを有効化（本番ビルドでは NODE_ENV inline で dead code 化）
DEV_AUTH_BYPASS_USER_ID=e2e-test-user  # 任意の sub 形式の文字列。playwright.config.ts で設定済み
```
````

````

- [ ] **Step 2: RELEASE_NOTES.md にテスト追加カテゴリを追記**

```markdown
### テスト追加っ

- **dev 認証バイパスを追加して認証後画面の e2e カバレッジを拡充したよ〜** — Issue #607。`process.env.NODE_ENV !== "production"` && `DEV_AUTH_BYPASS_USER_ID` の AND 条件で fake session を返す仕組みを `getAuthSession` と `/api/auth/me` の両方に追加。本番ビルドでは NODE_ENV inline で dead code 化されるから安全だよっ。`ThreePaneLayout` に `data-popup-open` 属性も追加して、popup-lock の状態を DOM から検証できるようにしたよ。これで #606 みたいな UI バグが回帰した時、e2e で即検出できる体制になったよっ✅🚀
````

- [ ] **Step 3: コミット**

```bash
git add .claude/rules/architecture.md RELEASE_NOTES.md
git commit -m "docs: dev 認証バイパスの環境変数とリリースノート追加 (#607)"
```

---

## Task 6: master マージ・push

- [ ] **Step 1: 全 e2e 実行**

Run: `npm run test:e2e`
Expected: 全 PASS

- [ ] **Step 2: master にマージ**

```bash
git checkout master
git merge --no-ff feat/issue-607-dev-auth-bypass -m "Merge: dev 認証バイパス追加 (closes #607)"
git branch -d feat/issue-607-dev-auth-bypass
git push origin master
```

- [ ] **Step 3: Issue #607 を CLOSED 確認**

Run: `gh issue view 607 --json state --jq '.state'`
Expected: `CLOSED`

---

## Self-Review チェックリスト

1. **Spec coverage**:
   - [x] dev 認証モック (Task 1, 2)
   - [x] playwright env 設定 (Task 3)
   - [x] data-popup-open 属性 (Task 4)
   - [x] e2e テスト (Task 2, 4)
   - [x] ドキュメント (Task 5)
   - [x] マージ・push (Task 6)

2. **Placeholder scan**: なし。すべて具体コード/コマンド。

3. **Type consistency**:
   - `userId` （server-auth.ts と /api/auth/me で同じ意味で使用）✓
   - `bypassUserId` 正規表現 `/^[A-Za-z0-9_\-@.]{1,128}$/` 一致 ✓
   - `data-popup-open` 属性値 "true" / "false" 一致 ✓
