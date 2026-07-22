/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ApiEnvironment } from "../../../../lib/auth/api-key";
import type { DashboardApiKey } from "../../../../lib/dashboard/api-keys";
import { ApiKeysClient } from "./api-keys-client";

function key(env: ApiEnvironment, name: string): DashboardApiKey {
  return {
    createdAt: new Date("2026-07-16T10:00:00.000Z"),
    env,
    id:
      env === "test"
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222",
    last4: env === "test" ? "tE57" : "L1vE",
    lastUsedAt: null,
    publicKey: null,
    name,
    permissions: "full",
    prefix: env === "test" ? "sk_test_" : "sk_live_",
    rotatedFromId: null,
    type: "secret",
  };
}

describe("API key environment state", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("replaces test rows when refreshed props switch the client island to Mainnet", async () => {
    await act(async () => {
      root.render(<ApiKeysClient initialKeys={[key("test", "Test server")]} mode="test" />);
    });
    expect(container.textContent).toContain("Test server");

    await act(async () => {
      root.render(<ApiKeysClient initialKeys={[key("live", "Live server")]} mode="live" />);
    });

    expect(container.textContent).toContain("Live server");
    expect(container.textContent).toContain("sk_live_");
    expect(container.textContent).not.toContain("Test server");
    expect(container.textContent).not.toContain("sk_test_");
  });
});
