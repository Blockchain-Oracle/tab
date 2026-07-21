export const metadata = { title: "Dashboard" };

import { redirect } from "next/navigation";

export default function DashboardPage() {
  redirect("/dashboard/transactions");
}
