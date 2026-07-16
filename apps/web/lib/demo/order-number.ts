const nonAlphanumeric = /[^A-Z0-9]+/g;

export function deriveOrderPrefix(businessName: string | null) {
  const words = (businessName ?? "").toUpperCase().split(nonAlphanumeric).filter(Boolean);
  if (words.length === 0) return "SHOP";
  if (words.length === 1) return words[0]?.slice(0, 3) || "SHOP";
  return words
    .slice(0, 4)
    .map((word) => word[0])
    .join("");
}

export function formatOrderNumber(businessName: string | null, sequence: number) {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error("Order sequence must be a positive safe integer");
  }
  return `${deriveOrderPrefix(businessName)}-${sequence.toString().padStart(4, "0")}`;
}
