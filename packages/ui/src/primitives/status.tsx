import { getNetworkProfile, type NetworkProfileId } from "@tab/networks";
import type { HTMLAttributes, ReactNode } from "react";

import { ArbitrumMark, BaseMark } from "../assets/marks";

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "test"
  | "live"
  | "stale"
  | "unavailable";

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: StatusTone;
}

export function StatusBadge({ children, tone = "neutral", ...elementProps }: StatusBadgeProps) {
  return (
    <span {...elementProps} data-tab-status-badge="" data-tone={tone}>
      {children}
    </span>
  );
}

const NETWORK_MARKS = {
  arbitrum: ArbitrumMark,
  base: BaseMark,
} as const;

export interface NetworkMarkProps {
  assetId: keyof typeof NETWORK_MARKS;
  size?: number;
  title?: string;
}

/** Official chain mark for a canonical network asset id. */
export function NetworkMark({ assetId, size, title }: NetworkMarkProps) {
  const Mark = NETWORK_MARKS[assetId];
  return <Mark size={size} title={title} />;
}

export interface NetworkIdentityProps extends HTMLAttributes<HTMLFieldSetElement> {
  profileId: NetworkProfileId;
}

export function NetworkIdentity({ profileId, ...elementProps }: NetworkIdentityProps) {
  const profile = getNetworkProfile(profileId);

  return (
    <fieldset
      {...elementProps}
      aria-label={`Network: ${profile.displayName}`}
      data-official-asset={profile.officialAssetId}
      data-tab-network=""
    >
      <NetworkMark assetId={profile.officialAssetId} size={18} />
      <span data-tab-network-name="">{profile.displayName}</span>
      <code data-tab-network-id="">{profile.caip2}</code>
      {profile.testFunds ? (
        <StatusBadge tone="test">Sandbox funds — no real value</StatusBadge>
      ) : null}
    </fieldset>
  );
}

export interface LiveRegionProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  priority: "polite" | "urgent";
}

export function LiveRegion({ children, priority, ...elementProps }: LiveRegionProps) {
  const urgent = priority === "urgent";
  return (
    <div
      {...elementProps}
      aria-atomic="true"
      aria-live={urgent ? "assertive" : "polite"}
      data-tab-live-region=""
      role={urgent ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
