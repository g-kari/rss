// 認証なしで UI / デザイン確認ができるデモページ。
// `/demo` にアクセスするとモックデータで App コンポーネントが描画される。
// fetch をインターセプトして API レスポンスを差し替えるため、書き込み系の操作は
// 画面上は反映されるがサーバーには送信されない（ローカル state のみ）。
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import DemoApp from "./DemoApp";

export default function DemoPage() {
  return (
    <Suspense>
      <DemoApp />
    </Suspense>
  );
}
