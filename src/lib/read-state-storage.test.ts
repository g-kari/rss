import { describe, expect, it } from "vitest";
import {
  emptyPendingSets,
  extractAndResetPending,
  restorePending,
  type PendingRefs,
} from "./read-state-storage";
function makeRefs(): PendingRefs {
  return {
    pendingAddedRef: { current: emptyPendingSets() },
    pendingRemovedRef: { current: emptyPendingSets() },
    pendingTagChangedRef: { current: new Set() },
    pendingTagRemovedRef: { current: new Set() },
    pendingNotesChangedRef: { current: new Set() },
    pendingNotesRemovedRef: { current: new Set() },
    globalFilterDirtyRef: { current: false },
  };
}
describe("失敗した古い同期と新しいSet操作の優先順位", () => {
  it.each(["read", "bookmarks", "readingList", "likes"] as const)(
    "%sの新addは古い失敗removalを復元しない",
    (kind) => {
      const refs = makeRefs();
      refs.pendingRemovedRef.current[kind].add("saved");
      const old = extractAndResetPending(refs);
      refs.pendingAddedRef.current[kind].add("saved");
      restorePending(refs, old);
      expect(refs.pendingAddedRef.current[kind]).toEqual(new Set(["saved"]));
      expect(refs.pendingRemovedRef.current[kind]).toEqual(new Set());
    },
  );
  it.each(["read", "bookmarks", "readingList", "likes"] as const)(
    "%sの新removalは古い失敗addを復元しない",
    (kind) => {
      const refs = makeRefs();
      refs.pendingAddedRef.current[kind].add("saved");
      const old = extractAndResetPending(refs);
      refs.pendingRemovedRef.current[kind].add("saved");
      restorePending(refs, old);
      expect(refs.pendingAddedRef.current[kind]).toEqual(new Set());
      expect(refs.pendingRemovedRef.current[kind]).toEqual(new Set(["saved"]));
    },
  );
  it("触っていない旧IDと既存tag/note/filter回復経路は保持する", () => {
    const refs = makeRefs();
    refs.pendingAddedRef.current.bookmarks.add("old-add");
    refs.pendingRemovedRef.current.bookmarks.add("old-remove");
    refs.pendingTagChangedRef.current.add("tag");
    refs.pendingTagRemovedRef.current.add("tag-remove");
    refs.pendingNotesChangedRef.current.add("note");
    refs.pendingNotesRemovedRef.current.add("note-remove");
    refs.globalFilterDirtyRef.current = true;
    const old = extractAndResetPending(refs);
    refs.pendingAddedRef.current.bookmarks.add("new-add");
    refs.pendingRemovedRef.current.bookmarks.add("new-remove");
    restorePending(refs, old);
    expect(refs.pendingAddedRef.current.bookmarks).toEqual(new Set(["new-add", "old-add"]));
    expect(refs.pendingRemovedRef.current.bookmarks).toEqual(new Set(["new-remove", "old-remove"]));
    expect(refs.pendingTagChangedRef.current).toEqual(old.tagChanged);
    expect(refs.pendingTagRemovedRef.current).toEqual(old.tagRemoved);
    expect(refs.pendingNotesChangedRef.current).toEqual(old.notesChanged);
    expect(refs.pendingNotesRemovedRef.current).toEqual(old.notesRemoved);
    expect(refs.globalFilterDirtyRef.current).toBe(true);
  });
});
