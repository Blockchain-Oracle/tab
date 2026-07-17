import type { NextRequest } from "next/server";

import {
  leashError,
  requireLeashMutationOrigin,
  requireOwnerRequest,
} from "../../../../lib/leash/leash-http";

export async function POST(request: NextRequest) {
  const originError = requireLeashMutationOrigin(request);
  if (originError) return originError;
  const owner = await requireOwnerRequest(request);
  if (owner instanceof Response) return owner;

  return leashError(
    "OIDC_ISSUER_NOT_CONFIGURED",
    "Magic OIDC provisioning has not passed its live spike.",
    503,
  );
}
