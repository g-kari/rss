"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Article } from "../types";
import {
  immersiveCaptions,
  immersiveExcerpt,
  immersiveVideoSource,
} from "../lib/immersive-articles";
import { useVisualMode } from "../contexts/VisualModeContext";
import { useImmersiveClock } from "../hooks/useImmersiveClock";
import { CINEMATIC_DURATION, useCinematicPlayback } from "../hooks/useCinematicPlayback";
import { ArticleThumbnail } from "./article-items/shared";
import CinematicVideo from "./CinematicVideo";

interface Props {
  article: Article;
  thumb?: string;
  thumbnailFallbacks?: string[];
  feedTitle: string;
  active: boolean;
  paused?: boolean;
  speed?: number;
  onComplete?: () => void;
}

export default function CinematicArticle({
  article,
  thumb,
  thumbnailFallbacks,
  feedTitle,
  active,
  paused = false,
  speed = 1,
  onComplete,
}: Props) {
  const { motionEnabled, motionReason, pageVisible } = useVisualMode();
  // Opening immersive mode opts in independently of the normal reader's visual skin.
  const motionAllowed = motionEnabled && !motionReason;
  const imageRef = useRef<HTMLDivElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const fallback = useCallback(() => setVideoFailed(true), []);
  const video = useMemo(() => immersiveVideoSource(article), [article]);
  const captions = useMemo(() => immersiveCaptions(article), [article]);
  const duration = Math.max(CINEMATIC_DURATION, captions.length * 5000);
  const nativeVideo = active && motionAllowed && !!video && !videoFailed;
  const playback = useCinematicPlayback(
    imageRef,
    active && motionAllowed && !nativeVideo,
    pageVisible,
    {
      autoPlay: true,
      paused,
      speed,
      duration,
    },
  );
  const elapsed = useImmersiveClock(
    active && !nativeVideo,
    paused,
    pageVisible,
    speed,
    duration,
    onComplete,
  );
  const progress = nativeVideo ? videoProgress : elapsed / duration;
  const captionIndex = Math.min(captions.length - 1, Math.floor(progress * captions.length));
  return (
    <div className="cinematic-article">
      <div
        className="cinematic-shot"
        data-playing={active && !paused && pageVisible ? "true" : "false"}
      >
        <div ref={imageRef} className="cinematic-image" aria-hidden="true">
          <ArticleThumbnail
            thumb={thumb}
            fallbacks={thumbnailFallbacks}
            className="h-full w-full object-cover"
          />
        </div>
        {nativeVideo && (
          <CinematicVideo
            key={video}
            src={video!}
            paused={paused}
            pageVisible={pageVisible}
            speed={speed}
            onProgress={setVideoProgress}
            onComplete={() => onComplete?.()}
            onFallback={fallback}
          />
        )}
        <div className="cinematic-shade" aria-hidden="true" />
        <div className="cinematic-copy">
          <p className="cinematic-feed">
            {feedTitle} · {nativeVideo ? "動画・音声なし" : "記事のショート表示"}
          </p>
          <h3 className="sr-only">{article.title}</h3>
          <p className="cinematic-caption" key={captionIndex} aria-hidden="true">
            {captions[captionIndex]}
          </p>
          {(!motionAllowed || playback.failed) && (
            <p className="cinematic-static">
              {!motionAllowed
                ? `画像の動きは停止中（${motionReason || "動き OFF"}）`
                : "画像の動きを利用できません"}{" "}
              · 記事の自動送りは再生ボタンで操作できます
            </p>
          )}
        </div>
        <div className="cinematic-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <p className="cinematic-transcript sr-only">
        <span>フィードの説明</span>
        {immersiveExcerpt(article) || "短い説明はありません。「本文を読む」から記事を開けます。"}
      </p>
    </div>
  );
}
