/** Service Worker の API キャッシュを無効化する */
export function invalidateSwCache(paths?: string[]): void {
  navigator.serviceWorker?.controller?.postMessage({
    type: "INVALIDATE_API_CACHE",
    paths,
  });
}
