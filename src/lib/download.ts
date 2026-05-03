/** createObjectURL → <a> クリック → revoke のブラウザダウンロードパターン */

/** revokeObjectURL の遅延時間（ブラウザ保存ダイアログがクローズする猶予） */
export const REVOKE_DELAY_MS = 1000;

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
