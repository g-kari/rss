import { useCallback, useState } from "react";
import { buildImageProxyUrl, isProxiedImageUrl } from "../lib/image-proxy-url";

export interface UseImageProxyFallbackReturn {
  src: string;
  onError: () => void;
  attempt: 0 | 1 | 2;
}

export function useImageProxyFallback(originalUrl: string): UseImageProxyFallbackReturn {
  const [attempt, setAttempt] = useState<0 | 1 | 2>(0);
  const proxied = buildImageProxyUrl(originalUrl);
  const canFallback = !isProxiedImageUrl(originalUrl) && proxied !== originalUrl;
  const src = attempt === 0 ? proxied : canFallback ? originalUrl : proxied;
  const onError = useCallback(() => {
    setAttempt((prev) => {
      if (prev === 0 && canFallback) return 1;
      return 2;
    });
  }, [canFallback]);
  return { src, onError, attempt };
}
