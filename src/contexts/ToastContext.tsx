"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ToastApi } from "@/hooks/useToast";

const ToastContext = createContext<ToastApi | null>(null);

interface ProviderProps {
  value: ToastApi;
  children: ReactNode;
}

export function ToastProvider({ value, children }: ProviderProps) {
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
