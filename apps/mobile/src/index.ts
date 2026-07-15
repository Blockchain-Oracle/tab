import "./style.css";

// Phase 1 PWA shell only. Real monitor data and controls begin in Phase 9.
// Mobile remains a read/control client: no wallet key or signing capability belongs here.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}
