import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getCurrentMerchant } from "../lib/auth/current-merchant";
import { getCurrentOwner } from "../lib/auth/current-owner";
import { WorkspaceEntry } from "./workspace-entry";

export const metadata = { title: "Tab — Workspace" };

export default async function HomePage() {
  await connection();
  // Merchant first: an owner token fails the merchant shape check before any
  // DB hit, so session resolution costs at most one query.
  const merchant = await getCurrentMerchant();
  if (merchant) redirect("/dashboard/transactions");
  const owner = await getCurrentOwner();
  if (owner) redirect("/agents");
  return <WorkspaceEntry siteUrl={process.env.NEXT_PUBLIC_SITE_URL?.trim() || undefined} />;
}
