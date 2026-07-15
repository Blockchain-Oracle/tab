import { NextResponse } from "next/server";

import { requestOriginIsAllowed } from "../../../../lib/auth/request-origin";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "../../../../lib/auth/session";

export async function POST(request: Request) {
  if (!requestOriginIsAllowed(request)) {
    return NextResponse.json(
      {
        error: {
          code: "ORIGIN_NOT_ALLOWED",
          message: "Request origin is not allowed.",
        },
      },
      {
        headers: { "cache-control": "no-store" },
        status: 403,
      },
    );
  }

  const response = new NextResponse(null, {
    headers: { "cache-control": "no-store" },
    status: 204,
  });

  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });

  return response;
}
