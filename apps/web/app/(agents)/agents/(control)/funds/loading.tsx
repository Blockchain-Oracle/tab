import { Skeleton } from "@tab/ui";

/** Geometry-holding skeleton for funds. */
export default function Loading() {
  return (
    <div
      aria-busy="true"
      role="status"
      aria-label="Loading funds"
      style={{ display: "grid", gap: 14 }}
    >
      <Skeleton height="28px" width="220px" />
      <Skeleton height="14px" width="320px" />
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          marginTop: 10,
        }}
      >
        <Skeleton height="120px" width="100%" />
        <Skeleton height="120px" width="100%" />
        <Skeleton height="120px" width="100%" />
      </div>
    </div>
  );
}
