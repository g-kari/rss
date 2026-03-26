/** ベース画像をキャッシュして再読み込みを避ける */
let baseImg: HTMLImageElement | null = null;

function loadBaseImage(): Promise<HTMLImageElement> {
  if (baseImg) return Promise.resolve(baseImg);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      baseImg = img;
      resolve(img);
    };
    img.onerror = () => resolve(img);
    img.src = "/favicon.png";
  });
}

/**
 * ファビコンに未読件数バッジを描画する。
 * count が 0 の場合は元のファビコンに戻す。
 */
export async function updateFaviconBadge(count: number): Promise<void> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = await loadBaseImage();
    ctx.drawImage(img, 0, 0, 32, 32);

    if (count > 0) {
      const label = count > 99 ? "99+" : String(count);
      const r = label.length >= 3 ? 9 : 8;
      const cx = 32 - r;
      const cy = r;

      // バッジ背景（rose-400）
      ctx.fillStyle = "#fb7185";
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();

      // バッジテキスト
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${label.length >= 3 ? "7" : "9"}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy);
    }

    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
  } catch {
    // ファビコン更新失敗は無視（ブラウザ互換性問題など）
  }
}
