"use client";

import { Fragment, createElement, type ReactNode } from "react";

/**
 * テキスト中の検索クエリ語をハイライトした ReactNode を返す。
 * React に依存するため、サーバーサイドコードからは import しないこと。
 * サーバーサイドから必要な関数は article-utils.ts を参照すること。
 */
export function highlightText(text: string, query: string): ReactNode {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizedQuery ? normalizedQuery.split(/\s+/) : [];
  if (terms.length === 0) return text;

  // 全ワードの出現位置を収集
  const lowerText = text.toLowerCase();
  const matches: { start: number; end: number }[] = [];
  for (const term of terms) {
    let idx = lowerText.indexOf(term);
    while (idx !== -1) {
      matches.push({ start: idx, end: idx + term.length });
      idx = lowerText.indexOf(term, idx + 1);
    }
  }
  if (matches.length === 0) return text;

  // 開始位置でソートし、重複区間をマージ
  matches.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const m of matches) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) {
      last.end = Math.max(last.end, m.end);
    } else {
      merged.push({ ...m });
    }
  }

  const parts: ReactNode[] = [];
  let pos = 0;
  let key = 0;
  for (const { start, end } of merged) {
    if (start > pos) parts.push(text.slice(pos, start));
    parts.push(
      createElement(
        "mark",
        {
          key: key++,
          style: {
            background: "var(--color-highlight)",
            color: "inherit",
            borderRadius: "2px",
            paddingInline: "1px",
          },
        },
        text.slice(start, end),
      ),
    );
    pos = end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return createElement(Fragment, null, ...parts);
}
