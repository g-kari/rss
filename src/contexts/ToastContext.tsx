"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface ToastValue {
  toast: string | null;
  showToast: (msg: string) => void;
}

const ToastContext = createContext<ToastValue | null>(null);

interface ProviderProps {
  value: ToastValue;
  children: ReactNode;
}

export function ToastProvider({ value, children }: ProviderProps) {
  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast(): ToastValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
