import type { Article } from "../types";
import type { ExportedNoteJson } from "./export-json";
import { MAX_NOTE_LENGTH } from "./validation";

interface NoteUpdate {
  articleId: string;
  title: string;
  note: string;
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
