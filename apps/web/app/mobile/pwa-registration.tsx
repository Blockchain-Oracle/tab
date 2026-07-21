"use client";

import { useEffect } from "react";

type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, "register">;

export async function registerMobileServiceWorker(container?: ServiceWorkerRegistrar) {
  if (!container) return;
  await container.register("/mobile/sw.js", {
    scope: "/mobile/",
    updateViaCache: "none",
  });
}

export function PwaRegistration() {
  useEffect(() => {
    const container = "serviceWorker" in navigator ? navigator.serviceWorker : undefined;
    registerMobileServiceWorker(container).catch(() => {
      console.error("Agent mobile service worker registration failed.");
    });
  }, []);

  return null;
}
