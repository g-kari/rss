// 完全クライアントサイドの SPA なので静的プリレンダーを無効化
export const dynamic = 'force-dynamic';

import App from '@/App';

export default function Page() {
  return <App />;
}
