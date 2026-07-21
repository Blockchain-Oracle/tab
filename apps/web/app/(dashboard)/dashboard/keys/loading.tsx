import { Skeleton } from "@tab/ui";

/** Geometry-holding skeleton for API keys. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      role="status"
      aria-label="Loading API keys"
      style={{ display: "grid", gap: 14 }}
    >
      <Skeleton height="28px" width="220px" />
      <Skeleton height="14px" width="320px" />
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <Skeleton height="40px" width="100%" />
        <Skeleton height="52px" width="100%" />
        <Skeleton height="52px" width="100%" />
        <Skeleton height="52px" width="100%" />
        <Skeleton height="52px" width="100%" />
      </div>
    </div>
  );
}
