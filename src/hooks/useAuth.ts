import { useState, useEffect } from 'react';
import type { UserProfile } from '../types';

interface AuthState {
  user: UserProfile | null | undefined; // undefined = ローディング中
  betaRestricted: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  const [betaRestricted, setBetaRestricted] = useState(false);

  useEffect(() => {
    // URL パラメーターでベータ制限リダイレクトを検出
    if (new URLSearchParams(window.location.search).get('beta') === 'denied') {
      setBetaRestricted(true);
      setUser(null);
      return;
    }
    fetch('/api/auth/me')
      .then((r) => r.json<{ user: UserProfile | null; betaRestricted?: boolean }>())
      .then(({ user, betaRestricted }) => {
        if (betaRestricted) setBetaRestricted(true);
        setUser(user);
      })
      .catch(() => setUser(null));
  }, []);

  return { user, betaRestricted };
}
