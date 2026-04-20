// 完全クライアントサイドの SPA なので静的プリレンダーを無効化
export const dynamic = "force-dynamic";

import ClientApp from "./ClientApp";

export default function Page() {
  return <ClientApp />;
}
