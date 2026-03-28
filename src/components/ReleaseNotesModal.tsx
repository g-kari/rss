"use client";

import { useState, useEffect, type ReactNode } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api-fetch";

interface Props {
  onClose: () => void;
}

/** Markdown の簡易パーサー。見出し・箇条書き・太字に対応 */
function parseMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const nodes: ReactNode[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("# ")) {
      nodes.push(
        <h1 key={key++} className="text-[18px] font-light text-text-strong mb-4 mt-2">
          {line.slice(2)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      nodes.push(
        <h2
          key={key++}
          className="text-[13px] font-medium text-text-strong mt-5 mb-2 pb-1 border-b border-border-subtle"
        >
          {line.slice(3)}
        </h2>,
      );
    } else if (line.startsWith("### ")) {
      nodes.push(
        <h3
          key={key++}
          className="text-[10px] font-medium tracking-[0.2em] uppercase text-text-muted mt-3 mb-1"
        >
          {line.slice(4)}
        </h3>,
      );
    } else if (line.startsWith("- ")) {
      // 箇条書きをまとめて ul に
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(
          <li key={key++} className="text-[12px] text-text-soft leading-relaxed">
            {renderInline(lines[i].slice(2))}
          </li>,
        );
        i++;
      }
      nodes.push(
        <ul key={key++} className="space-y-0.5 mb-1 list-none pl-3">
          {items}
        </ul>,
      );
      continue;
    } else if (line.trim() === "") {
      // 空行は無視
    } else {
      nodes.push(
        <p key={key++} className="text-[12px] text-text-soft leading-relaxed">
          {renderInline(line)}
        </p>,
      );
    }
    i++;
  }
  return nodes;
}

/** インライン装飾（太字 `**text**`、コード `` `code` ``）を変換 */
function renderInline(text: string): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      parts.push(
        <strong key={key++} className="text-text-default font-medium">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined) {
      parts.push(
        <code
          key={key++}
          className="text-[11px] px-1 py-0.5 rounded bg-surface-subtle text-text-default font-mono"
        >
          {match[2]}
        </code>,
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
}

export default function ReleaseNotesModal({ onClose }: Props) {
  const [content, setContent] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/release-notes")
      .then((r) => r.json() as Promise<{ content: string }>)
      .then(({ content: md }) => setContent(md))
      .catch(() => setContent("読み込みに失敗しました"));
  }, []);

  return (
    <Modal title="リリースノート" onClose={onClose}>
      <div className="overflow-y-auto max-h-[calc(80vh-52px)] px-5 py-4">
        {content === null ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
          </div>
        ) : (
          parseMarkdown(content)
        )}
      </div>
    </Modal>
  );
}
