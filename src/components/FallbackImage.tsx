"use client";
import type React from "react";
import { useImageProxyFallback } from "../hooks/useImageProxyFallback";

interface FallbackImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  url: string;
}

export function FallbackImage({ url, alt, className, ...rest }: FallbackImageProps) {
  const { src, onError } = useImageProxyFallback(url);
  return <img src={src} alt={alt} className={className} onError={onError} {...rest} />;
}
