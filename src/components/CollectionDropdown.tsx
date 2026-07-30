"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Collection } from "../types";
import { useToast } from "@/contexts/ToastContext";
import { usePortalMenu } from "../hooks/usePortalMenu";
import { useMenuKeyboard } from "../hooks/useMenuKeyboard";
import { useConfirm } from "../hooks/useConfirm";
import ConfirmModal from "./ConfirmModal";
import { devError } from "../lib/dev-log";
import PortalMenuShell from "./article-view/PortalMenuShell";

const CollectionModal = dynamic(() => import("./CollectionModal"), { ssr: false });

interface Props {
  articleId: string;
  collections: Collection[];
  onAdd: (collectionId: string, articleId: string) => Promise<void>;
  onRemove: (collectionId: string, articleId: string) => Promise<void>;
  onCreateNew?: (name: string) => Promise<Collection | { error: string }>;
  /**
   * Bookmark カスタム collection (案 B snapshot)。
   * `bookmarkIds.size > 0` のとき、各 collection 行末尾に「ブックマーク全件追加」ボタンを表示する。
   * クリック時に `confirm()` で確認後 `onAddBulk(collectionId, [...bookmarkIds])` を呼ぶ。
   * ReadOnly Set として扱う (consumer 側で mutation しない)。
   */
  bookmarkIds?: ReadonlySet<string>;
  /** bulk 追加 callback (bookmarkIds.size > 0 + onAddBulk 提供時のみ menu item 表示) */
  onAddBulk?: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
}

/**
 * 記事をコレクションに追加 / 削除するドロップダウン。
 *
 * a11y: ShareMenu / FilterMenu と同じ規範パターン:
 * - usePortalMenu + useMenuKeyboard でキーボードナビ + Escape close + クリック外し閉じる
 * - aria-haspopup="menu" / aria-expanded={open} / role="menu" / role="menuitem"
 * - PortalMenuShell で `position: fixed` 配置 + 透明 Backdrop + WCAG 2.4.3 focus 復元を集約
 *   (SnoozeMenu / FilterMenu / GlobalFilterMenu と共通シェル)
 */
export default function CollectionDropdown({
  articleId,
  collections,
  onAdd,
  onRemove,
  onCreateNew,
  bookmarkIds,
  onAddBulk,
}: Props) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const toast = useToast();
  const { open, setOpen, toggle, pos, btnRef, menuId } = usePortalMenu();
  const { menuRef, handleKeyDown } = useMenuKeyboard(open, setOpen, btnRef);
  const { confirm, confirmModalProps } = useConfirm();

  const inCount = collections.filter((c) => c.articleIds.includes(articleId)).length;
  // Bookmark snapshot 一括追加が可能か (bookmarkIds.size > 0 + onAddBulk + collection 1 件以上)
  const bookmarkCount = bookmarkIds?.size ?? 0;
  const canBulkAddBookmarks = bookmarkCount > 0 && !!onAddBulk && collections.length > 0;

  const handleBulkAdd = async (collection: Collection): Promise<void> => {
    if (!onAddBulk || !bookmarkIds || bookmarkIds.size === 0) return;
    // #1198: 誤操作防止の確認 (snapshot 方式のため後から undo できない)。
    // window.confirm は canonical (useConfirm + ConfirmModal) に統一済 — GalleryContextMenu 参照。
    const ok = await confirm({
      title: "一括追加の確認",
      message: `${bookmarkIds.size} 件のブックマーク記事を「${collection.name}」に追加しますか？`,
      confirmLabel: "追加",
    });
    if (!ok) return;
    setOpen(false);
    // WCAG 2.4.3: menu を閉じたらトリガーボタンへ focus を戻す (backdrop / 新規コレクション
    // close 経路と対称、usePortalMenu backdrop-dismiss 規範)。menuitem 押下で portal が
    // unmount されると focus が body に落ちるのを防ぐ。
    btnRef.current?.focus();
    try {
      await onAddBulk(collection.id, Array.from(bookmarkIds));
      toast.success(`「${collection.name}」に ${bookmarkIds.size} 件追加しました`);
    } catch (err) {
      devError("[CollectionDropdown] onAddBulk failed", err);
      toast.error("ブックマーク一括追加に失敗しました");
    }
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="コレクションに追加"
        aria-label="コレクションに追加"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`p-2 -m-2 max-md:min-w-[44px] max-md:min-h-[44px] lg:p-0 lg:m-0 lg:min-w-[24px] lg:min-h-[24px] transition-colors duration-200 ${
          inCount > 0 ? "text-collection-indicator" : "text-text-faint hover:text-text-muted"
        }`}
      >
        <svg
          className="w-[18px] h-[18px] lg:w-[14px] lg:h-[14px]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          <line x1="12" y1="11" x2="12" y2="17" />
          <line x1="9" y1="14" x2="15" y2="14" />
        </svg>
      </button>
      {open && (
        <PortalMenuShell
          menuRef={menuRef}
          btnRef={btnRef}
          setOpen={setOpen}
          handleKeyDown={handleKeyDown}
          pos={pos}
          menuId={menuId}
          ariaLabel="コレクションに追加"
          className="min-w-[180px] py-1"
        >
          {collections.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-text-muted">コレクションがありません</p>
          )}
          {collections.map((c) => {
            const isIn = c.articleIds.includes(articleId);
            return (
              <button
                key={c.id}
                role="menuitemcheckbox"
                aria-checked={isIn}
                onClick={async () => {
                  try {
                    if (isIn) await onRemove(c.id, articleId);
                    else await onAdd(c.id, articleId);
                  } catch (err) {
                    devError("[CollectionDropdown] collection update failed", err);
                    toast.error("コレクションの更新に失敗しました");
                  }
                }}
                className="w-full px-3 py-1.5 text-left text-[13px] flex items-center gap-2 hover:bg-surface-hover transition-colors"
              >
                <span className="w-4 text-center text-text-muted">{isIn ? "✓" : ""}</span>
                <span className={isIn ? "text-text-strong" : "text-text-default"}>{c.name}</span>
              </button>
            );
          })}
          {canBulkAddBookmarks && (
            <>
              <div className="border-t border-border-subtle my-1" />
              <p className="px-3 py-1 text-[10px] font-medium tracking-[0.15em] uppercase text-text-muted">
                ブックマーク全件追加 ({bookmarkCount})
              </p>
              {collections.map((c) => (
                <button
                  key={`bulk-${c.id}`}
                  role="menuitem"
                  onClick={() => void handleBulkAdd(c)}
                  className="w-full px-3 py-1.5 text-left text-[13px] text-text-muted hover:text-text-strong hover:bg-surface-hover transition-colors flex items-center gap-2"
                >
                  <span className="w-4 text-center">↳</span>
                  <span>「{c.name}」へ</span>
                </button>
              ))}
            </>
          )}
          {onCreateNew && (
            <>
              <div className="border-t border-border-subtle my-1" />
              <button
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  btnRef.current?.focus();
                  setShowCreateModal(true);
                }}
                className="w-full px-3 py-1.5 text-left text-[13px] text-text-muted hover:text-text-strong hover:bg-surface-hover transition-colors flex items-center gap-2"
              >
                <span className="w-4 text-center">+</span>
                <span>新規コレクション</span>
              </button>
            </>
          )}
        </PortalMenuShell>
      )}
      <ConfirmModal {...confirmModalProps} />
      {showCreateModal && onCreateNew && (
        <CollectionModal
          mode="create"
          onSubmit={async (name) => {
            const result = await onCreateNew(name);
            if ("error" in result) return result;
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </>
  );
}
