"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useOptionalReaderSettings, type ReaderSettings } from "../contexts/ReaderSettingsContext";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";
import { FOCUSABLE_SELECTOR } from "../lib/modal-focus";
import { usePopupLock } from "../hooks/usePopupLock";
import {
  FONT_SIZE_CYCLE,
  FONT_SIZE_LABELS,
  FONT_FAMILY_CYCLE,
  FONT_FAMILY_LABELS,
} from "../lib/article-utils";
import {
  LINE_HEIGHT_CYCLE,
  LINE_HEIGHT_LABELS,
  CONTENT_WIDTH_CYCLE,
  CONTENT_WIDTH_LABELS,
} from "../lib/reader-settings";

function SettingSelect<T extends string>({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const controlId = useId();
  return (
    <div className="flex items-center justify-between gap-3 text-[14px]">
      <label htmlFor={controlId}>{label}</label>
      <select
        id={controlId}
        className="min-h-11 w-36 rounded border border-border-default bg-surface-base px-2 text-text-strong"
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option === event.target.value);
          if (next !== undefined) onChange(next);
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

function SettingsPanel({
  settings,
  onClose,
  trigger,
  panelId,
  top,
  right,
}: {
  settings: ReaderSettings;
  onClose: () => void;
  trigger: RefObject<HTMLButtonElement | null>;
  panelId: string;
  top: number;
  right: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { handleKeyDown } = useModalFocusTrap(ref, {
    onClose,
    captureEscape: true,
    returnFocusEl: trigger.current,
    preventScrollOnReturn: true,
  });
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !ref.current?.contains(event.target) &&
        !trigger.current?.contains(event.target)
      ) {
        // A background pointer must not clear the focus restored during effect cleanup.
        // Interactive outside controls retain their own native focus/click behavior.
        if (event.target instanceof Element && !event.target.closest(FOCUSABLE_SELECTOR))
          event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose, trigger]);
  return createPortal(
    <div
      ref={ref}
      id={panelId}
      role="dialog"
      data-print="hide"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed z-[80] w-[360px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-xl border border-border-default bg-surface-elevated p-3 sm:p-4 text-text-strong shadow-xl"
      style={{ top, right, maxHeight: `calc(100dvh - ${top + 8}px)` }}
      onWheel={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        handleKeyDown(event);
      }}
    >
      <div className="mb-2 sm:mb-3 flex items-center justify-between gap-3">
        <h2 id={titleId} className="text-[16px] font-medium">
          読書設定
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded px-3 text-[14px] hover:bg-surface-hover"
        >
          閉じる
        </button>
      </div>
      <div className="space-y-1 sm:space-y-2">
        <SettingSelect
          label="文字サイズ"
          value={settings.fontSize}
          options={FONT_SIZE_CYCLE}
          labels={FONT_SIZE_LABELS}
          onChange={settings.onChangeFontSize}
        />
        <SettingSelect
          label="フォント"
          value={settings.fontFamily}
          options={FONT_FAMILY_CYCLE}
          labels={FONT_FAMILY_LABELS}
          onChange={settings.onChangeFontFamily}
        />
        <SettingSelect
          label="行間"
          value={settings.lineHeight}
          options={LINE_HEIGHT_CYCLE}
          labels={LINE_HEIGHT_LABELS}
          onChange={settings.onChangeLineHeight}
        />
        <SettingSelect
          label="本文の幅"
          value={settings.contentWidth}
          options={CONTENT_WIDTH_CYCLE}
          labels={CONTENT_WIDTH_LABELS}
          onChange={settings.onChangeContentWidth}
        />
        <SettingSelect
          label="テーマ"
          value={settings.theme}
          options={["light", "dark"]}
          labels={{ light: "ライト", dark: "ダーク" }}
          onChange={settings.setTheme}
        />
      </div>
      <p className="mt-2 sm:mt-3 text-[12px] text-text-muted">
        変更はすぐ反映・保存されます。
        <span className="sr-only sm:not-sr-only">
          ほかの設定はサイドバーの「設定」から開けます。
        </span>
      </p>
    </div>,
    document.body,
  );
}

/** #1385: Quick controls are presentation-only; advanced/automatic operations stay in Settings. */
export default function QuickReadingSettings() {
  const settings = useOptionalReaderSettings();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 8, right: 8 });
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  usePopupLock(open);
  const close = useCallback(() => setOpen(false), []);
  if (!settings) return null;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className="min-h-11 [@media(pointer:fine)]:min-h-8 flex-shrink-0 rounded border border-border-default px-2 text-control text-text-strong hover:bg-surface-hover"
        onClick={() => {
          const rect = trigger.current?.getBoundingClientRect();
          if (rect)
            setPosition({
              top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 400)),
              right: Math.max(8, Math.min(window.innerWidth - rect.right, window.innerWidth - 368)),
            });
          setOpen((previous) => !previous);
        }}
      >
        読書設定
      </button>
      {open && (
        <SettingsPanel
          settings={settings}
          onClose={close}
          trigger={trigger}
          panelId={panelId}
          {...position}
        />
      )}
    </>
  );
}
