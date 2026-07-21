import { Skeleton } from "@tab/ui";

/** Geometry-holding skeleton for the get-started wizard. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      role="status"
      aria-label="Loading setup steps"
      style={{ display: "grid", gap: 14 }}
    >
      <Skeleton height="28px" width="220px" />
      <Skeleton height="14px" width="360px" />
      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <Skeleton height="76px" width="100%" />
        <Skeleton height="76px" width="100%" />
        <Skeleton height="76px" width="100%" />
        <Skeleton height="76px" width="100%" />
        <Skeleton height="76px" width="100%" />
        <Skeleton height="76px" width="100%" />
      </div>
    </div>
  );
}
