"use client";

import type { CSSProperties, ReactNode } from "react";
import type { VirtualItem } from "@tanstack/react-virtual";

interface Props {
  /** virtualizer.getVirtualItems() の各要素 */
  vItem: VirtualItem;
  /** virtualizer.measureElement (要素サイズ自動測定) */
  measureRef: (el: Element | null) => void;
  /** 削除/追加アニメーション中なら transform に transition を付与 */
  animating: boolean;
  /** レイアウト固有の追加スタイル (例: CardBody の padding) */
  extraStyle?: CSSProperties;
  children: ReactNode;
}

/**
 * `@tanstack/react-virtual` の virtualizer item を絶対配置でラップする共通コンポーネント (#692)。
 *
 * `CompactListBody` / `CardBody` / `MagazineBody` で重複していた `<div style={{ position: "absolute"...}}>`
 * ブロックを集約。translateY による配置 + 削除/追加アニメーション中の transition を統一。
 *
 * Why: 3 ファイルでほぼ同一の絶対配置スタイルが重複していて、virtualizer の挙動を変える際に
 * 3 箇所同期修正が必要だった。本ヘルパーで共通化することで保守性向上。
 */
export function VirtualRow({ vItem, measureRef, animating, extraStyle, children }: Props) {
  return (
    <div
      key={vItem.key}
      data-index={vItem.index}
      ref={measureRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        transform: `translateY(${vItem.start}px)`,
        transition: animating ? "transform 0.2s ease" : undefined,
        ...extraStyle,
      }}
    >
      {children}
    </div>
  );
}
