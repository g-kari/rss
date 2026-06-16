import type { Article, Feed } from "../../types";
import { usePortalMenu } from "../../hooks/usePortalMenu";
import { useMenuKeyboard } from "../../hooks/useMenuKeyboard";
import { useToast } from "@/contexts/ToastContext";
import { storageGet, STORAGE_KEYS } from "../../lib/storage";
import { articleToMarkdown } from "../../lib/html-to-markdown";
import { buildObsidianUri } from "../../lib/obsidian";
import { isAbortError } from "../../lib/fetch";
import { MENU_ITEM_CLS } from "./constants";
import { SHARE_TARGETS, triggerShareTarget } from "./shareTargets";
import PortalMenuShell from "./PortalMenuShell";

interface Props {
  article: Article;
  feed?: Feed;
  contentHtml?: string;
}

export default function ShareMenu({ article, feed, contentHtml }: Props) {
  const toast = useToast();
  const { open, setOpen, toggle, pos, btnRef } = usePortalMenu();
  const { menuRef, handleKeyDown } = useMenuKeyboard(open, setOpen, btnRef);

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
        aria-haspopup="menu"
        aria-expanded={open}
        className={`p-2 -m-2 max-md:min-w-[44px] max-md:min-h-[44px] lg:p-0 lg:m-0 lg:min-w-[24px] lg:min-h-[24px] transition-colors duration-200 ${open ? "text-text-muted" : "text-text-faint hover:text-text-muted"}`}
      >
        <svg
          aria-hidden="true"
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
      {open && (
        <PortalMenuShell
          menuRef={menuRef}
          btnRef={btnRef}
          setOpen={setOpen}
          handleKeyDown={handleKeyDown}
          pos={pos}
          ariaLabel="共有"
          className="min-w-[140px]"
        >
          {typeof navigator.share === "function" && (
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigator.share({ url: article.link!, title: article.title }).catch((err) => {
                  // ユーザーキャンセルは無視（AbortError は意図した中断）
                  if (isAbortError(err)) return;
                  console.error("[ShareMenu] navigator.share failed", err);
                  toast.error("シェアに失敗しました");
                });
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
                aria-hidden="true"
              >
                <path d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              システムで共有
            </button>
          )}
          {SHARE_TARGETS.map((target) => (
            <button
              key={target.id}
              role="menuitem"
              onClick={() => {
                setOpen(false);
                triggerShareTarget(target, article.link!, article.title)
                  .then((r) => {
                    if (r.copied) {
                      toast.success(
                        `コピーしました。${target.label.replace("で共有", "")}を開きます`,
                      );
                    }
                  })
                  .catch(() => toast.error("コピーに失敗しました"));
              }}
              className={MENU_ITEM_CLS}
            >
              {target.icon}
              {target.label}
            </button>
          ))}
          <button
            role="menuitem"
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
              aria-hidden="true"
            >
              <path d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            タイトル + URL をコピー
          </button>
          <button
            role="menuitem"
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
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 15V9l2.5 3 2.5-3v6M16 15v-4.5M14 12.5h4" />
            </svg>
            Markdown リンクをコピー
          </button>
          <button
            role="menuitem"
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
              aria-hidden="true"
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
                role="menuitem"
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
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M7 15V9l2.5 3 2.5-3v6M16 9v6M13 12h6" />
                </svg>
                Markdown 全文コピー
              </button>
              <button
                role="menuitem"
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
                  aria-hidden="true"
                >
                  <path d="M12 2C8 2 5 5.5 5 9c0 2.5 1.2 4.7 3 6l1 5h6l1-5c1.8-1.3 3-3.5 3-6 0-3.5-3-7-7-7z" />
                </svg>
                Obsidian に保存
              </button>
            </>
          )}
        </PortalMenuShell>
      )}
    </>
  );
}
