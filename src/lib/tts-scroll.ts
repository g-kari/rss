/**
 * TTS 読み上げ中センテンスのスクロール判定純粋関数 (#659)。
 *
 * `block: "nearest"` の scrollIntoView は要素が見えている場合は何もしないが、
 * 「画像の直後で要素が画面下部に来ている」「画面下部基準で見づらい」状況を
 * 改善できない。ユーザー要望に応えて「画面中央付近」に来るようスクロールする。
 *
 * ただし、毎センテンスで `block: "center"` を呼ぶとスクロールが頻繁に発生して
 * 読みづらいので、要素が **快適ゾーン (画面中央 30〜70%)** に既にあるなら
 * スクロールをスキップする。これにより同じパラグラフ内のセンテンス遷移では
 * 静止し、パラグラフを跨いだり画像で押し下げられたりした時だけ再センタリング。
 */
export interface ScrollDecision {
  /** スクロール実行が必要なら true */
  shouldScroll: boolean;
}

export interface SentenceScrollInput {
  /** 対象要素の bounding rect の top (viewport 基準 px) */
  elementTop: number;
  /** 対象要素の bounding rect の bottom (viewport 基準 px) */
  elementBottom: number;
  /** スクロールコンテナの bounding rect の top */
  containerTop: number;
  /** スクロールコンテナの bounding rect の bottom */
  containerBottom: number;
  /**
   * 快適ゾーンの上端比率 (0〜1)。デフォルト 0.30 = コンテナ高さの上から 30%。
   */
  comfortZoneTop?: number;
  /**
   * 快適ゾーンの下端比率 (0〜1)。デフォルト 0.70 = コンテナ高さの上から 70%。
   */
  comfortZoneBottom?: number;
}

/**
 * 対象センテンスがスクロールコンテナの「快適ゾーン」(中央 30〜70%) に
 * 入っているか判定し、外れていればスクロールが必要と返す。
 *
 * 判定基準: 要素の中心 (top と bottom の平均) が快適ゾーンの内側に
 * あればスクロール不要。要素が快適ゾーンの上下からはみ出ている場合や、
 * コンテナよりも大きい場合 (極端に長いセンテンス) はスクロールが必要。
 */
export function shouldScrollSentence(input: SentenceScrollInput): ScrollDecision {
  const {
    elementTop,
    elementBottom,
    containerTop,
    containerBottom,
    comfortZoneTop = 0.3,
    comfortZoneBottom = 0.7,
  } = input;

  const containerHeight = containerBottom - containerTop;
  if (containerHeight <= 0) return { shouldScroll: false };

  // 要素の中心 (viewport 座標)
  const elementCenter = (elementTop + elementBottom) / 2;
  // 快適ゾーンの絶対座標
  const comfortTop = containerTop + containerHeight * comfortZoneTop;
  const comfortBottom = containerTop + containerHeight * comfortZoneBottom;

  if (elementCenter < comfortTop) return { shouldScroll: true };
  if (elementCenter > comfortBottom) return { shouldScroll: true };
  return { shouldScroll: false };
}

/**
 * 要素から最も近いスクロール可能な祖先を返す。
 *
 * `overflow: auto/scroll` を持つ祖先を辿る。見つからなければ `document.scrollingElement`
 * (HTML or BODY) を返す。サーバー側 (document 不在) では null。
 */
/**
 * NOTE: `src/hooks/useArticlePagination.ts` にも同名 inline 関数あり (semantics 違い)。
 * 統合せず両方残すのは意図的 — 詳細は useArticlePagination.ts 側の NOTE 参照。
 */
export function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  if (!el || typeof window === "undefined") return null;
  let cur: HTMLElement | null = el.parentElement;
  while (cur) {
    const style = window.getComputedStyle(cur);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && cur.scrollHeight > cur.clientHeight) {
      return cur;
    }
    cur = cur.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}
