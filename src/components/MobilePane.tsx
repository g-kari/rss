"use client";

import type { ReactNode, ElementType, CSSProperties } from "react";
import { type MobilePane as MobilePaneId, getMobilePaneTransform } from "../hooks/useMobilePane";

interface MobilePaneProps {
  /** このペイン自身の識別子 */
  pane: MobilePaneId;
  /** 現在アクティブなペイン (`useMobilePane` の `mobilePane`) */
  currentPane: MobilePaneId;
  /** PC レイアウトかどうか — false なら非アクティブペインを `aria-hidden` + `inert` でアクセス不可にする */
  isDesktop: boolean;
  children: ReactNode;
  /** デフォルトは `div`。中央ペインで `<main>` を使いたい場合に指定 */
  as?: ElementType;
  /** mobile-pane クラスに加える追加クラス */
  className?: string;
  /** 追加 style は transform と merge される */
  style?: CSSProperties;
  /** id 属性 (skip-to-content 用などに使う) */
  id?: string;
  /** tabIndex 属性 (フォーカス可能にしたい場合に -1 など) */
  tabIndex?: number;
}

/**
 * 3 ペインレイアウト (sidebar / list / view) の各ペインを包むラッパー (#650 Step 1o)。
 *
 * モバイル時はスライドアニメーションで切り替え、PC 時は常時表示。
 * 元々 App.tsx 内に **`<div data-pane=... className="..." style="..." aria-hidden inert>`**
 * のパターンが 3 回 (sidebar/list/view) 重複していた。本コンポーネントに集約することで:
 *
 * 1. `aria-hidden` / `inert` の同期ロジック (PC 時は無効) を 1 箇所に閉じ込める
 * 2. transform スタイルの呼び出しを 1 箇所に閉じ込める
 * 3. data-pane 属性 + mobile-pane class の付与を強制
 *
 * 中央ペインだけ `<main>` 要素を使う (a11y 上 main landmark は 1 つに) ため
 * `as` prop で要素タイプを切り替え可能にしてある。
 */
export function MobilePane({
  pane,
  currentPane,
  isDesktop,
  children,
  as: Tag = "div",
  className = "",
  style,
  id,
  tabIndex,
}: MobilePaneProps) {
  const isInactiveOnMobile = !isDesktop && currentPane !== pane;
  return (
    <Tag
      id={id}
      tabIndex={tabIndex}
      data-pane={pane}
      className={`absolute inset-0 lg:relative lg:inset-auto overflow-hidden mobile-pane${className ? ` ${className}` : ""}`}
      style={{ transform: getMobilePaneTransform(pane, currentPane), ...style }}
      aria-hidden={isInactiveOnMobile || undefined}
      inert={isInactiveOnMobile || undefined}
    >
      {children}
    </Tag>
  );
}
