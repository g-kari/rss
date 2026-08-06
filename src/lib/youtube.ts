const VIDEO_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** YouTube URL から動画 ID を抽出する。対応外の URL は null を返す。 */
export function extractYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, "https://invalid.local");
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  let videoId: string | null = null;
  if (host === "youtu.be") {
    videoId = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
  } else if (YOUTUBE_HOSTS.has(host)) {
    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments[0] === "watch") videoId = parsed.searchParams.get("v");
    else if (["shorts", "embed", "live"].includes(segments[0])) videoId = segments[1] ?? null;
  }
  return videoId && VIDEO_ID_PATTERN.test(videoId) ? videoId : null;
}
