import { test, expect } from "@playwright/test";
import { extractEmbedThumbnailUrl, extractEmbedInfo } from "../src/lib/embed-utils";
import { extractYouTubeVideoId } from "../src/lib/youtube";

// ── extractEmbedThumbnailUrl ──────────────────────────────────

test.describe("extractEmbedThumbnailUrl — YouTube", () => {
  test("モバイル YouTube URL から動画 ID を抽出する", () => {
    expect(extractYouTubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("プロトコル相対の短縮 URL から動画 ID を抽出する", () => {
    expect(extractYouTubeVideoId("//youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("通常の YouTube watch URL からサムネイルを返す", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("youtube-nocookie.com の embed URL からサムネイルを返す", () => {
    const url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?origin=https://rss.0g0.xyz";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("youtube-nocookie.com の embed URL（クエリなし）からサムネイルを返す", () => {
    const url = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("YouTube Shorts URL からサムネイルを返す", () => {
    const url = "https://www.youtube.com/shorts/dQw4w9WgXcQ";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("YouTube embed URL からサムネイルを返す", () => {
    const url = "https://www.youtube.com/embed/dQw4w9WgXcQ";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("YouTube live URL からサムネイルを返す", () => {
    const url = "https://www.youtube.com/live/dQw4w9WgXcQ";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("youtu.be 短縮 URL からサムネイルを返す", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("クエリパラメータが複数ある YouTube URL も正しく処理する", () => {
    const url = "https://www.youtube.com/watch?list=PLxxx&v=dQw4w9WgXcQ&t=30";
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
  });

  test("サムネイル URL の video ID が正しく埋め込まれている", () => {
    const videoId = "abc1234DEFG";
    const url = `https://www.youtube.com/embed/${videoId}`;
    const result = extractEmbedThumbnailUrl(url);
    expect(result).toContain(videoId);
    expect(result).toContain("i.ytimg.com/vi/");
    expect(result).toContain("mqdefault.jpg");
  });
});

test.describe("extractEmbedThumbnailUrl — YouTube 以外は null", () => {
  test("Vimeo URL は null を返す", () => {
    const url = "https://player.vimeo.com/video/123456789";
    expect(extractEmbedThumbnailUrl(url)).toBeNull();
  });

  test("ニコニコ動画 URL は null を返す", () => {
    const url = "https://embed.nicovideo.jp/watch/sm12345678?autoplay=0";
    expect(extractEmbedThumbnailUrl(url)).toBeNull();
  });

  test("SpeakerDeck URL は null を返す", () => {
    const url = "https://speakerdeck.com/player/abc123";
    expect(extractEmbedThumbnailUrl(url)).toBeNull();
  });

  test("SlideShare URL は null を返す", () => {
    const url = "https://www.slideshare.net/slideshow/embed_code/12345";
    expect(extractEmbedThumbnailUrl(url)).toBeNull();
  });

  test("Spotify URL は null を返す", () => {
    const url = "https://open.spotify.com/embed/track/abc123";
    expect(extractEmbedThumbnailUrl(url)).toBeNull();
  });

  test("完全に無関係な URL は null を返す", () => {
    expect(extractEmbedThumbnailUrl("https://example.com/video")).toBeNull();
  });

  test("YouTube に似た別ホストは null を返す", () => {
    expect(extractEmbedThumbnailUrl("https://evilyoutube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  test("空文字は null を返す", () => {
    expect(extractEmbedThumbnailUrl("")).toBeNull();
  });

  test("不正な URL 文字列は null を返す", () => {
    expect(extractEmbedThumbnailUrl("not-a-url")).toBeNull();
  });
});

// ── extractEmbedInfo — YouTube ────────────────────────────────

test.describe("extractEmbedInfo — YouTube", () => {
  test("youtube.com watch URL を認識する", () => {
    const info = extractEmbedInfo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.type).toBe("video");
    expect(info!.embedUrl).toContain("youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  test("YouTube Shorts URL を認識する", () => {
    const info = extractEmbedInfo("https://www.youtube.com/shorts/dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("youtu.be 短縮 URL を認識する", () => {
    const info = extractEmbedInfo("https://youtu.be/dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("YouTube embed URL を認識する", () => {
    const info = extractEmbedInfo("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(info).not.toBeNull();
    expect(info!.embedUrl).toContain("dQw4w9WgXcQ");
  });

  test("プライバシー強化モード (youtube-nocookie.com) の URL を使う", () => {
    const info = extractEmbedInfo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(info!.embedUrl).toContain("youtube-nocookie.com");
  });

  test("allow フィールドに必要なパーミッションが含まれる", () => {
    const info = extractEmbedInfo("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(info!.allow).toContain("autoplay");
  });
});
