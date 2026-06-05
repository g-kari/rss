"use client";

import { type PointerEventHandler } from "react";

/**
 * Modal / Dialog / Quick-switch / portal dropdown menu / context menu などのオーバーレイ UI で共通の backdrop。
 *
 * Modal.tsx / ConfirmModal.tsx / FeedQuickSwitchModal.tsx で同 JSX
 * (`<div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={...} />`)
 * が 3 重複していたのを集約 (#884 refactor sweep finding F1)。
 * その後 usePortalMenu 系 (SnoozeMenu / FilterMenu / GlobalFilterMenu / ShareMenu /
 * CollectionDropdown) の透明 click-catcher backdrop 5 重複も `transparent` prop で集約 (#1095)。
 *
 * - z-49 は z-50 (modal / menu 本体) の 1 つ下、popover 系より上を意識
 * - `onPointerDown` を使うことで Modal 内コンテンツの mouseup でも閉じない
 *   (Modal 本体側の `onClick={(e) => e.stopPropagation()}` と組み合わせて
 *   「backdrop の押下開始 + リリース」のみで close する canonical pattern)
 * - `transparent` は dropdown menu の click-catcher 用 (暗転なし)。menu 本体は z-50 で
 *   backdrop (z-49) の手前にあるため、backdrop への pointerdown は常に menu 外 = 無条件 close でよい
 */
interface Props {
  /** backdrop の押下開始時に呼ばれる close callback (引数なし caller は event を無視するだけで互換、context menu は e.stopPropagation() に使う) */
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  /** true で暗転なし (dropdown menu / context menu の click-catcher 用)。default false (modal の暗転 backdrop) */
  transparent?: boolean;
}

export default function Backdrop({ onPointerDown, transparent = false }: Props) {
  return (
    <div
      className={`fixed inset-0 z-[49]${transparent ? "" : " bg-black/30"}`}
      onPointerDown={onPointerDown}
    />
  );
}
