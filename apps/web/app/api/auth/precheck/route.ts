import { merchantIsRegistered } from "../../../../lib/db/merchant-identity";
import { getServerDatabase } from "../../../../lib/db/server";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    headers: { "cache-control": "no-store" },
    status,
  });
}

function invalidInput() {
  return json(
    {
      error: {
        code: "INVALID_EMAIL",
        message: "Enter a valid email address.",
      },
    },
    400,
  );
}

function invalidFlow() {
  return json(
    {
      error: {
        code: "INVALID_AUTH_REQUEST",
        message: "Choose signup or login.",
      },
    },
    400,
  );
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return invalidFlow();
  }

  if (typeof body !== "object" || body === null) {
    return invalidFlow();
  }

  const email = "email" in body && typeof body.email === "string" ? body.email.trim() : "";
  const flow = "flow" in body ? body.flow : undefined;

  if (!emailPattern.test(email)) {
    return invalidInput();
  }
  if (flow !== "signup" && flow !== "login") {
    return invalidFlow();
  }

  const { db } = getServerDatabase();
  const registered = await merchantIsRegistered(db, email);

  if (flow === "signup" && registered) {
    return json(
      {
        error: {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "An account with this email already exists.",
        },
      },
      409,
    );
  }

  if (flow === "login" && !registered) {
    return json(
      {
        error: {
          code: "EMAIL_NOT_REGISTERED",
          message: "No account exists for this email.",
        },
      },
      404,
    );
  }

  return json({ allowed: true });
}
