import type { Metadata } from "next";

import { MerchantAuthPage } from "../merchant-auth-page";

export const metadata: Metadata = { title: "Log in · Tab" };

export default function LoginPage() {
  return <MerchantAuthPage flow="login" />;
}
