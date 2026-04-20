"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import Modal from "./Modal";
import { apiFetch } from "../lib/api-fetch";

interface Props {
  onClose: () => void;
}

interface ReleaseNotesResponse {
  content: string;
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

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
      // skip
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
  const [sections, setSections] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState(false);

  const fetchNotes = useCallback((currentOffset: number, append: boolean) => {
    const setter = append ? setLoadingMore : setLoading;
    setter(true);
    apiFetch(`/api/release-notes?offset=${currentOffset}&limit=10`)
      .then((r) => r.json() as Promise<ReleaseNotesResponse>)
      .then((data) => {
        setSections((prev) => (append ? prev + "\n\n" + data.content : data.content));
        setHasMore(data.hasMore);
        setOffset(currentOffset + data.limit);
      })
      .catch(() => setError(true))
      .finally(() => setter(false));
  }, []);

  useEffect(() => {
    fetchNotes(0, false);
  }, [fetchNotes]);

  const handleLoadMore = () => {
    fetchNotes(offset, true);
  };

  return (
    <Modal title="リリースノートだよっ" onClose={onClose}>
      <div className="overflow-y-auto max-h-[calc(80vh-52px)] px-5 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
          </div>
        ) : error ? (
          <p className="text-[12px] text-text-muted">読み込みに失敗しました</p>
        ) : (
          <>
            {parseMarkdown(sections)}
            {hasMore && (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="mt-4 mb-2 w-full py-2 text-[12px] text-text-muted hover:text-text-default border border-border-subtle rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-50"
              >
                {loadingMore ? "読み込み中..." : "もっと見るっ"}
              </button>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
