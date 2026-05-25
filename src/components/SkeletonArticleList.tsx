"use client";

import type { JSX } from "react";
import type { Layout } from "@/types";

interface Props {
  layout?: Layout;
}

function SkeletonHeader() {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
      <div className="flex items-center gap-2">
        <div className="h-4 w-24 rounded bg-surface-subtle animate-pulse" />
        <div className="h-4 w-8 rounded bg-surface-subtle animate-pulse" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-5 h-5 rounded bg-surface-subtle animate-pulse" />
        <div className="w-5 h-5 rounded bg-surface-subtle animate-pulse" />
      </div>
    </div>
  );
}

function CompactSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex items-center gap-2 px-4 py-1.5 border-b border-border-subtle">
          {i < 4 && (
            <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse flex-shrink-0" />
          )}
          {i >= 4 && <div className="w-1.5 flex-shrink-0" />}
          <div
            className="h-3 rounded bg-surface-subtle animate-pulse flex-1"
            style={{ maxWidth: `${75 + ((i * 13) % 20)}%` }}
          />
          <div className="h-2.5 w-16 rounded bg-surface-subtle animate-pulse flex-shrink-0" />
          <div className="h-2.5 w-10 rounded bg-surface-subtle animate-pulse flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3 border-b border-border-subtle">
          <div className="w-1.5 flex-shrink-0 pt-1.5">
            {i < 4 && <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div
              className="h-3.5 rounded bg-surface-subtle animate-pulse"
              style={{ width: `${75 + ((i * 13) % 20)}%` }}
            />
            <div className="space-y-1.5">
              <div
                className="h-3 rounded bg-surface-subtle animate-pulse"
                style={{ width: "100%" }}
              />
              <div
                className="h-3 rounded bg-surface-subtle animate-pulse"
                style={{ width: `${45 + ((i * 19) % 40)}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-20 rounded bg-surface-subtle animate-pulse" />
              <div className="h-2.5 w-12 rounded bg-surface-subtle animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden p-3">
      <div className="grid grid-cols-2 gap-3">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border-subtle bg-surface-elevated overflow-hidden"
          >
            <div className="aspect-video bg-surface-subtle animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-2.5 w-20 rounded bg-surface-subtle animate-pulse" />
              <div
                className="h-3.5 rounded bg-surface-subtle animate-pulse"
                style={{ width: `${70 + ((i * 17) % 25)}%` }}
              />
              <div
                className="h-3 rounded bg-surface-subtle animate-pulse"
                style={{ width: "90%" }}
              />
              <div className="flex items-center gap-2 pt-1">
                <div className="h-2.5 w-14 rounded bg-surface-subtle animate-pulse" />
                <div className="h-2.5 w-10 rounded bg-surface-subtle animate-pulse" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MagazineSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex gap-3 px-4 py-3 border-b border-border-subtle">
          <div className="w-24 h-20 rounded bg-surface-subtle animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="h-2.5 w-20 rounded bg-surface-subtle animate-pulse" />
            <div
              className="h-3.5 rounded bg-surface-subtle animate-pulse"
              style={{ width: `${70 + ((i * 11) % 25)}%` }}
            />
            <div className="space-y-1.5">
              <div
                className="h-3 rounded bg-surface-subtle animate-pulse"
                style={{ width: "100%" }}
              />
              <div
                className="h-3 rounded bg-surface-subtle animate-pulse"
                style={{ width: `${50 + ((i * 23) % 35)}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2.5 w-16 rounded bg-surface-subtle animate-pulse" />
              <div className="h-2.5 w-10 rounded bg-surface-subtle animate-pulse" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const galleryHeights = [180, 240, 160, 220, 200, 260, 170, 230, 190];

function GallerySkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-hidden p-3">
      <div className="columns-3 gap-3">
        {galleryHeights.map((h, i) => (
          <div
            key={i}
            className="mb-3 rounded-lg overflow-hidden bg-surface-elevated border border-border-subtle break-inside-avoid"
          >
            <div className="bg-surface-subtle animate-pulse" style={{ height: h }} />
            <div className="px-2.5 py-2 space-y-1.5">
              <div
                className="h-3 rounded bg-surface-subtle animate-pulse"
                style={{ width: `${60 + ((i * 13) % 30)}%` }}
              />
              <div className="h-2.5 w-14 rounded bg-surface-subtle animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const skeletonMap: Record<Layout, () => JSX.Element> = {
  compact: CompactSkeleton,
  list: ListSkeleton,
  card: CardSkeleton,
  magazine: MagazineSkeleton,
  gallery: GallerySkeleton,
};

export default function SkeletonArticleList({ layout = "list" }: Props) {
  const Body = skeletonMap[layout];
  return (
    <div
      className="flex flex-col h-full bg-surface-base border-r border-border-default"
      role="status"
      aria-busy="true"
      aria-label="記事一覧を読み込み中"
    >
      <SkeletonHeader />
      <Body />
    </div>
  );
}
