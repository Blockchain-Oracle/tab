import { X402TestnetConfigurationError } from "./x402-testnet-resource";

export function readBaseSepoliaRpcUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
) {
  const value = environment.BASE_SEPOLIA_RPC_URL;
  if (!value) throw new X402TestnetConfigurationError("The Base Sepolia RPC URL is missing.");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new X402TestnetConfigurationError("The Base Sepolia RPC URL is invalid.");
  }
  if (parsed.protocol !== "https:") {
    throw new X402TestnetConfigurationError("The Base Sepolia RPC URL must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new X402TestnetConfigurationError(
      "The Base Sepolia RPC URL must not contain URL credentials.",
    );
  }
  if (!parsed.hostname || parsed.hash || value.trim() !== value) {
    throw new X402TestnetConfigurationError("The Base Sepolia RPC URL is invalid.");
  }
  return value;
}
