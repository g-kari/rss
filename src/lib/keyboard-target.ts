/** グローバルショートカットを抑制すべき編集可能な要素か判定する。 */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  return (
    (typeof HTMLInputElement !== "undefined" && target instanceof HTMLInputElement) ||
    (typeof HTMLTextAreaElement !== "undefined" && target instanceof HTMLTextAreaElement) ||
    (typeof HTMLSelectElement !== "undefined" && target instanceof HTMLSelectElement) ||
    (typeof HTMLElement !== "undefined" &&
      target instanceof HTMLElement &&
      target.isContentEditable)
  );
}
