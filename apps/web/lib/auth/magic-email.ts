export function magicEmailMatchesRequest(verifiedEmail: string, requestedEmail: string) {
  return verifiedEmail.trim().toLowerCase() === requestedEmail.trim().toLowerCase();
}
