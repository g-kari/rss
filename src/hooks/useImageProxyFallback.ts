import { useCallback, useState, type SyntheticEvent } from "react";
import { buildImageProxyUrl, isProxiedImageUrl } from "../lib/image-proxy-url";

export interface UseImageProxyFallbackOptions {
  /** 画像 load 成功時に consumer に転送される (attempt 0 / 1 いずれの src でも) */
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
  /**
   * fallback chain が完全に諦めた時 (attempt 2 に到達) のみ呼ばれる。
   * 中間 (attempt 0 → 1) は fallback 継続中のため consumer に通知しない。
   */
  onError?: (e: SyntheticEvent<HTMLImageElement>) => void;
}

export interface UseImageProxyFallbackReturn {
  src: string;
  onLoad: (e: SyntheticEvent<HTMLImageElement>) => void;
  onError: (e?: SyntheticEvent<HTMLImageElement>) => void;
  attempt: 0 | 1 | 2;
}

export function useImageProxyFallback(
  originalUrl: string,
  options?: UseImageProxyFallbackOptions,
): UseImageProxyFallbackReturn {
  const [attempt, setAttempt] = useState<0 | 1 | 2>(0);
  const proxied = buildImageProxyUrl(originalUrl);
  const canFallback = !isProxiedImageUrl(originalUrl) && proxied !== originalUrl;
  const src = attempt === 0 ? proxied : canFallback ? originalUrl : proxied;
  const consumerOnLoad = options?.onLoad;
  const consumerOnError = options?.onError;
  const onLoad = useCallback(
    (e: SyntheticEvent<HTMLImageElement>) => {
      consumerOnLoad?.(e);
    },
    [consumerOnLoad],
  );
  const onError = useCallback(
    (e?: SyntheticEvent<HTMLImageElement>) => {
      if (attempt === 0 && canFallback) {
        setAttempt(1);
        return;
      }
      setAttempt(2);
      if (e) consumerOnError?.(e);
    },
    [attempt, canFallback, consumerOnError],
  );
  return { src, onLoad, onError, attempt };
}
