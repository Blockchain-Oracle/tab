import type { MetadataRoute } from "next";

import { SITE_ORIGIN } from "@/lib/urls";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      changeFrequency: "weekly",
      priority: 1,
      url: SITE_ORIGIN.toString(),
    },
  ];
}
