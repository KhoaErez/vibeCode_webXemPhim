"use client";

import { useState } from "react";

export const getImageUrl = (url: string | undefined): string => {
  if (!url) return "";
  return url.startsWith("http") ? url : `https://phimimg.com/${url}`;
};

type MovieImageProps = {
  src: string | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
};

export default function MovieImage({
  src,
  alt,
  className = "",
  priority = false,
}: MovieImageProps) {
  const [hasError, setHasError] = useState(false);
  const resolvedSrc = getImageUrl(src);

  if (!resolvedSrc || hasError) {
    return (
      <div className={`flex items-center justify-center bg-zinc-900 text-zinc-600 ${className}`}>
        <svg className="w-8 h-8 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
          />
        </svg>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setHasError(true)}
      className={className}
    />
  );
}
