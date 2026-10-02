import type { Article } from "../types";
import type { ArticleStateImportMode, ExportedNoteJson } from "./export-json";
import { MAX_NOTE_LENGTH } from "./validation";
import { emptyPendingSets, serializeReadState } from "./read-state-storage";

interface NoteUpdate {
  articleId: string;
  title: string;
  note: string;
}

// Existing parseJsonBody request-text bound. A boundary test invokes that actual
// parser so this client preflight cannot silently drift from the server contract.
export const MAX_RESTORE_SYNC_JSON_LENGTH = 512 * 1024;

/** Minimum sync body includes the entire notes snapshot, not only changed notes.
 * Other pending fields and remote conflicts still use the normal sync checks. */
export function planRestoreSync(
  notes: Readonly<Record<string, string>>,
  updates: readonly Pick<NoteUpdate, "articleId" | "note">[],
  mode?: ArticleStateImportMode,
  articleIds: readonly string[] = [],
) {
  const entries = new Map(Object.entries(notes));
  for (const update of updates) entries.set(update.articleId, update.note);
  const added = emptyPendingSets();
  if (mode) added[mode === "bookmark" ? "bookmarks" : "readingList"] = new Set(articleIds);
  const body = serializeReadState(
    added,
    emptyPendingSets(),
    null,
    null,
    {},
    Object.fromEntries(entries),
    { changedKeys: new Set(), removedKeys: new Set(), currentTags: {} },
    false,
    0,
  );
  // ttlDays=0 is the shortest valid value, so unknown state/settings can only
  // enlarge this lower bound. The existing sync layer remains authoritative.
  return { noteCount: entries.size, jsonLength: body.length };
}

/** Plans against the current loaded articles only; never fetches or mutates state. */
export function planNoteRestore(
  entries: readonly ExportedNoteJson[],
  articles: readonly Article[],
  notes: Readonly<Record<string, string>>,
  replaceExisting: boolean,
) {
  const articleByUrl = new Map(articles.map((article) => [article.link, article]));
  const updates: NoteUpdate[] = [];
  let newCount = 0;
  let conflictCount = 0;
  let identicalCount = 0;
  let missingCount = 0;
  let tooLongCount = 0;
  for (const entry of entries) {
    if (entry.note.length > MAX_NOTE_LENGTH) {
      tooLongCount += 1;
      continue;
    }
    const article = articleByUrl.get(entry.url);
    if (!article) {
      missingCount += 1;
      continue;
    }
    const current = notes[article.id]?.trim() ?? "";
    if (current === entry.note) {
      identicalCount += 1;
      continue;
    }
    if (current) conflictCount += 1;
    else newCount += 1;
    if (!current || replaceExisting) {
      updates.push({ articleId: article.id, title: article.title || entry.url, note: entry.note });
    }
  }
  return { updates, newCount, conflictCount, identicalCount, missingCount, tooLongCount };
}

/** Add-only URL matching shared by bookmarks, reading lists and collections. */
export function planArticleRestore(
  urls: readonly string[],
  articles: readonly Article[],
  existingIds: ReadonlySet<string>,
) {
  const articleByUrl = new Map(articles.map((article) => [article.link, article]));
  const additions: Array<{ articleId: string; title: string }> = [];
  const seen = new Set<string>();
  const addedIds = new Set<string>();
  let alreadyPresentCount = 0;
  let missingCount = 0;
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    const article = articleByUrl.get(url);
    if (!article) {
      missingCount += 1;
    } else if (existingIds.has(article.id) || addedIds.has(article.id)) {
      alreadyPresentCount += 1;
    } else {
      addedIds.add(article.id);
      additions.push({ articleId: article.id, title: article.title || url });
    }
  }
  return { additions, alreadyPresentCount, missingCount };
}
