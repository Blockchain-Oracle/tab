import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class LeashReceiptNotFoundError extends Error {}
  return {
    database: { name: "database" },
    getServerDatabase: vi.fn(),
    LeashReceiptNotFoundError,
    notFound: vi.fn(),
    readOwnerReceipt: vi.fn(),
    requireCurrentOwner: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("../../../../lib/auth/current-owner", () => ({
  requireCurrentOwner: mocks.requireCurrentOwner,
}));
vi.mock("../../../../lib/db/server", () => ({ getServerDatabase: mocks.getServerDatabase }));
vi.mock("../../../../lib/leash/receipt-store", () => ({
  LeashReceiptNotFoundError: mocks.LeashReceiptNotFoundError,
  readOwnerReceipt: mocks.readOwnerReceipt,
}));

import MobileReceiptPage from "./page";

const receiptId = "22222222-2222-4222-8222-222222222222";
const notFoundSignal = new Error("NEXT_NOT_FOUND");

const ownedReceipt = {
  amountAtomic: "1000",
  amountDisplay: "$0.001",
  amountUsd: "0.001000",
  asset: "USDC" as const,
  authorizationNonce: "0xab",
  authorizationValidBefore: "2026-07-16T11:00:00.000Z",
  capContext: null,
  createdAt: "2026-07-17T10:00:00.000Z",
  explorer: null,
  id: receiptId,
  network: { id: "eip155:84532", label: "Base Sepolia", target: false },
  origin: { toolName: "paid_fetch", transport: "mcp" as const },
  payTo: "0x1111111111111111111111111111111111111111",
  reason: null,
  resourceHost: "tab-rosy.vercel.app",
  resourceUrl: "https://tab-rosy.vercel.app/api/x402/test-resource",
  settledAt: null,
  status: "pending" as const,
  txHash: null,
};

describe("mobile receipt page owner boundary", () => {
  beforeEach(() => {
    mocks.getServerDatabase.mockReturnValue({ db: mocks.database });
    mocks.notFound.mockImplementation(() => {
      throw notFoundSignal;
    });
    mocks.readOwnerReceipt.mockReset();
    mocks.requireCurrentOwner.mockReset();
    mocks.requireCurrentOwner.mockResolvedValue({ userId: "owner-1" });
  });

  it("validates the route id before querying receipt storage", async () => {
    await expect(
      MobileReceiptPage({ params: Promise.resolve({ id: "not-a-receipt-id" }) }),
    ).rejects.toBe(notFoundSignal);

    expect(mocks.readOwnerReceipt).not.toHaveBeenCalled();
  });

  it("reads and renders only the current owner's receipt", async () => {
    mocks.readOwnerReceipt.mockResolvedValue(ownedReceipt);

    const page = await MobileReceiptPage({ params: Promise.resolve({ id: receiptId }) });
    const html = renderToStaticMarkup(page);

    expect(mocks.requireCurrentOwner).toHaveBeenCalledOnce();
    expect(mocks.readOwnerReceipt).toHaveBeenCalledWith(mocks.database, {
      ownerId: "owner-1",
      receiptId,
    });
    expect(html).toContain("tab-rosy.vercel.app/api/x402/test-resource");
  });

  it("returns the same not-found boundary for an unowned or missing receipt", async () => {
    mocks.readOwnerReceipt.mockRejectedValue(new mocks.LeashReceiptNotFoundError());

    await expect(MobileReceiptPage({ params: Promise.resolve({ id: receiptId }) })).rejects.toBe(
      notFoundSignal,
    );
  });

  it("does not hide unexpected storage failures", async () => {
    const failure = new Error("database unavailable");
    mocks.readOwnerReceipt.mockRejectedValue(failure);

    await expect(MobileReceiptPage({ params: Promise.resolve({ id: receiptId }) })).rejects.toBe(
      failure,
    );
  });
});
