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
