"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(
      `[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`,
      error,
      info.componentStack,
    );
  }

  reset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full bg-surface-elevated text-center px-6 gap-3">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-text-faint">
            <rect
              width="32"
              height="32"
              rx="8"
              fill="currentColor"
              fillOpacity="0.08"
              stroke="currentColor"
              strokeOpacity="0.2"
              strokeWidth="0.8"
            />
            <path
              d="M16 10v8M16 22v1.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-[10px] tracking-[0.25em] uppercase text-text-faint">
            {this.props.label ?? "Error"}
          </p>
          <p className="text-[13px] text-text-muted leading-relaxed max-w-[200px]">
            予期しないエラーが発生しました
          </p>
          <button
            onClick={() => this.reset()}
            className="mt-1 text-[12px] tracking-[0.04em] px-4 py-1.5 border border-border-default rounded-full text-text-muted hover:text-text-strong hover:border-text-muted transition-all duration-200"
          >
            再試行
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
