import type { CSSProperties } from "react";

interface SkeletonStyle extends CSSProperties {
  "--tab-skeleton-height": string;
  "--tab-skeleton-width": string;
}

export interface SkeletonProps {
  className?: string;
  height: string;
  width: string;
}

export function Skeleton({ className, height, width }: SkeletonProps) {
  const style: SkeletonStyle = {
    "--tab-skeleton-height": height,
    "--tab-skeleton-width": width,
  };

  return <span aria-hidden="true" className={className} data-tab-skeleton="" style={style} />;
}
