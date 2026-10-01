import { expect, it } from "vitest";
import { prepareImmersiveInlineContent } from "./immersive-inline-content";
it("preserves sanitized body/media with manual controls and removes native autoplay", () => {
  const result = prepareImmersiveInlineContent(
    '<p>本文</p><video src="https://example.com/video.mp4" autoplay muted onerror="evil()"></video><audio src="https://example.com/audio.mp3" autoplay="true"></audio><script>evil()</script>',
  );
  expect(result).toContain("本文");
  expect(result).toContain("controls");
  expect(result).not.toMatch(/autoplay|onerror|<script/);
});

it("does not delegate autoplay to embedded publishers", () => {
  const result = prepareImmersiveInlineContent(
    '<iframe src="https://www.youtube.com/embed/ABCDEFGHIJK" allow="autoplay; fullscreen; encrypted-media"></iframe>',
  );
  expect(result).toContain("fullscreen");
  expect(result).not.toContain("autoplay");
});
