"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { useToast } from "../../contexts/ToastContext";
import { useSyncedRef } from "../../hooks/useSyncedRef";
import {
  parseArticleStateJson,
  parseCollectionArticlesJson,
  parseNotesJson,
  type ArticleStateImportMode,
  type ExportedNoteJson,
} from "../../lib/export-json";
import {
  MAX_RESTORE_SYNC_JSON_LENGTH,
  planArticleRestore,
  planNoteRestore,
  planRestoreSync,
} from "../../lib/json-restore-plan";
import { devError } from "../../lib/dev-log";
import {
  MAX_NOTE_LENGTH,
  MAX_NOTES,
  MAX_BOOKMARK_IDS,
  MAX_READING_LIST_IDS,
} from "../../lib/validation";
import { MAX_ARTICLES_PER_COLLECTION } from "../../lib/collection-limits";
import type { Article, Collection } from "../../types";

interface Props {
  userId: string;
  hidden: boolean;
  articles: Article[];
  notes: Record<string, string>;
  setNote: (articleId: string, text: string) => void;
  bookmarkIds: Set<string>;
  readingListIds: Set<string>;
  toggleBookmark: (articleId: string) => void;
  toggleReadingList: (articleId: string) => void;
  collections: Collection[];
  addArticlesToCollection: (collectionId: string, articleIds: readonly string[]) => Promise<void>;
}

type Kind = "notes" | "article-state" | "collections";
type PreparedImport = { filename: string; userId: string } & (
  | { kind: "notes"; entries: ExportedNoteJson[] }
  | { kind: "article-state"; mode: ArticleStateImportMode; urls: string[] }
  | { kind: "collections"; targetId: string; urls: string[] }
);

const buttonClass =
  "self-start min-h-[44px] rounded-lg border border-border-default px-3 py-1.5 text-[12px] disabled:cursor-not-allowed disabled:opacity-50";

