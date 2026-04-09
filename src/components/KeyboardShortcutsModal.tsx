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
  ["x", "ランダム未読記事へ"],
  ["g", "先頭の記事へ"],
  ["G", "末尾の記事へ"],
  ["o", "元記事を開く"],
  ["v", "全文を取得"],
  ["a", "AI 要約"],
  ["P", "読み上げ開始 / 停止"],
  ["Space / Shift+Space", "記事を下 / 上にスクロール"],
  ["b", "ブックマーク切替"],
  ["L", "いいね切替"],
  ["R", "フィードを更新"],
  ["t", "リーディングリスト切替"],
  ["r", "既読 / 未読切替"],
  ["z", "スヌーズ（期間選択）"],
  ["e", "現在記事より上を全既読"],
  ["m", "全既読にする"],
  ["u", "未読フィルター切替"],
  ["B", "ブックマークフィルター切替"],
  ["T", "リーディングリストフィルター切替"],
  ["I", "いいねフィルター切替"],
  ["d", "日付フィルター切替"],
  ["w", "読了時間フィルター切替"],
  ["s", "ソート順切替"],
  ["c", "リンクをコピー"],
  ["C", "Markdownリンクをコピー"],
  ["f", "フォントサイズ切替"],
  ["F", "フォントファミリー切替 (ゴシック / 明朝 / 等幅)"],
  ["l", "レイアウト切替"],
  ["/", "記事を検索"],
  ["] / [", "次 / 前のフィード"],
  ["q", "フィードクイックスイッチャー"],
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
