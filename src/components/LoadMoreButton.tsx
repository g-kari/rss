"use client";

import { useState, useRef, useEffect } from "react";
import Spinner from "./Spinner";

interface Props {
  onLoad: () => Promise<void>;
}

export default function LoadMoreButton({ onLoad }: Props) {
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const onLoadRef = useRef(onLoad);
  const containerRef = useRef<HTMLDivElement>(null);

  onLoadRef.current = onLoad;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          setLoading(true);
          onLoadRef.current().finally(() => {
            if (!cancelled) {
              loadingRef.current = false;
              setLoading(false);
            }
          });
        }
      },
      { rootMargin: "600px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="flex justify-center py-4">
      <button
        onClick={async () => {
          if (loadingRef.current) return;
          loadingRef.current = true;
          setLoading(true);
          try {
            await onLoad();
          } finally {
            loadingRef.current = false;
            setLoading(false);
          }
        }}
        disabled={loading}
        aria-busy={loading}
        className="flex items-center gap-1.5 text-[11px] tracking-[0.06em] px-3 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200 disabled:opacity-50"
      >
        {loading ? (
          <Spinner className="w-3 h-3" />
        ) : (
          <svg
            width="11"
            height="11"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 1v10M2 7l4 4 4-4" />
          </svg>
        )}
        {loading ? "読み込み中..." : "過去の記事を読み込む"}
      </button>
    </div>
  );
}
