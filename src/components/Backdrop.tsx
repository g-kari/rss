"use client";

/**
 * Modal / Dialog / Quick-switch などのオーバーレイ UI で共通の暗転 backdrop。
 *
 * Modal.tsx / ConfirmModal.tsx / FeedQuickSwitchModal.tsx で同 JSX
 * (`<div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={...} />`)
 * が 3 重複していたのを集約 (#884 refactor sweep finding F1)。
 *
 * - z-49 は z-50 (modal 本体) の 1 つ下、popover 系より上を意識
 * - `onPointerDown` を使うことで Modal 内コンテンツの mouseup でも閉じない
 *   (Modal 本体側の `onClick={(e) => e.stopPropagation()}` と組み合わせて
 *   「backdrop の押下開始 + リリース」のみで close する canonical pattern)
 */
interface Props {
  /** backdrop の押下開始時に呼ばれる close callback */
  onPointerDown: () => void;
}

export default function Backdrop({ onPointerDown }: Props) {
  return <div className="fixed inset-0 z-[49] bg-black/30" onPointerDown={onPointerDown} />;
}
