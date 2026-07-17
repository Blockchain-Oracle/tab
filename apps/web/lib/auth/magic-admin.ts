import { Magic as MagicAdmin } from "@magic-sdk/admin";

const ethereumAddress = /^0x[0-9a-fA-F]{40}$/;
const emailAddress = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AdminClient = Awaited<ReturnType<typeof MagicAdmin.init>>;

let cachedAdmin: { client: Promise<AdminClient>; secret: string } | undefined;

export class MagicNotConfiguredError extends Error {
  constructor() {
    super("Magic authentication is not configured");
    this.name = "MagicNotConfiguredError";
  }
}

export class InvalidMagicIdentityError extends Error {
  constructor() {
    super("Magic did not return a complete identity");
    this.name = "InvalidMagicIdentityError";
  }
}

export class InvalidMagicTokenError extends Error {
  constructor(options?: ErrorOptions) {
    super("The Magic DID token is invalid", options);
    this.name = "InvalidMagicTokenError";
  }
}

export class MagicServiceUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super("Magic authentication is unavailable", options);
    this.name = "MagicServiceUnavailableError";
  }
}

export function magicAuthenticationConfigured() {
  return Boolean(process.env.MAGIC_SECRET_KEY?.trim());
}

async function adminClient(secret: string) {
  if (!cachedAdmin || cachedAdmin.secret !== secret) {
    cachedAdmin = {
      client: MagicAdmin.init(secret),
      secret,
    };
  }

  try {
    const client = await cachedAdmin.client;

    if (!client.clientId?.trim()) {
      cachedAdmin = undefined;
      throw new MagicServiceUnavailableError();
    }

    return client;
  } catch (error) {
    cachedAdmin = undefined;
    if (error instanceof MagicServiceUnavailableError) {
      throw error;
    }
    throw new MagicServiceUnavailableError({ cause: error });
  }
}

async function verifiedMetadata(didToken: string) {
  const secret = process.env.MAGIC_SECRET_KEY;

  if (!secret?.trim()) {
    throw new MagicNotConfiguredError();
  }

  const admin = await adminClient(secret);

  try {
    admin.token.validate(didToken);
  } catch (error) {
    throw new InvalidMagicTokenError({ cause: error });
  }

  let metadata: Awaited<ReturnType<typeof admin.users.getMetadataByToken>>;

  try {
    metadata = await admin.users.getMetadataByToken(didToken);
  } catch (error) {
    throw new MagicServiceUnavailableError({ cause: error });
  }

  return metadata;
}

function completeIdentity(
  metadata: Awaited<ReturnType<AdminClient["users"]["getMetadataByToken"]>>,
) {
  if (
    !metadata.email ||
    !emailAddress.test(metadata.email) ||
    !metadata.issuer?.startsWith("did:") ||
    !metadata.publicAddress ||
    !ethereumAddress.test(metadata.publicAddress)
  ) {
    throw new InvalidMagicIdentityError();
  }

  return {
    email: metadata.email.trim().toLowerCase(),
    issuer: metadata.issuer,
    publicAddress: metadata.publicAddress,
  };
}

export async function verifyMerchantDidToken(didToken: string) {
  const identity = completeIdentity(await verifiedMetadata(didToken));

  return {
    email: identity.email,
    magicIssuer: identity.issuer,
    receivingAddress: identity.publicAddress,
  };
}

export async function verifyBuyerDidToken(didToken: string) {
  const identity = completeIdentity(await verifiedMetadata(didToken));

  return {
    email: identity.email,
    magicIssuer: identity.issuer,
    payerAddress: identity.publicAddress,
  };
}

export async function verifyOwnerDidToken(didToken: string) {
  const identity = completeIdentity(await verifiedMetadata(didToken));

  return {
    email: identity.email,
    magicIssuer: identity.issuer,
  };
}
