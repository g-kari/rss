"use client";

import { useState, useRef, useEffect } from "react";
import { useSyncedRef } from "../hooks/useSyncedRef";
import Spinner from "./Spinner";
import { useToast } from "@/contexts/ToastContext";
import { devError } from "@/lib/dev-log";

interface Props {
  onLoad: () => Promise<void>;
}

export default function LoadMoreButton({ onLoad }: Props) {
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  // react-hook-patterns.md § stale closure 回避パターン: render ごとの手動代入でなく
  // useSyncedRef に統一する。
  const onLoadRef = useSyncedRef(onLoad);
  const toastRef = useSyncedRef(toast);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) {
          loadingRef.current = true;
          setLoading(true);
          onLoadRef
            .current()
            .catch((err) => {
              if (!cancelled) {
                devError("[LoadMoreButton] onLoad failed", err);
                toastRef.current.error("過去記事の取得に失敗しました");
              }
            })
            .finally(() => {
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

    // 画像の遅延ロードによるコンテナ高さ変化を検知して IntersectionObserver を再評価する
    const ro = new ResizeObserver(() => {
      if (loadingRef.current) return;
      observer.unobserve(el);
      observer.observe(el);
    });
    ro.observe(el.parentElement ?? el);

    return () => {
      cancelled = true;
      observer.disconnect();
      ro.disconnect();
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
          } catch (err) {
            devError("[LoadMoreButton] onLoad failed", err);
            toast.error("過去記事の取得に失敗しました");
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
            aria-hidden="true"
          >
            <path d="M6 1v10M2 7l4 4 4-4" />
          </svg>
        )}
        {loading ? "読み込み中..." : "過去の記事を読み込む"}
      </button>
    </div>
  );
}
