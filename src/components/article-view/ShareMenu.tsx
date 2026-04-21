import React, { useRef } from "react";
import { createPortal } from "react-dom";
import type { Article, Feed } from "../../types";
import { usePortalMenu } from "../../hooks/usePortalMenu";
import { storageGet, STORAGE_KEYS } from "../../lib/storage";
import { articleToMarkdown } from "../../lib/html-to-markdown";
import { buildObsidianUri } from "../../lib/obsidian";
import { MENU_ITEM_CLS } from "./constants";

interface Props {
  article: Article;
  showToast: (msg: string) => void;
  feed?: Feed;
  contentHtml?: string;
}

const SHARE_WINDOW_TARGETS: Array<{
  label: string;
  buildUrl: (link: string, title: string) => string;
  icon: React.ReactNode;
}> = [
  {
    label: "X でシェア",
    buildUrl: (link, title) =>
      `https://x.com/intent/post?url=${encodeURIComponent(link)}&text=${encodeURIComponent(title)}`,
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.727-8.833L1.254 2.25H8.08l4.261 5.638 5.903-5.638zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: "Bluesky でシェア",
    buildUrl: (link, title) =>
      `https://bsky.app/intent/compose?text=${encodeURIComponent(`${title}\n${link}`)}`,
    icon: (
      <svg width="12" height="12" viewBox="0 0 568 501" fill="currentColor">
        <path d="M123.121 33.664C188.24 82.553 258.88 181.68 284 234.873c25.12-53.192 95.76-152.32 160.879-201.21C491.866-1.611 568-28.906 568 57.748c0 17.46-10.033 146.8-15.914 167.727-20.432 73.21-94.853 91.82-161.048 80.508C507.337 328.795 527.755 396.26 461.455 462.86c-123.063 120.605-176.695-30.26-190.138-68.847-2.857-8.18-4.195-12.011-4.317-8.773-.122-3.238-1.46.594-4.317 8.773-13.443 38.587-67.075 189.452-190.138 68.847-66.3-66.6-45.882-134.065 71.521-156.877-66.195 11.312-140.616-7.298-161.048-80.508C-15.77 204.548-25.803 75.208-25.803 57.748-25.803-28.906 50.134-1.611 123.121 33.664z" />
      </svg>
    ),
  },
  {
    label: "LINE でシェア",
    buildUrl: (link, title) =>
      `https://line.me/R/share?text=${encodeURIComponent(`${title}\n${link}`)}`,
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M19.365 9.863c.349 0 .63.285.63.63 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
      </svg>
    ),
  },
  {
    label: "はてなブックマーク",
    buildUrl: (link, title) =>
      `https://b.hatena.ne.jp/add?mode=confirm&url=${encodeURIComponent(link)}&title=${encodeURIComponent(title)}`,
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
        <rect x="1" y="1" width="22" height="22" rx="3" fill="currentColor" />
        <text
          x="12"
          y="17"
          textAnchor="middle"
          fontSize="13"
          fontWeight="bold"
          fill="var(--color-surface-base)"
          fontFamily="sans-serif"
        >
          B!
        </text>
      </svg>
    ),
  },
];

export default function ShareMenu({ article, showToast, feed, contentHtml }: Props) {
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();
  const menuRef = useRef<HTMLDivElement>(null);

  function handleSlackShare() {
    const text = `${article.title}\n${article.link!}`;
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("コピーしました。Slack を開きます");
        window.open("slack://open", "_blank", "noopener,noreferrer");
      })
      .catch(() => showToast("コピーに失敗しました"));
  }

  function openShareWindow(url: string) {
    setOpen(false);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function copyText(text: string, successMsg: string) {
    setOpen(false);
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(successMsg))
      .catch(() => showToast("コピーに失敗しました"));
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="共有 (c)"
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
              {SHARE_WINDOW_TARGETS.map(({ label, buildUrl, icon }) => (
                <button
                  key={label}
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
                          showToast("クリップボードが使えません");
                          return;
                        }
                        navigator.clipboard
                          .writeText(md)
                          .then(() => showToast("Markdown をコピーしました"))
                          .catch(() => showToast("コピーに失敗しました"));
                      } catch {
                        showToast("Markdown 生成に失敗しました");
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
                        showToast("Obsidian を開いています…");
                      } catch {
                        showToast("Obsidian URI の生成に失敗しました");
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
