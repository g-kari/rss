"use client";

/**
 * FeedContextMenu の各 sub-portal (Mute / View / Digest / Group) で共通の
 * section-header wrapper (3-line pattern) を集約する co-located helper。
 *
 * canonical: `react-component-split.md § 派生ケース「同形 JSX ラッパーが 3 回以上重複 →
 * ポリモーフィック as props 付きラッパーコンポーネント化」`
 *
 * 4 site (`MuteMenuPortal` / `ViewMenuPortal` / `DigestMenuPortal` / `GroupMenuPortal`)
 * の header wrapper を 1 行に簡素化、将来 sub-portal 追加時の drift 予防。
 */
export function MenuSectionHeader({ title }: { title: string }) {
  return (
    <div className="px-3 pt-2 pb-1">
      <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">{title}</p>
    </div>
  );
}
