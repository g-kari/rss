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
    </Modal>
  );
}
