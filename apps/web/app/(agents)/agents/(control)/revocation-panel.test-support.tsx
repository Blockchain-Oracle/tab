import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

export const agent = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Research agent",
  paymentProfile: "mainnet" as const,
  status: "provisioned" as const,
};

export const integrationAgent = {
  ...agent,
  id: "22222222-2222-4222-8222-222222222222",
  paymentProfile: "base_sepolia_integration" as const,
};

export const liveRead = {
  agentId: agent.id,
  floats: [
    {
      balanceAtomic: "1000000",
      label: "Base",
      network: "eip155:8453",
      testFunds: false,
    },
    {
      balanceAtomic: "250000",
      label: "Arbitrum",
      network: "eip155:42161",
      testFunds: false,
    },
  ],
  health: "healthy",
  paymentProfile: "mainnet",
  readAt: "2026-07-17T10:30:00.000Z",
  testFunds: false,
  testFundsLabel: null,
};

export const integrationLiveRead = {
  agentId: integrationAgent.id,
  floats: [
    {
      balanceAtomic: "1000",
      label: "Base Sepolia",
      network: "eip155:84532",
      testFunds: true,
    },
  ],
  health: "healthy",
  paymentProfile: "base_sepolia_integration",
  readAt: "2026-07-17T10:30:00.000Z",
  testFunds: true,
  testFundsLabel: "Testnet",
};

export type RevocationHarness = { container: HTMLDivElement; root: Root };

export function createRevocationHarness(): RevocationHarness {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  document.body.append(container);
  return { container, root: createRoot(container) };
}

export async function destroyRevocationHarness({ container, root }: RevocationHarness) {
  await act(async () => root.unmount());
  container.remove();
}

export function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

export function button(container: ParentNode, label: string) {
  const result = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!result) throw new Error(`Button not found: ${label}`);
  return result as HTMLButtonElement;
}

export function writeInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
