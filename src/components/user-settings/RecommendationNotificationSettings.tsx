"use client";

import {
  useRecommendationPushSettings,
  type RecommendationPushSettings,
} from "../../hooks/useRecommendationPushSettings";
import { SettingRow, ToggleSwitch } from "./shared";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, slot) => {
  const time = `${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`;
  return (
    <option key={time} value={time}>
      {time}
    </option>
  );
});
interface Props {
  userId: string;
  config: RecommendationPushSettings | null;
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
}
export default function RecommendationNotificationSettings({
  userId,
  config,
  timezone,
  onTimezoneChange,
}: Props) {
  const { value, disabled, save } = useRecommendationPushSettings(
    userId,
    config,
    timezone,
    onTimezoneChange,
  );
  return (
    <div className="flex flex-col gap-3">
      <SettingRow label="おすすめ記事通知">
        <ToggleSwitch
          checked={value.recommendationEnabled}
          disabled={disabled}
          onChange={(recommendationEnabled) => {
            void save({ ...value, recommendationEnabled });
          }}
          ariaLabel={
            value.recommendationEnabled
              ? "おすすめ記事通知を OFF にする"
              : "おすすめ記事通知を ON にする"
          }
        />
      </SettingRow>
      <p className="text-[11px] text-text-muted pl-28">
        1日1回、直近7日以内の未読のおすすめ記事を最大3件まとめて届けます。通知済みの記事は30日間、NSFW記事は常に除外します。候補がない日は通知しません。
      </p>
      <SettingRow label="配信時刻（目安）">
        <select
          aria-label="おすすめ記事通知 配信時刻（30分刻み）"
          value={value.recommendationTime}
          disabled={disabled}
          onChange={(event) => {
            void save({ ...value, recommendationTime: event.target.value });
          }}
          className="text-[13px] bg-surface-subtle border border-border-default rounded-md px-2 py-1 text-text-default focus:outline-none focus:ring-1 focus:ring-text-muted disabled:opacity-50"
        >
          {TIME_OPTIONS}
        </select>
      </SettingRow>
      <div className="flex flex-col gap-1 pl-28 text-[11px] text-text-muted">
        <p>
          30分刻みの定期処理で選択時刻ごろに配信します（{timezone || "端末のタイムゾーン"}
          ）。サイレント時間帯中は当日中の送信可能な時間まで延期し、日をまたぐ場合はその日分を送りません。
        </p>
        <p>
          保存・いいね・あとで読むの同期済みデータをおすすめの選定に使います。ON
          にすると「興味なし」の記事 ID と日時も同期します。閲覧履歴は追加送信しません。
        </p>
        <p>
          受信にはメニューから Push
          通知の有効化が必要です。この設定だけではブラウザの通知許可や購読は変更しません。
        </p>
      </div>
    </div>
  );
}
