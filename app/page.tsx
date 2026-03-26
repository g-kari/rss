// 完全クライアントサイドの SPA なので静的プリレンダーを無効化
export const dynamic = "force-dynamic";

import { Suspense } from "react";
import App from "@/App";

export default function Page() {
  return (
    <Suspense>
      <App />
    </Suspense>
  );
}
