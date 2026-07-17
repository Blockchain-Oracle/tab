import type { Metadata } from "next";

import { LeashAuthPage } from "../../auth/leash-auth-page";

export const metadata: Metadata = { title: "Log in to Leash · Tab" };

export default function LeashLoginPage() {
  return <LeashAuthPage />;
}
