"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  parseSlideUrl,
  getSlideSourceUrl,
  getSlidePageProvider,
  type SlideEmbed,
} from "../../lib/slide-providers";
import { usePopupLock } from "../../hooks/usePopupLock";

interface Props {
  url: string;
  title: string;
  sourceUrl?: string;
}

/** Key by deck, not display size: article navigation resets while expansion preserves the page. */
export default function SlideViewer({ url, title, sourceUrl }: Props) {
  const slide = parseSlideUrl(url);
  if (slide && sourceUrl && getSlidePageProvider(sourceUrl) === slide.provider)
    slide.pageUrl = getSlideSourceUrl(sourceUrl) ?? slide.pageUrl;
  return slide ? <Viewer key={slide.embedUrl} slide={slide} title={title} /> : null;
}

function Viewer({ slide, title }: { slide: SlideEmbed; title: string }) {
  const [expanded, setExpanded] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  usePopupLock(expanded);
  useEffect(() => {
    if (expanded) closeRef.current?.focus();
  }, [expanded]);
  const close = () => {
    dialogRef.current?.close();
    setExpanded(false);
    triggerRef.current?.focus();
  };
  const expand = () => {
    // Native top-layer promotion keeps the SAME iframe browsing context (and current page).
    // It also escapes transformed article panes and makes the background inert on mobile.
    if (!dialogRef.current || typeof dialogRef.current.showModal !== "function") return;
    dialogRef.current.showModal();
    setExpanded(true);
  };
  return (
    <section
      aria-label="スライド"
      className="mb-6 overflow-hidden rounded-xl border border-border-default"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[12px]">
        <span className="text-text-muted">{slide.label} スライド</span>
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="dialog"
          onClick={expand}
          className="min-h-[44px] px-3 rounded-lg bg-surface-subtle text-text-default hover:bg-surface-hover"
        >
          スライドを拡大
        </button>
      </div>
      <dialog
        ref={dialogRef}
        className="docswell-viewer-dialog"
        style={{ display: expanded ? "flex" : "block" }}
        role={expanded ? "dialog" : "region"}
        aria-modal={expanded || undefined}
        aria-label={expanded ? undefined : `${title} — スライドプレイヤー`}
        aria-labelledby={expanded ? titleId : undefined}
        onKeyDown={(event) => {
          // Top-layer inertness does not stop document shortcuts. Keep keys in the modal
          // without cancelling native Tab, Escape, button activation, or iframe controls.
          if (expanded) event.stopPropagation();
        }}
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClose={() => {
          if (dialogRef.current?.open) return; // Ignore a queued close event after a quick reopen.
          setExpanded(false);
          triggerRef.current?.focus();
        }}
      >
        <div
          hidden={!expanded}
          style={{ display: expanded ? "flex" : "none" }}
          className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border-default shrink-0"
        >
          <h2 id={titleId} className="text-[13px] font-medium text-text-strong truncate">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={close}
            aria-label="閉じる"
            className="min-h-[44px] min-w-[44px] px-3 text-[13px] text-text-default shrink-0"
          >
            閉じる
          </button>
        </div>
        <iframe
          src={slide.embedUrl}
          title={`${title} — ${slide.label} スライド`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          allow="fullscreen"
          allowFullScreen
          referrerPolicy={
            slide.provider === "docswell" ? "no-referrer" : "strict-origin-when-cross-origin"
          }
          className="docswell-viewer-frame"
        />
        <p className="px-3 py-2 text-[11px] text-text-muted shrink-0">
          プレイヤー内の矢印でページを移動できます。表示されない場合は{" "}
          <a
            href={slide.pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            {slide.label} で開く ↗
          </a>
        </p>
      </dialog>
    </section>
  );
}