/** File selection is read-only. Existing restore callbacks run only after explicit review. */
export default function JsonRestoreControls(props: Props) {
  const toast = useToast();
  const latest = useSyncedRef(props);
  const [pending, setPending] = useState<PreparedImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [targetId, setTargetId] = useState("");
  const operation = useRef(0);
  const applying = useRef(false);
  const consumed = useRef<PreparedImport | null>(null);
  const inputs = useRef<Partial<Record<Kind, HTMLInputElement>>>({});
  const triggers = useRef<Partial<Record<Kind, HTMLButtonElement>>>({});
  const previewHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    operation.current += 1;
    setPending(null);
    setBusy(false);
    setReplaceExisting(false);
    return () => {
      operation.current += 1;
    };
  }, [props.userId, props.hidden]);

  useLayoutEffect(() => {
    if (pending && !props.hidden) previewHeading.current?.focus();
  }, [pending, props.hidden]);

  const notePlan =
    pending?.kind === "notes"
      ? planNoteRestore(pending.entries, props.articles, props.notes, replaceExisting)
      : null;
  const target =
    pending?.kind === "collections"
      ? props.collections.find((collection) => collection.id === pending.targetId)
      : null;
  const statePlan =
    pending && pending.kind !== "notes"
      ? planArticleRestore(
          pending.urls,
          props.articles,
          new Set(
            pending.kind === "collections"
              ? (target?.articleIds ?? [])
              : pending.mode === "bookmark"
                ? props.bookmarkIds
                : props.readingListIds,
          ),
        )
      : null;
  const count = notePlan?.updates.length ?? statePlan?.additions.length ?? 0;
  const syncPlan =
    pending && pending.kind !== "collections"
      ? planRestoreSync(
          props.notes,
          notePlan?.updates ?? [],
          pending.kind === "article-state" ? pending.mode : undefined,
          statePlan?.additions.map((entry) => entry.articleId) ?? [],
        )
      : null;
  const noteTotal = syncPlan?.noteCount ?? 0;
  const collectionRoom = Math.max(
    0,
    MAX_ARTICLES_PER_COLLECTION - (target?.articleIds.length ?? 0),
  );
  const stateLimit =
    pending?.kind === "article-state" && pending.mode === "bookmark"
      ? MAX_BOOKMARK_IDS
      : MAX_READING_LIST_IDS;
  const capacityError =
    syncPlan && noteTotal > MAX_NOTES
      ? `メモ同期上限${MAX_NOTES}件: 取り込み後は${noteTotal}件になります。既存メモを整理してから取り込んでください`
      : pending?.kind === "collections" && target && count > collectionRoom
        ? `コレクション上限${MAX_ARTICLES_PER_COLLECTION}件: 空き${collectionRoom}件に対して追加候補${count}件です。別の取り込み先を選ぶか、ファイルを分けてください`
        : pending?.kind === "article-state" && count > stateLimit
          ? `一度の追加上限${stateLimit}件を超えています。ファイルを分けて取り込んでください`
          : syncPlan && syncPlan.jsonLength > MAX_RESTORE_SYNC_JSON_LENGTH
            ? "同期データの上限（512K文字）を超えています。ファイルを分けるか、既存メモを整理してから取り込んでください"
            : "";
  const label =
    pending?.kind === "notes"
      ? "メモを復元"
      : pending?.kind === "collections"
        ? "コレクションに追加"
        : pending?.kind === "article-state" && pending.mode === "bookmark"
          ? "ブックマークに追加"
          : "後で読むに追加";

  function clearPreview(restoreFocus = true) {
    operation.current += 1;
    setPending(null);
    setReplaceExisting(false);
    setBusy(false);
    if (restoreFocus && pending && !latest.current.hidden) triggers.current[pending.kind]?.focus();
  }

  async function prepare(kind: Kind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || applying.current || latest.current.hidden) return;
    const owner = latest.current.userId;
    const selectedTarget = targetId;
    const token = ++operation.current;
    setPending(null);
    setReplaceExisting(false);
    if (file.size > 5 * 1024 * 1024) {
      setBusy(false);
      toast.error("JSON ファイルのサイズが大きすぎます（上限5MB）");
      return;
    }
    if (
      kind === "collections" &&
      !props.collections.some((collection) => collection.id === selectedTarget)
    ) {
      setBusy(false);
      toast.error("取り込み先コレクションを選択してください");
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      if (token !== operation.current || owner !== latest.current.userId || latest.current.hidden)
        return;
      const source = { filename: file.name, userId: owner };
      if (kind === "notes") {
        const entries = parseNotesJson(text);
        if (!entries.length) toast.error("有効なメモが見つかりません");
        else setPending({ ...source, kind, entries });
      } else if (kind === "article-state") {
        const parsed = parseArticleStateJson(text);
        if (!parsed?.urls.length)
          toast.error("有効なブックマークまたは後で読むの JSON ではありません");
        else setPending({ ...source, kind, ...parsed });
      } else {
        const parsed = parseCollectionArticlesJson(text);
        if (!parsed?.urls.length) toast.error("有効なコレクションの JSON ではありません");
        else setPending({ ...source, kind, targetId: selectedTarget, urls: parsed.urls });
      }
    } catch (error) {
      if (
        token === operation.current &&
        owner === latest.current.userId &&
        !latest.current.hidden
      ) {
        devError("[JsonRestoreControls] file read failed", error);
        toast.error("JSON ファイルを読み込めませんでした");
      }
    } finally {
      if (token === operation.current) setBusy(false);
    }
  }

  async function apply() {
    if (
      !pending ||
      consumed.current === pending ||
      applying.current ||
      busy ||
      !count ||
      capacityError ||
      props.hidden ||
      pending.userId !== props.userId ||
      (pending.kind === "collections" && !target)
    )
      return;
    // Synchronous note/state callbacks can finish before React commits the disabled
    // button. Consume this exact preview to prevent a second toggle undoing the first.
    consumed.current = pending;
    applying.current = true;
    setBusy(true);
    const token = ++operation.current;
    const owner = props.userId;
    try {
      if (pending.kind === "notes" && notePlan) {
        for (const entry of notePlan.updates) props.setNote(entry.articleId, entry.note);
      } else if (pending.kind === "article-state" && statePlan) {
        const toggle = pending.mode === "bookmark" ? props.toggleBookmark : props.toggleReadingList;
        for (const entry of statePlan.additions) toggle(entry.articleId);
      } else if (pending.kind === "collections" && statePlan && target) {
        await props.addArticlesToCollection(
          target.id,
          statePlan.additions.map((entry) => entry.articleId),
        );
      }
      if (token !== operation.current || owner !== latest.current.userId || latest.current.hidden)
        return;
      toast.success(`${count}件を取り込みました`);
      clearPreview();
    } catch (error) {
      consumed.current = null;
      if (
        token === operation.current &&
        owner === latest.current.userId &&
        !latest.current.hidden
      ) {
        devError("[JsonRestoreControls] restore failed", error);
        toast.error("取り込みに失敗しました。現在の状態を確認して再試行してください");
      }
    } finally {
      applying.current = false;
      if (token === operation.current) setBusy(false);
    }
  }

  return (
    <>
      {(["notes", "article-state", "collections"] as const).map((kind) => (
        <div
          key={kind}
          data-setting-id={`${kind}-import`}
          tabIndex={-1}
          className="flex flex-col gap-2"
        >
          <h3 className="text-[13px] font-medium text-text-strong">
            {kind === "notes"
              ? "メモ"
              : kind === "article-state"
                ? "ブックマーク / 後で読む"
                : "コレクション"}
          </h3>
          <p className="text-[12px] leading-relaxed text-text-soft">
            JSON を読み込み、復元できる件数を確認してから取り込みます。
          </p>
          {kind === "collections" && (
            <select
              aria-label="コレクション JSON の取り込み先"
              value={targetId}
              disabled={busy || !props.collections.length}
              onChange={(event) => {
                setTargetId(event.target.value);
                clearPreview(false);
              }}
              className="min-h-[44px] max-w-full self-start rounded-md border border-border-default bg-surface-elevated px-2 text-[12px] text-text-default disabled:opacity-50"
            >
              <option value="">取り込み先を選択...</option>
              {props.collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.name}
                </option>
              ))}
            </select>
          )}
          <input
            ref={(element) => {
              inputs.current[kind] = element ?? undefined;
            }}
            type="file"
            aria-label={`${kind === "notes" ? "メモ" : kind === "article-state" ? "記事状態" : "コレクション"} JSON ファイル`}
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => void prepare(kind, event)}
          />
          <button
            ref={(element) => {
              triggers.current[kind] = element ?? undefined;
            }}
            type="button"
            disabled={busy || (kind === "collections" && !props.collections.length)}
            onClick={() => inputs.current[kind]?.click()}
            className={`${buttonClass} text-text-default hover:bg-surface-hover`}
          >
            {kind === "notes" ? "メモ" : kind === "article-state" ? "記事状態" : "コレクション"}{" "}
            JSON 取込
          </button>
        </div>
      ))}
      {pending && pending.userId === props.userId && !props.hidden && (
        <section
          aria-labelledby="json-restore-heading"
          className="rounded-lg border border-border-default bg-surface-elevated p-3 text-[13px] text-text-default"
        >
          <h3
            ref={previewHeading}
            id="json-restore-heading"
            tabIndex={-1}
            className="font-medium text-text-strong"
          >
            JSON 復元プレビュー
          </h3>
          <p className="mt-2 break-all">ファイル: {pending.filename}</p>
          {pending.kind === "collections" && (
            <p>取り込み先: {target?.name ?? "コレクションが削除されました"}</p>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-text-soft">
            現在読み込み済みの記事との URL 一致だけを復元します。一致しない記事は追加取得しません。
          </p>
          <div aria-live="polite" aria-atomic="true" className="mt-2">
            {notePlan ? (
              <>
                <p>
                  新しいメモ: {notePlan.newCount}件 / 異なる既存メモ: {notePlan.conflictCount}件 /
                  同じメモ: {notePlan.identicalCount}件
                </p>
                <p>読み込み済みの記事にない URL: {notePlan.missingCount}件</p>
                <p>
                  上限{MAX_NOTE_LENGTH}文字を超えるメモ: {notePlan.tooLongCount}件 (取込対象外)
                </p>
              </>
            ) : (
              statePlan && (
                <>
                  <p>
                    追加候補: {statePlan.additions.length}件 / 登録済み:{" "}
                    {statePlan.alreadyPresentCount}件
                  </p>
                  <p>読み込み済みの記事にない URL: {statePlan.missingCount}件</p>
                </>
              )
            )}
          </div>
          {capacityError && (
            <p role="alert" className="mt-2 text-[12px] leading-relaxed text-status-error">
              {capacityError}
            </p>
          )}
          {notePlan && (
            <label className="mt-3 flex min-h-[44px] items-center gap-2">
              <input
                type="checkbox"
                checked={replaceExisting}
                disabled={busy}
                onChange={(event) => setReplaceExisting(event.target.checked)}
              />
              異なる既存メモも置き換える
            </label>
          )}
          {notePlan && (
            <p className="text-[12px] text-text-soft">
              初期状態では既存メモを保持します。置き換える場合は先にメモをバックアップしてください。
            </p>
          )}
          {notePlan?.updates.length || statePlan?.additions.length ? (
            <ul className="mt-2 list-inside list-disc break-all text-[12px]">
              {(notePlan?.updates ?? statePlan?.additions ?? []).slice(0, 5).map((entry) => (
                <li key={entry.articleId}>{entry.title}</li>
              ))}
              {count > 5 && <li>ほか {count - 5}件</li>}
            </ul>
          ) : (
            <p className="mt-2">取り込める変更はありません</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                busy || !count || !!capacityError || (pending.kind === "collections" && !target)
              }
              onClick={() => void apply()}
              className={`${buttonClass} bg-ink text-ink-text hover:bg-ink-hover`}
            >
              {label} ({count}件)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => clearPreview()}
              className={`${buttonClass} text-text-default hover:bg-surface-hover`}
            >
              取込をキャンセル
            </button>
          </div>
        </section>
      )}
    </>
  );
}
