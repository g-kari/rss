import { useState, useEffect, useRef } from "react";

const GRACE_PERIOD_MS = 30000;

/**
 * 直前の選択 ID を一定時間保持するフック。
 *
 * 未読フィルター中でも前の記事に戻れるようにするために、
 * 選択が外れた直後から GRACE_PERIOD_MS の間だけ前の ID を返し続ける。
 *
 * @param currentId 現在選択中の ID
 * @returns grace period 中の前の ID（期限切れまたは選択なし時は null）
 */
export function useGracePeriod(currentId: string | null | undefined): string | null {
  const [gracePeriodId, setGracePeriodId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevIdRef = useRef<string | null | undefined>(currentId);

  useEffect(() => {
    const prev = prevIdRef.current;
    prevIdRef.current = currentId;
    if (prev && prev !== currentId) {
      setGracePeriodId(prev);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setGracePeriodId(null), GRACE_PERIOD_MS);
    }
  }, [currentId]);

  // アンマウント時のみタイマーをクリア（currentId 変更時にクリアすると grace period が無効化される）
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return gracePeriodId;
}
