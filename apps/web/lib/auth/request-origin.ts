function origin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export function requestOriginIsAllowed(request: Request) {
  const suppliedOrigin = request.headers.get("origin");

  if (!suppliedOrigin) {
    return false;
  }

  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const expectedOrigin = origin(configuredUrl || request.url);

  return Boolean(expectedOrigin && origin(suppliedOrigin) === expectedOrigin);
}
