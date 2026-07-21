import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/urls";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { allow: "/", userAgent: "*" },
    sitemap: new URL("/sitemap.xml", SITE_ORIGIN).toString(),
  };
}
