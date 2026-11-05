export const qualitySentence =
  "日本コロムビアは1日、YouTubeチャンネル登録者数11.5万人を超えたクリエイターの新しい活動について発表しました。";
export const qualityParagraphs = Array.from(
  { length: 9 },
  (_, index) => `<p>${index + 1}段落目。${qualitySentence}</p>`,
).join("");
export function summaryFixtureDescription(index: number, long = false): string {
  return long
    ? `フィード説明 ${index + 1}。${Array.from(
        { length: 100 },
        (_, paragraph) => `読み込み済みの説明の段落 ${paragraph + 1} を自分のペースで読みます。`,
      ).join("\n\n")}`
    : `フィード説明 ${index + 1}。すでに読み込んだ説明を自分のペースで読みます。保存済みの要約を確認しても新しいAI処理は行いません。`;
}
