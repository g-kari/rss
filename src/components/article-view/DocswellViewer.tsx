"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseDocswellUrl, type DocswellSlide } from "../../lib/docswell";
import { usePopupLock } from "../../hooks/usePopupLock";

interface Props {
  url: string;
  title: string;
}

/** Key by deck, not display size: article navigation resets while expansion preserves the page. */
export default function DocswellViewer({ url, title }: Props) {
  const slide = parseDocswellUrl(url);
  return slide ? <Viewer key={slide.embedUrl} slide={slide} title={title} /> : null;
}

function Viewer({ slide, title }: { slide: DocswellSlide; title: string }) {
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
        <span className="text-text-muted">Docswell スライド</span>
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
          title={`${title} — Docswell スライド`}
          loading="lazy"
          sandbox="allow-scripts allow-same-origin"
          allow="fullscreen"
          allowFullScreen
          referrerPolicy="no-referrer"
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
            Docswell で開く ↗
          </a>
        </p>
      </dialog>
    </section>
  );
}
