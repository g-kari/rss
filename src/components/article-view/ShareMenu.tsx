import React, { useRef } from "react";
import { createPortal } from "react-dom";
import type { Article, Feed } from "../../types";
import { usePortalMenu } from "../../hooks/usePortalMenu";
import { useToast } from "@/contexts/ToastContext";
import { storageGet, STORAGE_KEYS } from "../../lib/storage";
import { articleToMarkdown } from "../../lib/html-to-markdown";
import { buildObsidianUri } from "../../lib/obsidian";
import { MENU_ITEM_CLS } from "./constants";
import { SHARE_TARGETS } from "./shareTargets";

interface Props {
  article: Article;
  feed?: Feed;
  contentHtml?: string;
}

export default function ShareMenu({ article, feed, contentHtml }: Props) {
  const toast = useToast();
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();
  const menuRef = useRef<HTMLDivElement>(null);

  function handleSlackShare() {
    const text = `${article.title}\n${article.link!}`;
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("コピーしました。Slack を開きます");
        window.open("slack://open", "_blank", "noopener,noreferrer");
      })
      .catch(() => toast.error("コピーに失敗しました"));
  }

  function handleDiscordShare() {
    const text = `${article.title}\n${article.link!}`;
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast.success("コピーしました。Discord を開きます");
        window.open("discord://", "_blank", "noopener,noreferrer");
      })
      .catch(() => toast.error("コピーに失敗しました"));
  }

  function openShareWindow(url: string) {
    setOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyText(text: string, successMsg: string) {
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(successMsg))
      .catch(() => toast.error("コピーに失敗しました"));
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="共有 (c)"
        aria-label="共有"
        className={`p-2 -m-2 lg:p-0 lg:m-0 transition-colors duration-200 ${open ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
      >
        <svg
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
          <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      {open &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[49]"
              onPointerDown={(e) => {
                if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
              }}
            />
            <div
              ref={menuRef}
              className="fixed z-50 bg-surface-elevated border border-border-default rounded-lg shadow-lg overflow-hidden min-w-[140px]"
              style={{ top: pos.top, right: pos.right }}
            >
              {typeof navigator.share === "function" && (
                <button
                  onClick={() => {
                    setOpen(false);
                    navigator.share({ url: article.link!, title: article.title }).catch(() => {});
                  }}
                  className={MENU_ITEM_CLS}
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  システムで共有
                </button>
              )}
              {SHARE_TARGETS.map(({ id, label, buildUrl, icon }) => (
                <button
                  key={id}
                  onClick={() => openShareWindow(buildUrl(article.link!, article.title))}
                  className={MENU_ITEM_CLS}
                >
                  {icon}
                  {label}
                </button>
              ))}
              <button onClick={handleSlackShare} className={MENU_ITEM_CLS}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
                </svg>
                Slack で共有
              </button>
              <button onClick={handleDiscordShare} className={MENU_ITEM_CLS}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                Discord で共有
              </button>
              <button
                onClick={() =>
                  copyText(`${article.title}\n${article.link!}`, "タイトルと URL をコピーしました")
                }
                className={MENU_ITEM_CLS}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                タイトル + URL をコピー
              </button>
              <button
                onClick={() => {
                  // `\` を先にエスケープしてから `[`/`]` をエスケープする。
                  // これにより `\[` のような入力が二重エスケープされず、Markdown ラベルの整合性が保たれる。
                  const mdTitle = (article.title || article.link!).replace(/[\\[\]]/g, "\\$&");
                  copyText(`[${mdTitle}](${article.link!})`, "Markdown リンクをコピーしました (C)");
                }}
                className={MENU_ITEM_CLS}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 15V9l2.5 3 2.5-3v6M16 15v-4.5M14 12.5h4" />
                </svg>
                Markdown リンクをコピー
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  window.print();
                }}
                className={MENU_ITEM_CLS}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 9V2h12v7" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                印刷
              </button>
              {feed && (
                <>
                  <button
                    onClick={() => {
                      try {
                        const md = articleToMarkdown(article, feed, contentHtml);
                        setOpen(false);
                        if (!navigator.clipboard) {
                          toast.error("クリップボードが使えません");
                          return;
                        }
                        navigator.clipboard
                          .writeText(md)
                          .then(() => toast.success("Markdown をコピーしました"))
                          .catch(() => toast.error("コピーに失敗しました"));
                      } catch {
                        toast.error("Markdown 生成に失敗しました");
                      }
                    }}
                    className={MENU_ITEM_CLS}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <path d="M7 15V9l2.5 3 2.5-3v6M16 9v6M13 12h6" />
                    </svg>
                    Markdown 全文コピー
                  </button>
                  <button
                    onClick={() => {
                      try {
                        const vault = storageGet(STORAGE_KEYS.OBSIDIAN_VAULT) ?? "";
                        const md = articleToMarkdown(article, feed, contentHtml);
                        const uri = buildObsidianUri({
                          vault: vault || undefined,
                          name: article.title,
                          content: md,
                        });
                        setOpen(false);
                        const a = document.createElement("a");
                        a.href = uri;
                        a.click();
                        toast.info("Obsidian を開いています…");
                      } catch {
                        toast.error("Obsidian URI の生成に失敗しました");
                      }
                    }}
                    className={MENU_ITEM_CLS}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 2C8 2 5 5.5 5 9c0 2.5 1.2 4.7 3 6l1 5h6l1-5c1.8-1.3 3-3.5 3-6 0-3.5-3-7-7-7z" />
                    </svg>
                    Obsidian に保存
                  </button>
                </>
              )}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
