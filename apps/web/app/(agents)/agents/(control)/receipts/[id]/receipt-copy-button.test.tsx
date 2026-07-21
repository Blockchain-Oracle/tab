import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { copyReceiptEvidence, ReceiptCopyButton } from "./receipt-copy-button";

describe("receipt evidence copy control", () => {
  it("copies only the supplied real evidence before committing success", async () => {
    const events: string[] = [];
    const writeText = vi.fn(async (value: string) => events.push(`write:${value}`));

    await copyReceiptEvidence({
      onCopied: () => events.push("copied"),
      value: "0xabc",
      writeText,
    });

    expect(writeText).toHaveBeenCalledWith("0xabc");
    expect(events).toEqual(["write:0xabc", "copied"]);
  });

  it("has an explicit accessible label before interaction", () => {
    const html = renderToStaticMarkup(
      <ReceiptCopyButton label="Copy transaction hash" value="0xabc" />,
    );

    expect(html).toContain('aria-label="Copy transaction hash"');
    expect(html).toContain("Copy");
  });
});
