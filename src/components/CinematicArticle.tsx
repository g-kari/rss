"use client";

import { useRef } from "react";
import type { Article } from "../types";
import { immersiveExcerpt } from "../lib/immersive-articles";
import { useVisualMode } from "../contexts/VisualModeContext";
import { CINEMATIC_DURATION, useCinematicPlayback } from "../hooks/useCinematicPlayback";
import { ArticleThumbnail } from "./article-items/shared";

interface Props {
  article: Article;
  thumb?: string;
  feedTitle: string;
  active: boolean;
}

export default function CinematicArticle({ article, thumb, feedTitle, active }: Props) {
  const { motionAllowed, pageVisible } = useVisualMode();
  const imageRef = useRef<HTMLDivElement>(null);
  const playback = useCinematicPlayback(imageRef, active && motionAllowed, pageVisible);
  const excerpt = immersiveExcerpt(article);
  // Verbatim feed text, not generated summaries or invented key points.
  const captions = Array.from(excerpt.matchAll(/.{1,80}/gu), (part) => part[0]);
  const captionIndex = Math.min(
    captions.length - 1,
    Math.floor(playback.elapsed / (CINEMATIC_DURATION / Math.max(1, captions.length))),
  );
  const caption = captions[captionIndex] || "気になったら「本文を読む」へ";
  const animated = motionAllowed && !playback.failed;
  return (
    <div className="cinematic-article">
      <div
        className="cinematic-shot"
        data-playing={playback.playing && pageVisible ? "true" : "false"}
      >
        <div ref={imageRef} className="cinematic-image" aria-hidden="true">
          <ArticleThumbnail thumb={thumb} className="h-full w-full object-contain" />
        </div>
        <div className="cinematic-shade" aria-hidden="true" />
        <div className="cinematic-kicker" aria-hidden="true">
          <span>STORY / 20 SEC</span>
          <span>◈</span>
        </div>
        <div className="cinematic-copy">
          <p className="cinematic-feed">{feedTitle}</p>
          <h3 className="cinematic-title">{article.title}</h3>
          {animated && (
            <p className="cinematic-caption" key={captionIndex} aria-hidden="true">
              {caption}
            </p>
          )}
        </div>
        <div className="cinematic-progress" aria-hidden="true">
          <span style={{ width: `${(playback.elapsed / CINEMATIC_DURATION) * 100}%` }} />
        </div>
      </div>
      {active && (
        <div className="cinematic-controls">
          {animated ? (
            <button
              type="button"
              className="visual-mode-switch"
              onClick={playback.toggle}
              aria-label={
                playback.playing
                  ? "演出を一時停止"
                  : playback.finished
                    ? "20秒の演出をもう一度再生"
                    : "20秒の演出を再生"
              }
            >
              {playback.playing
                ? "Ⅱ 一時停止"
                : playback.finished
                  ? "↻ もう一度"
                  : "▷ 20秒で眺める"}
            </button>
          ) : (
            <span>静止表示で楽しめます</span>
          )}
          <span>{playback.finished ? "ここでストップ" : "自動では次に進みません"}</span>
        </div>
      )}
      <p className="cinematic-transcript">
        <span>フィードの説明</span>
        {excerpt || "短い説明はありません。「本文を読む」から記事を開けます。"}
      </p>
    </div>
  );
}
