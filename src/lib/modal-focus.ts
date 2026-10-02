/**
 * Modal / Dialog 系コンポーネントで共有するフォーカス管理ユーティリティ。
 *
 * `Modal.tsx` と `ConfirmModal.tsx` で同一の `FOCUSABLE_SELECTOR` 定義を
 * 持っていた drift を解消するため切り出した (helper drift 規範 — `coding-conventions.md`)。
 *
 * Tab trap 本体ロジックは各 modal の useEffect に閉じ込めたまま (handler は
 * focusable element 一覧の取り方に共通性しかないため、抽出ゲインが小さい)。
 */

/**
 * Tab フォーカス可能な要素を絞り込む selector。
 *
 * 仕様変更時 (例: `[contenteditable]` 追加) の同期修正リスクを防ぐため
 * 必ずこの定数を import すること。
 */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Hidden mounted settings panels must not become the ends of a modal's focus trap. */
export function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => {
    if (
      element.tabIndex < 0 ||
      element.matches(":disabled, input[type=hidden]") ||
      element.closest('[hidden], [inert], [aria-hidden="true"]')
    )
      return false;
    for (let node: HTMLElement | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (node === root) break;
    }
    return true;
  });
}
