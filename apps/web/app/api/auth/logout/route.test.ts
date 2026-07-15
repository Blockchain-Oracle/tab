import { describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("expires the signed session cookie", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        headers: { origin: "http://localhost" },
        method: "POST",
      }),
    );
    const cookie = response.headers.get("set-cookie");

    expect(response.status).toBe(204);
    await expect(response.text()).resolves.toBe("");
    expect(cookie).toContain("tab_session=");
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
  });

  it("does not mutate cookies for a cross-origin request", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/logout", {
        headers: { origin: "https://attacker.example" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
