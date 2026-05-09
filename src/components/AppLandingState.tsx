"use client";

import BetaRestrictedPage from "./BetaRestrictedPage";
import LandingPage from "./LandingPage";

interface UserLike {
  /** 認証完了 user (undefined=ロード中、null=未ログイン、UserLike=ログイン済) */
}

interface AppLandingStateProps {
  user: UserLike | null | undefined;
  betaRestricted: boolean;
}

/**
 * App.tsx の早期 return パスを集約するコンポーネント (#650 Step 2)。
 *
 * - `user === undefined` (auth ロード中) → ローディング点滅
 * - `betaRestricted` → ベータ制限ページ
 * - `user === null` → ランディングページ (未ログイン)
 *
 * いずれにも該当しなければ `null` を返すので、呼び出し側で:
 * ```tsx
 * const landingNode = AppLandingState({ user, betaRestricted });
 * if (landingNode) return landingNode;
 * // ... 通常のメイン UI
 * ```
 * のようなパターンで使う。React コンポーネントとして直接 JSX に置くと、
 * 後続の return との分岐が複雑になるため、関数として呼ぶ運用が前提。
 */
export function AppLandingState({ user, betaRestricted }: AppLandingStateProps) {
  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
      </div>
    );
  }
  if (betaRestricted) return <BetaRestrictedPage />;
  if (!user) return <LandingPage />;
  return null;
}
