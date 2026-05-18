"use client";
import type React from "react";
import { useImageProxyFallback } from "../hooks/useImageProxyFallback";

interface FallbackImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> {
  url: string;
}

export function FallbackImage({ url, onLoad, onError, ...rest }: FallbackImageProps) {
  const handlers = useImageProxyFallback(url, { onLoad, onError });
  return <img {...rest} src={handlers.src} onLoad={handlers.onLoad} onError={handlers.onError} />;
}
