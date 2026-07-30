import { useEffect, useId, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { useSyncedRef } from "../../hooks/useSyncedRef";
import { useEventListener } from "../../hooks/useEventListener";
import { usePopupLock } from "../../hooks/usePopupLock";
import { useModalFocusTrap } from "../../hooks/useModalFocusTrap";
import { FallbackImage } from "../FallbackImage";

interface Props {
  images: string[];
}

export default function ImageGallery({ images }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const lightboxTouchRef = useRef<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const lightboxRef = useSyncedRef({ lightboxIndex, imageCount: images.length });

  // #894: lightbox を document.body へ portal して、ArticleDetailOverlay の
  // animate-slide-in-right の transform 由来 containing block から逃がす
  // (transform を持つ祖先要素は position: fixed の containing block になるため、
  // portal なしだと lightbox が記事詳細領域に閉じ込められて全画面表示できない)。
  useEffect(() => {
    setMounted(true);
  }, []);

  // ライトボックス表示中はリサイズバーを無効化する（Issue #81）
  usePopupLock(lightboxIndex !== null);

  // #791: WCAG 2.4.3 Focus Order / 4.1.2 Name/Role/Value 準拠。
  // useModalFocusTrap (#790 Phase 1 canonical) で open 時に dialog へ focus 移動 +
  // close 時にトリガーボタン (画像サムネ) へ focus 復元 + Tab cycle + Escape close。
  const { handleKeyDown: dialogKeyDown } = useModalFocusTrap(dialogRef, {
    isOpen: lightboxIndex !== null,
    onClose: () => setLightboxIndex(null),
  });

  // ArrowLeft / ArrowRight は global keydown で listen (lightbox 内に focus 移動するが、
  // 画像クリックで focus が <button> に移ったときも Arrow ナビ可能にするため global 維持)。
  // Escape は dialog onKeyDown (useModalFocusTrap) で処理するため global からは削除。
  useEventListener("keydown", (e) => {
    const { lightboxIndex: idx, imageCount } = lightboxRef.current;
    if (idx === null) return;
    if (e.key === "ArrowLeft") setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
    if (e.key === "ArrowRight")
      setLightboxIndex((i) => (i !== null && i < imageCount - 1 ? i + 1 : i));
  });

  function handleLightboxTouchStart(e: TouchEvent) {
    e.stopPropagation();
    lightboxTouchRef.current = e.touches[0].clientX;
  }

  function handleLightboxTouchEnd(e: TouchEvent) {
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
              <FallbackImage
                url={src}
                alt=""
                className="h-24 w-auto max-w-[180px] object-cover rounded bg-surface-subtle"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </section>

      {lightboxIndex !== null &&
        mounted &&
        createPortal(
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={dialogKeyDown}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 outline-none"
            onClick={() => setLightboxIndex(null)}
            onTouchStart={handleLightboxTouchStart}
            onTouchEnd={handleLightboxTouchEnd}
          >
            <h2 id={titleId} className="sr-only">
              画像拡大表示
            </h2>
            {/* #1143: canonical pattern (ImageLightbox.tsx) に揃え。44px タッチターゲット + 境界 disabled 化 */}
            <button
              type="button"
              className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors"
              onClick={() => setLightboxIndex(null)}
              aria-label="閉じる"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
              </svg>
            </button>
            {/* 前へボタン (常時 mount、境界では disabled) */}
            <button
              type="button"
              disabled={lightboxIndex === 0}
              aria-disabled={lightboxIndex === 0}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/40"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex - 1);
              }}
              aria-label="前の画像"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path d="M12 4l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {/* 次へボタン (常時 mount、境界では disabled) */}
            <button
              type="button"
              disabled={lightboxIndex >= images.length - 1}
              aria-disabled={lightboxIndex >= images.length - 1}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/40 text-white hover:bg-black/60 flex items-center justify-center transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-black/40"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(lightboxIndex + 1);
              }}
              aria-label="次の画像"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path d="M8 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <FallbackImage
              url={images[lightboxIndex]}
              alt={`画像 ${lightboxIndex + 1} / ${images.length}`}
              className="max-w-[96vw] max-h-[96vh] object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-[12px] tabular-nums">
              {lightboxIndex + 1} / {images.length}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
