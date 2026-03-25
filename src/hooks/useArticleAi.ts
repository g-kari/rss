'use client';

import { useState, useCallback } from 'react';
import type { AiMode } from '../types';
import { aiLruCache } from '../lib/lru-cache';

function loadAiCache(articleId: string, mode: AiMode): string | null {
  return aiLruCache.get(`${articleId}:${mode}`);
}

function saveAiCache(articleId: string, mode: AiMode, text: string): void {
  aiLruCache.set(`${articleId}:${mode}`, text);
}

interface ArticleAiState {
  aiResult: { mode: AiMode; text: string } | null;
  aiLoading: AiMode | null;
  aiError: string;
  /** AI 実行（LRU キャッシュ優先、サーバー側コンテンツ取得） */
  doRunAi: (mode: AiMode, url: string, articleId?: string) => Promise<void>;
  resetAi: () => void;
}

export function useArticleAi(_articleId: string | undefined): ArticleAiState {
  const [aiResult, setAiResult] = useState<{ mode: AiMode; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState<AiMode | null>(null);
  const [aiError, setAiError] = useState('');

  const doRunAi = useCallback(async (mode: AiMode, url: string, articleId?: string) => {
    if (!url.trim()) return;

    // LRU キャッシュヒット時は API コールなし
    if (articleId) {
      const cached = loadAiCache(articleId, mode);
      if (cached) {
        setAiResult({ mode, text: cached });
        return;
      }
    }

    setAiLoading(mode);
    setAiError('');
    try {
      const endpoint = mode === 'summary' ? '/api/ai/summarize' : '/api/ai/translate';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, articleId }),
      });
      const data = (await res.json()) as { result?: string; error?: string };
      if (data.result) {
        if (articleId) saveAiCache(articleId, mode, data.result);
        setAiResult({ mode, text: data.result });
      } else if (data.error) {
        setAiError(data.error);
      } else {
        setAiError('AI の処理に失敗しました');
      }
    } catch {
      setAiError('AI の処理に失敗しました');
    } finally {
      setAiLoading(null);
    }
  }, []);

  const resetAi = useCallback(() => {
    setAiResult(null);
    setAiError('');
    setAiLoading(null);
  }, []);

  return { aiResult, aiLoading, aiError, doRunAi, resetAi };
}
