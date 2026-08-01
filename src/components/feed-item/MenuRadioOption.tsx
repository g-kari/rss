"use client";

/**
 * FeedContextMenu の各 sub-portal (View / Digest / Group) で共通の
 * `role="menuitemradio"` button + dot indicator (15-line pattern) を集約する
 * co-located helper。
 *
 * canonical: `react-component-split.md § 派生ケース「同形 JSX ラッパーが 3 回以上重複 →
 * ポリモーフィック as props 付きラッパーコンポーネント化」`
 *
 * 3 site (`ViewMenuPortal` / `DigestMenuPortal` / `GroupMenuPortal` の groups.map 内)
 * の radio button + dot 描画を 4-5 行に簡素化、将来 radio menu 追加時の drift 予防
 * (`aria-checked` wiring / `!current` guard / `stopPropagation` / dot indicator class)。
 *
 * onClick 内部で `stopPropagation` + `onClose` + `if (!checked) onSelect()` を統一処理、
 * caller は checked + label + onSelect のみを渡すだけで canonical semantic を継承。
 *
 * 「グループなし」button (`GroupMenuPortal` L293-318) は dot でなく X icon + `disabled`
 * prop を持つ **別 pattern** で本 helper 対象外、独立維持 canonical。
 */
export function MenuRadioOption({
  checked,
  label,
  onSelect,
  onClose,
}: {
  checked: boolean;
  label: string;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
        if (!checked) onSelect();
      }}
      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-surface-subtle transition-colors text-left ${checked ? "text-text-strong bg-surface-subtle" : "text-text-default"}`}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${checked ? "bg-accent-dot" : "bg-transparent border border-text-faint"}`}
      />
      <span className="truncate">{label}</span>
    </button>
  );
}
