import { expect, it } from "vitest";
import { immersiveSentences, sentenceExcerpt } from "./immersive-text";
import { immersiveCaptions } from "./immersive-articles";
import { makeArticle } from "../../e2e/helpers/article";

it("preserves meaningful whitespace when grouping multilingual caption sentences", () => {
  const text = "Hello. Next sentence.";
  expect(immersiveSentences(text).join("")).toBe(text);
  expect(immersiveCaptions(makeArticle({ title: "English headline", summary: text }))).toEqual([
    "English headline",
    text,
  ]);
});
it("preserves sentence spacing at the excerpt limit without splitting decimals or Unicode", () => {
  expect(sentenceExcerpt("Hello. Next sentence. Final sentence.", 22)).toBe(
    "Hello. Next sentence.",
  );
  const text = "Version 11.5 is here. Play 🎮 now!";
  expect(immersiveSentences(text).join("")).toBe(text);
  expect(immersiveCaptions(makeArticle({ title: "Headline", summary: text }))).toEqual([
    "Headline",
    text,
  ]);
});
