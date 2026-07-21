export const metadata = { title: "Agent monitor" };

import { redirect } from "next/navigation";

export default function MobileOverviewEntry() {
  redirect("/mobile/feed");
}
