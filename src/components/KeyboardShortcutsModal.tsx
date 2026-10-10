"use client";

import Modal from "./Modal";
import { SHORTCUTS } from "../config/shortcuts";

interface Props {
  onClose: () => void;
}

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
      <section className="border-t border-border-default px-4 py-3 text-xs leading-5 text-text-soft">
        <h3 className="font-medium text-text-default">ショートカット操作と通常の操作</h3>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>
            フィードをビュー（記事・画像・動画・SNS）へ移す: フィードのドラッグ&amp;ドロップのほか、
            フィードのメニューの「表示: …」から選べます。
          </li>
          <li>
            プッシュ通知のテスト送信:
            通知をオンにすると、その他のメニューに「テスト通知を送信」が出ます。
            通知項目の右クリックでも送信できます。
          </li>
        </ul>
      </section>
      <section className="border-t border-border-default px-4 py-3 text-xs leading-5 text-text-soft">
        <h3 className="font-medium text-text-default">表示モードの解除</h3>
        <p>
          NSFWモードが有効なときは、ユーザー設定の「NSFW表示」で解除、または
          Tabで選んでEnter・Spaceで解除できます。RSSロゴの長押し（600ms）でも解除できます。
          解除後も、現在開いている記事は閉じません。
        </p>
      </section>
    </Modal>
  );
}
