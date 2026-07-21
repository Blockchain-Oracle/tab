import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { GoLivePanel } from "./go-live-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("GoLivePanel real readiness copy", () => {
  it("does not call an acknowledged incomplete activation ready", () => {
    const html = renderToStaticMarkup(
      <GoLivePanel
        activated
        readiness={{
          liveApiKey: false,
          ready: false,
          testPayment: false,
          verifiedWebhook: false,
        }}
      />,
    );

    expect(html).not.toContain("You’re ready for Mainnet");
    expect(html).toContain("Mainnet is enabled with setup remaining");
    expect(html.match(/Complete setup/g)).toHaveLength(3);
  });
});
