"use client";

import Modal from "./Modal";

interface Props {
  onClose: () => void;
}

const SHORTCUTS: [string, string][] = [
  ["j / ↓", "次の記事"],
  ["k / ↑", "前の記事"],
  ["n", "次の未読記事へ"],
  ["p", "前の未読記事へ"],
  ["o", "元記事を開く"],
  ["v", "全文を取得"],
  ["b", "ブックマーク切替"],
  ["L", "いいね切替"],
  ["t", "リーディングリスト切替"],
  ["r", "既読 / 未読切替"],
  ["m", "全既読にする"],
  ["u", "未読フィルター切替"],
  ["B", "ブックマークフィルター切替"],
  ["d", "日付フィルター切替"],
  ["s", "ソート順切替"],
  ["c", "リンクをコピー"],
  ["f", "フォントサイズ切替"],
  ["l", "レイアウト切替"],
  ["/", "記事を検索"],
  ["] / [", "次 / 前のフィード"],
  ["?", "このヘルプを表示"],
];

export default function KeyboardShortcutsModal({ onClose }: Props) {
  return (
    <Modal title="キーボードショートカット" onClose={onClose} width="sm:w-72">
      <ul className="space-y-2 px-4 py-3">
        {SHORTCUTS.map(([key, desc]) => (
          <li key={key} className="flex items-center justify-between">
            <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border-default bg-surface-base text-text-muted">
              {key}
            </kbd>
            <span className="text-[12px] text-text-soft">{desc}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
