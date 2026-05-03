/**
 * linkedom の DOM 操作に使用する最小インターフェース。
 * linkedom の型定義は DOM 標準と完全には互換していないため、
 * 必要なプロパティ・メソッドのみを定義して `any` を排除する。
 */
export interface LDElement {
  getAttribute(name: string): string | null;
  textContent: string | null;
  className: string;
  tagName: string;
  parentElement: LDElement | null;
  querySelector(selector: string): LDElement | null;
  appendChild(child: LDElement): LDElement;
  /** linkedom では <a>/<base> 等のリフレクト属性を直接持つ */
  href?: string;
}

export interface LDDocument {
  querySelectorAll(selector: string): Iterable<LDElement>;
  createElement(tag: string): LDElement;
  head: LDElement;
}
