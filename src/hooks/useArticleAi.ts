'use client';

import { useState, useCallback, useRef } from 'react';
import type { AiMode } from '../types';
import { STORAGE_KEYS, storageGet, storageSet, storageRemove } from '../lib/storage';
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
  stickyAiMode: AiMode | null;
  stickyAiModeRef: React.RefObject<AiMode | null>;
  /** AI 実行（キャッシュ優先、API フォールバック）。トグル動作なし */
  doRunAi: (mode: AiMode, contentHtml: string, articleId?: string) => Promise<void>;
  /** ボタンクリック用: トグル + モード永続化 */
  runAi: (mode: AiMode, contentHtml: string) => void;
  resetAi: () => void;
}

export function useArticleAi(articleId: string | undefined): ArticleAiState {
  const [aiResult, setAiResult] = useState<{ mode: AiMode; text: string } | null>(null);
  const [aiLoading, setAiLoading] = useState<AiMode | null>(null);
  const [aiError, setAiError] = useState('');
  const [stickyAiMode, setStickyAiMode] = useState<AiMode | null>(() => {
    const v = storageGet(STORAGE_KEYS.AI_MODE);
    return v === 'summary' || v === 'translation' ? v : null;
  });
  const stickyAiModeRef = useRef<AiMode | null>(stickyAiMode);
  stickyAiModeRef.current = stickyAiMode;

  const doRunAi = useCallback(async (mode: AiMode, contentHtml: string, articleIdArg?: string) => {
    if (!contentHtml.trim()) return;

    // キャッシュヒット時は API コールなし
    if (articleIdArg) {
      const cached = loadAiCache(articleIdArg, mode);
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
        body: JSON.stringify({ text: contentHtml }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (data.result) {
        if (articleIdArg) saveAiCache(articleIdArg, mode, data.result);
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

  const runAi = useCallback((mode: AiMode, contentHtml: string) => {
    if (aiResult?.mode === mode) {
      setAiResult(null);
      setStickyAiMode(null);
      storageRemove(STORAGE_KEYS.AI_MODE);
      return;
    }
    setStickyAiMode(mode);
    storageSet(STORAGE_KEYS.AI_MODE, mode);
    doRunAi(mode, contentHtml, articleId);
  }, [aiResult, doRunAi, articleId]);

  const resetAi = useCallback(() => {
    setAiResult(null);
    setAiError('');
    setAiLoading(null);
  }, []);

  return { aiResult, aiLoading, aiError, stickyAiMode, stickyAiModeRef, doRunAi, runAi, resetAi };
}
