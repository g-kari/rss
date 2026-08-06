const YOUTUBE_VIDEO_ID_PATTERN =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtube-nocookie\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

/** YouTube URL から動画 ID を抽出する。対応外の URL は null を返す。 */
export function extractYouTubeVideoId(url: string): string | null {
  return url.match(YOUTUBE_VIDEO_ID_PATTERN)?.[1] ?? null;
}
