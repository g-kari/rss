import { transformXTweetEmbeds } from "./content";
import { sanitizeHtml } from "./html";

/** 埋め込みメディアの情報 */
export interface EmbedInfo {
  embedUrl: string;
  type: "video" | "audio";
  audioHeight?: number;
  allow: string;
}

/** 埋め込み可能なサービスの URL パターンマッチ */
export function extractEmbedInfo(url: string): EmbedInfo | null {
  const ALLOW_VIDEO =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  const ALLOW_AUDIO = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";

  // YouTube
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  if (yt)
    return {
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt[1]}?origin=https://rss.0g0.xyz`,
      type: "video",
      allow: ALLOW_VIDEO,
    };

  // Vimeo
  const vim = url.match(/vimeo\.com\/(\d+)/);
  if (vim)
    return {
      embedUrl: `https://player.vimeo.com/video/${vim[1]}`,
      type: "video",
      allow: "autoplay; fullscreen; picture-in-picture",
    };

  // ニコニコ動画
  const nico = url.match(/nicovideo\.jp\/watch\/((?:sm|nm|so|lv)\d+|\d+)/);
  if (nico)
    return {
      embedUrl: `https://embed.nicovideo.jp/watch/${nico[1]}?autoplay=0`,
      type: "video",
      allow: ALLOW_VIDEO,
    };

  // Twitch クリップ
  const twitchClip = url.match(/clips\.twitch\.tv\/([A-Za-z0-9_-]+)/);
  if (twitchClip)
    return {
      embedUrl: `https://clips.twitch.tv/embed?clip=${twitchClip[1]}&parent=rss.0g0.xyz`,
      type: "video",
      allow: "autoplay; fullscreen",
    };

  // Twitch チャンネル / VOD
  const twitchVideo = url.match(/twitch\.tv\/videos\/(\d+)/);
  if (twitchVideo)
    return {
      embedUrl: `https://player.twitch.tv/?video=${twitchVideo[1]}&parent=rss.0g0.xyz`,
      type: "video",
      allow: "autoplay; fullscreen",
    };
  const twitchCh = url.match(/twitch\.tv\/([A-Za-z0-9_]+)$/);
  if (twitchCh)
    return {
      embedUrl: `https://player.twitch.tv/?channel=${twitchCh[1]}&parent=rss.0g0.xyz`,
      type: "video",
      allow: "autoplay; fullscreen",
    };

  // Spotify
  const spotify = url.match(
    /open\.spotify\.com\/(track|album|playlist|episode|artist)\/([A-Za-z0-9]+)/,
  );
  if (spotify) {
    const isShort = spotify[1] === "track" || spotify[1] === "episode";
    return {
      embedUrl: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}`,
      type: "audio",
      audioHeight: isShort ? 152 : 380,
      allow: ALLOW_AUDIO,
    };
  }

  return null;
}

/** RSS コンテンツ内の iframe をレスポンシブラッパーで包む（YouTube origin のみ）。
 * また X (Twitter) の tweet blockquote をインライン iframe 埋め込みに変換する。
 *
 * @param theme - X ツイート埋め込みのテーマ（'light' | 'dark'）
 */
export function processContent(html: string, theme: "light" | "dark" = "light"): string {
  html = sanitizeHtml(transformXTweetEmbeds(html, theme));
  return html.replace(
    /<iframe([^>]*src=["'][^"']*(?:youtube(?:-nocookie)?\.com\/embed)[^"']*["'][^>]*)>([\s\S]*?)<\/iframe>/gi,
    (_match, attrs, inner) => {
      const vidMatch = attrs.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      const fallback = vidMatch
        ? `<a href="https://www.youtube.com/watch?v=${vidMatch[1]}" target="_blank" rel="noopener noreferrer" style="display:inline-block;font-size:11px;margin-top:4px;margin-bottom:8px;opacity:0.55">YouTube で見る ↗</a>`
        : "";
      // YouTube は HTTP Referer の提供を必須とするため origin パラメータを付与する
      const patchedAttrs = attrs.replace(
        /(src\s*=\s*["'])(https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/[^"']*)(")/i,
        (_m: string, pre: string, url: string, quote: string) => {
          const sep = url.includes("?") ? "&" : "?";
          return `${pre}${url}${sep}origin=https://rss.0g0.xyz${quote}`;
        },
      );
      return (
        `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;margin:1.25em 0;border-radius:8px">` +
        `<iframe${patchedAttrs} referrerpolicy="strict-origin-when-cross-origin" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0">${inner}</iframe>` +
        `</div>` +
        fallback
      );
    },
  );
}

/** 埋め込み表示する場合、コンテンツ内の iframe を除去（二重埋め込み防止） */
export function stripIframes(html: string): string {
  // 単純 replace は `<ifr<iframe></iframe>ame></iframe>` のようなネスト再出現バイパスを
  // 許すため不動点まで反復する。最終的に sanitizeHtml が二重ガードになる。
  let prev: string;
  let curr = html;
  let pass = 0;
  do {
    prev = curr;
    curr = curr.replace(/<iframe\b[\s\S]*?<\/iframe\b[^>]*>/gi, "");
    pass++;
  } while (curr !== prev && pass < 8);
  return sanitizeHtml(curr);
}
