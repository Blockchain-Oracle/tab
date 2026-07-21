import { Skeleton } from "@tab/ui";

/** Geometry-holding skeleton for quickstart. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      role="status"
      aria-label="Loading quickstart"
      style={{ display: "grid", gap: 14 }}
    >
      <Skeleton height="28px" width="220px" />
      <Skeleton height="14px" width="320px" />
      <Skeleton height="260px" width="100%" />
    </div>
  );
}
