import React, { useRef, useState } from "react";
import { useSyncedRef } from "../../hooks/useSyncedRef";
import { useEventListener } from "../../hooks/useEventListener";
import { usePopupLock } from "../../hooks/usePopupLock";

interface Props {
  images: string[];
}

export default function ImageGallery({ images }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const lightboxTouchRef = useRef<number | null>(null);
  const lightboxRef = useSyncedRef({ lightboxIndex, imageCount: images.length });

  // ライトボックス表示中はリサイズバーを無効化する（Issue #81）
  usePopupLock(lightboxIndex !== null);

  useEventListener("keydown", (e) => {
    const { lightboxIndex: idx, imageCount } = lightboxRef.current;
    if (idx === null) return;
    if (e.key === "Escape") setLightboxIndex(null);
    if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
    if (e.key === "ArrowRight")
      setLightboxIndex((i) => (i !== null && i < imageCount - 1 ? i + 1 : i));
  });

  function handleLightboxTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    lightboxTouchRef.current = e.touches[0].clientX;
  }

  function handleLightboxTouchEnd(e: React.TouchEvent) {
    e.stopPropagation();
    if (lightboxTouchRef.current === null || lightboxIndex === null) return;
    const dx = e.changedTouches[0].clientX - lightboxTouchRef.current;
    lightboxTouchRef.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && lightboxIndex < images.length - 1) setLightboxIndex(lightboxIndex + 1);
    else if (dx > 0 && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
  }

  return (
    <>
      <section className="mt-8 pt-6 border-t border-border-subtle">
        <p className="text-[10px] tracking-[0.2em] uppercase text-text-muted mb-3">画像一覧</p>
        <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {images.map((src, i) => (
            <button
              key={i}
              onClick={() => setLightboxIndex(i)}
              aria-label={`画像 ${i + 1} を拡大`}
              className="flex-shrink-0 cursor-zoom-in"
            >
              <img
                src={src}
                alt=""
                className="h-24 w-auto max-w-[180px] object-cover rounded bg-surface-subtle"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxIndex(null)}
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightboxIndex(null)}
            aria-label="閉じる"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {lightboxIndex > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              aria-label="前の画像"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.75 19.5L8.25 12l7.5-7.5"
                />
              </svg>
            </button>
          )}
          {lightboxIndex < images.length - 1 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              aria-label="次の画像"
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}
          <img
            src={images[lightboxIndex]}
            alt=""
            className="max-w-[90vw] max-h-[90vh] object-contain rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-[12px] tabular-nums">
            {lightboxIndex + 1} / {images.length}
          </p>
        </div>
      )}
    </>
  );
}
