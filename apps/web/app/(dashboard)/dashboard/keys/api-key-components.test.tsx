/** @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { DashboardApiKey } from "../../../../lib/dashboard/api-keys";
import {
  ApiKeysTable,
  CreateKeyDialog,
  RotationConfirmDialog,
  SecretRevealDialog,
} from "./api-key-components";

const createdAt = new Date("2026-07-16T10:00:00.000Z");

/**
 * Dialogs portal into the closest [data-tab-ui] after mount, so their copy
 * is invisible to static markup. Mount for real, mirroring the app root.
 */
async function renderMounted(node: ReactNode): Promise<string> {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  container.setAttribute("data-tab-ui", "");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(node));
  const html = container.innerHTML;
  await act(async () => root.unmount());
  container.remove();
  return html;
}

function key(overrides: Partial<DashboardApiKey> = {}): DashboardApiKey {
  return {
    createdAt,
    env: "test",
    id: "11111111-1111-4111-8111-111111111111",
    last4: "a1B2",
    lastUsedAt: null,
    publicKey: null,
    name: "Server deploy",
    permissions: "full",
    prefix: "sk_test_",
    rotatedFromId: null,
    type: "secret",
    ...overrides,
  };
}

describe("API key dashboard reality copy", () => {
  it("renders masked current-environment rows and real last-used timestamps", () => {
    const html = renderToStaticMarkup(
      <ApiKeysTable
        busyKeyId={null}
        keys={[
          key(),
          key({
            id: "22222222-2222-4222-8222-222222222222",
            last4: "z9Y8",
            lastUsedAt: new Date("2026-07-16T12:34:56.000Z"),
            permissions: "read_only",
          }),
          key({
            id: "33333333-3333-4333-8333-333333333333",
            last4: "pK44",
            name: "Default test publishable key",
            permissions: null,
            prefix: "pk_test_",
            type: "publishable",
          }),
        ]}
        onDelete={vi.fn()}
        onRotate={vi.fn()}
      />,
    );

    expect(html).toContain("sk_test_••••••••a1B2");
    expect(html).toContain("pk_test_••••••••pK44");
    expect(html).toContain("Full access");
    expect(html).toContain("Read-only — list and read payments");
    expect(html).toContain("Never");
    expect(html).toContain('dateTime="2026-07-16T12:34:56.000Z"');
    expect(html).not.toContain("Reveal");
  });

  it("uses the exact enforced permission choices in the create dialog", async () => {
    const html = await renderMounted(
      <CreateKeyDialog
        error={null}
        isSubmitting={false}
        name=""
        onClose={vi.fn()}
        onNameChange={vi.fn()}
        onPermissionChange={vi.fn()}
        onSubmit={vi.fn()}
        permissions="full"
      />,
    );

    expect(html).toContain("Full access");
    expect(html).toContain("Create payment intents and read payments.");
    expect(html).toContain("Read-only — list and read payments");
    expect(html).not.toContain("Sending access");
  });

  it("shows raw material in the one-time reveal dialog and states it cannot be recovered", async () => {
    const secret = "sk_test_unique_one_time_material";
    const html = await renderMounted(
      <SecretRevealDialog
        keyName="Server deploy"
        onClose={vi.fn()}
        permissions="full"
        secret={secret}
      />,
    );

    expect(html).toContain(secret);
    expect(html).toContain("you can only view this key once");
    expect(html).toContain("I’ve saved my key");
  });

  it("requires an explicit destructive confirmation before rotation", async () => {
    const html = await renderMounted(
      <RotationConfirmDialog
        isSubmitting={false}
        keyName="Server deploy"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(html).toContain("The current key will stop working immediately");
    expect(html).toContain("Rotate key");
    expect(html).toContain("Cancel");
  });
});
