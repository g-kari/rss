/** Sentence-aware, verbatim reading cards. A decimal point is not a sentence end. */
const segmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter("ja", { granularity: "sentence" })
    : null;

export function immersiveSentences(text: string): string[] {
  if (segmenter)
    return Array.from(segmenter.segment(text), ({ segment }) => segment).filter((part) =>
      part.trim(),
    );
  return (text.match(/.*?(?:[。！？!?]+[」』”’]*|\.(?=\s|$)|$)/gu) || []).filter((part) =>
    part.trim(),
  );
}

/** Soft limit: keep whole sentences, including a single unusually long sentence. */
export function sentenceExcerpt(text: string, limit = 1200): string {
  if (text.length <= limit) return text;
  let result = "";
  let length = 0;
  // Stop iterating as soon as the preview is filled instead of allocating every sentence
  // in a loaded long article. Only a single indivisible sentence can exceed the soft limit.
  const sentences = segmenter ? segmenter.segment(text) : immersiveSentences(text);
  for (const part of sentences) {
    const sentence = typeof part === "string" ? part : part.segment;
    if (!sentence.trim()) continue;
    const size = Array.from(sentence).length;
    if (result && length + size > limit) break;
    result += sentence;
    length += size;
  }
  return result.trimEnd();
}
