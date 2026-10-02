"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Article } from "../types";
import type { ImmersiveTextPresentation } from "../lib/immersive-summary";
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
  textPresentation?: ImmersiveTextPresentation;
  thumb?: string;
  thumbnailFallbacks?: string[];
  feedTitle: string;
  active: boolean;
  paused?: boolean;
  speed?: number;
  onComplete?: () => void;
  onPause?: () => void;
  failedThumbnails?: ReadonlySet<string>;
  onThumbnailFailure?: (source: string) => void;
}

export default function CinematicArticle({
  article,
  textPresentation,
  thumb,
  thumbnailFallbacks,
  feedTitle,
  active,
  paused = false,
  speed = 1,
  onComplete,
  onPause,
  failedThumbnails,
  onThumbnailFailure,
}: Props) {
  const { motionEnabled, motionReason, pageVisible } = useVisualMode();
  // Opening immersive mode opts in independently of the normal reader's visual skin.
  const motionAllowed = motionEnabled && !motionReason;
  const imageRef = useRef<HTMLDivElement>(null);
  const captionRef = useRef<HTMLDivElement>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [manualCaption, setManualCaption] = useState<number | null>(null);
  useEffect(() => {
    if (!paused) setManualCaption(null);
  }, [paused]);
  const fallback = useCallback(() => setVideoFailed(true), []);
  const video = useMemo(() => immersiveVideoSource(article), [article]);
  const excerpt = textPresentation?.text ?? immersiveExcerpt(article);
  const captions = useMemo(() => immersiveCaptions(article, excerpt), [article, excerpt]);
  const captionTimes = captions.map((caption) => Math.max(5000, Array.from(caption).length * 90));
  const readingDuration = captionTimes.reduce((total, time) => total + time, 0);
  const duration = Math.max(CINEMATIC_DURATION, readingDuration);
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
  let captionIndex = 0;
  let captionEnd = captionTimes[0];
  while (captionIndex < captions.length - 1 && progress * readingDuration >= captionEnd)
    captionEnd += captionTimes[++captionIndex];
  captionIndex = Math.min(captions.length - 1, manualCaption ?? captionIndex);
  useLayoutEffect(() => {
    if (captionRef.current) captionRef.current.scrollTop = 0;
  }, [captionIndex, excerpt]);
  const moveCaption = (next: number) => {
    onPause?.();
    setManualCaption(Math.max(0, Math.min(captions.length - 1, next)));
  };
  const hasContext =
    !!textPresentation?.metadata ||
    textPresentation?.previewShortened ||
    !motionAllowed ||
    playback.failed;
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
            limitUpscale
            failedSources={failedThumbnails}
            onSourceFailure={onThumbnailFailure}
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
          <div
            ref={captionRef}
            className="cinematic-caption-scroll"
            tabIndex={0}
            aria-label="記事の説明をスクロール"
            onKeyDown={(event) => {
              if (["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key))
                event.stopPropagation();
            }}
          >
            <p className="cinematic-caption" key={captionIndex} aria-hidden="true">
              {captions[captionIndex]}
            </p>
          </div>
          <div className="cinematic-caption-navigation">
            <span>
              {textPresentation?.sourceLabel ?? "読み込み済みの説明・抜粋"} {captionIndex + 1} /{" "}
              {captions.length}
            </span>
            {captions.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="前の説明"
                  disabled={captionIndex === 0}
                  onClick={() => moveCaption(captionIndex - 1)}
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="次の説明"
                  disabled={captionIndex === captions.length - 1}
                  onClick={() => moveCaption(captionIndex + 1)}
                >
                  続き →
                </button>
              </>
            )}
          </div>
          {hasContext && (
            <div
              className="cinematic-context-scroll"
              role="region"
              tabIndex={0}
              aria-label="記事の表示情報をスクロール"
              onFocus={() => onPause?.()}
              onKeyDown={(event) => {
                if (["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key))
                  event.stopPropagation();
              }}
            >
              {textPresentation?.metadata && (
                <p className="cinematic-static" data-testid="caption-summary-provenance">
                  {textPresentation.metadata.inputTruncated === true
                    ? "入力は途中で打ち切り"
                    : textPresentation.metadata.inputTruncated === false
                      ? "入力の打ち切りなし"
                      : "入力の打ち切り有無不明"}{" "}
                  · 本文全体の取得状況不明
                </p>
              )}
              {textPresentation?.previewShortened && (
                <p className="cinematic-static">
                  {textPresentation.source === "cached-ai"
                    ? "表示は要約の抜粋です。続きは要約表示で確認できます。"
                    : "表示は説明・本文の抜粋です。本文から続きを確認できます。"}
                </p>
              )}
              {(!motionAllowed || playback.failed) && (
                <p className="cinematic-static">
                  {!motionAllowed
                    ? `画像の動きは停止中（${motionReason || "動き OFF"}）`
                    : "画像の動きを利用できません"}{" "}
                  · 記事の自動送りは再生ボタンで操作できます
                </p>
              )}
            </div>
          )}
        </div>
        <div className="cinematic-progress" aria-hidden="true">
          <span style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <p className="cinematic-transcript sr-only">
        <span>{textPresentation?.sourceLabel ?? "読み込み済みの説明・抜粋"}</span>
        {excerpt || "短い説明はありません。「本文を読む」から記事を開けます。"}
      </p>
    </div>
  );
}
