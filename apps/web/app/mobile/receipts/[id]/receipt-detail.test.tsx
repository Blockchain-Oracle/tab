import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { type MobileReceipt, MobileReceiptDetail } from "./receipt-detail";

const transactionHash = `0x${"a".repeat(64)}`;

function receipt(status: MobileReceipt["status"]): MobileReceipt {
  const blocked = status === "blocked";
  const settled = status === "settled";
  return {
    amountAtomic: "420000",
    amountDisplay: "$0.42",
    amountUsd: "0.420000",
    asset: "USDC",
    authorizationNonce: "0xab",
    authorizationValidBefore: "2026-07-16T11:00:00.000Z",
    capContext: null,
    createdAt: "2026-07-17T10:00:00.123Z",
    explorer: settled
      ? { href: `https://basescan.org/tx/${transactionHash}`, label: "View on Basescan" }
      : null,
    id: "22222222-2222-4222-8222-222222222222",
    network: { id: "eip155:8453", label: "Base", target: blocked },
    origin: { clientName: "Owner client", toolName: "paid_fetch", transport: "mcp" },
    payTo: "0x1111111111111111111111111111111111111111",
    reason: blocked ? "CAP_EXCEEDED" : null,
    resourceHost: "api.owner-resource.test",
    resourceUrl: "https://api.owner-resource.test/search",
    settledAt: settled ? "2026-07-17T10:00:01.000Z" : null,
    status,
    txHash: settled ? transactionHash : null,
  };
}

describe("mobile receipt detail", () => {
  it("renders owner receipt evidence with exact payment and origin fields", () => {
    const html = renderToStaticMarkup(<MobileReceiptDetail receipt={receipt("settled")} />);

    expect(html).toContain('href="/mobile/feed"');
    expect(html).toContain("$0.42");
    expect(html).toContain("420000 atomic units");
    expect(html).toContain("0.420000 USDC");
    expect(html).toContain("Base");
    expect(html).toContain("eip155:8453");
    expect(html).toContain("Owner client");
    expect(html).toContain("paid_fetch");
    expect(html).toContain("MCP");
    expect(html).toContain("https://api.owner-resource.test/search");
    expect(html).toContain("0x1111111111111111111111111111111111111111");
    expect(html).toContain(transactionHash);
    expect(html).toContain("View on Basescan");
    expect(html).toContain('aria-label="Copy resource"');
    expect(html).toContain('aria-label="Copy payee"');
    expect(html).toContain('aria-label="Copy origin"');
    expect(html).toContain('aria-label="Copy transaction hash"');
  });

  it("renders canonical blocked state and reason without claiming a transfer", () => {
    const unsafe = {
      ...receipt("blocked"),
      explorer: { href: `https://basescan.org/tx/${transactionHash}`, label: "View on Basescan" },
      txHash: transactionHash,
    };
    const html = renderToStaticMarkup(<MobileReceiptDetail receipt={unsafe} />);

    expect(html).toContain("Blocked");
    expect(html).toContain("Base (target)");
    expect(html).toContain("CAP_EXCEEDED");
    expect(html).toContain("This payment was not submitted");
    expect(html).not.toContain(transactionHash);
    expect(html).not.toContain("View on Basescan");
  });

  it.each([
    {
      explorer: { href: `https://example.test/tx/${transactionHash}`, label: "Wrong explorer" },
      name: "wrong explorer origin",
      txHash: transactionHash,
    },
    {
      explorer: { href: "https://basescan.org/tx/not-a-hash", label: "Malformed evidence" },
      name: "malformed transaction hash",
      txHash: "not-a-hash",
    },
  ])("suppresses $name instead of presenting it as chain evidence", ({ explorer, txHash }) => {
    const html = renderToStaticMarkup(
      <MobileReceiptDetail receipt={{ ...receipt("settled"), explorer, txHash }} />,
    );

    expect(html).not.toContain(txHash);
    expect(html).not.toContain(explorer.label);
    expect(html).toContain("No valid transaction evidence is available");
  });

  it("labels Base Sepolia evidence as test funds", () => {
    const html = renderToStaticMarkup(
      <MobileReceiptDetail
        receipt={{
          ...receipt("pending"),
          network: {
            id: "eip155:84532",
            label: "Base Sepolia",
            target: false,
            testFunds: true,
            testFundsLabel: "Sandbox funds — no real value",
          },
        }}
      />,
    );

    expect(html).toContain("Base Sepolia");
    expect(html).toContain("Sandbox funds — no real value");
    expect(html).toContain("Awaiting settlement evidence");
  });

  it("renders explicit missing-origin and resource states without invented data", () => {
    const html = renderToStaticMarkup(
      <MobileReceiptDetail
        receipt={{
          ...receipt("failed"),
          origin: null,
          reason: "FLOAT_EMPTY",
          resourceHost: null,
          resourceUrl: null,
        }}
      />,
    );

    expect(html).toContain("Origin metadata was not recorded for this receipt");
    expect(html).toContain("Resource was not recorded for this receipt");
    expect(html).toContain("FLOAT_EMPTY");
    expect(html).not.toContain("Owner client");
  });
});
