"use client";

import { useEffect, useState } from "react";
import App from "@/App";
import { installDemoFetch } from "./mock";

export default function DemoApp() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installDemoFetch();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface-base">
        <div className="w-1.5 h-1.5 rounded-full bg-surface-subtle animate-pulse" />
      </div>
    );
  }

  return <App />;
}
