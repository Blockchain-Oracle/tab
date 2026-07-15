import type { Metadata } from "next";

import { MerchantAuthPage } from "../merchant-auth-page";

export const metadata: Metadata = { title: "Create your account · Tab" };

export default function SignupPage() {
  return <MerchantAuthPage flow="signup" />;
}
