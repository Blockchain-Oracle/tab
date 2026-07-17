import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NoAgentState } from "./control-page";

describe("Leash empty owner state", () => {
  it("leads to the honest blocked provisioning surface instead of a dead end", () => {
    const html = renderToStaticMarkup(<NoAgentState />);
    expect(html).toContain("No Leash agent has been created");
    expect(html).toContain('href="/leash/provision"');
    expect(html).toContain("Set up agent");
    expect(html).not.toContain("Provisioning unavailable");
  });
});
