import { describe, expect, it } from "vitest";

import { createUniversalAccountClient, readAccountSnapshot } from "./ua";

const config = {
  projectAppUuid: process.env.PARTICLE_APP_ID ?? "",
  projectClientKey: process.env.PARTICLE_CLIENT_KEY ?? "",
  projectId: process.env.PARTICLE_PROJECT_ID ?? "",
};
const ownerAddress = process.env.TAB_PARTICLE_READ_OWNER_ADDRESS ?? "";
const configured = Boolean(
  config.projectAppUuid && config.projectClientKey && config.projectId && ownerAddress,
);

describe.skipIf(!configured)("Particle Universal Account live read", () => {
  it("reads the real unified balance and verified 7702 account identity", async () => {
    const account = createUniversalAccountClient(config, ownerAddress);
    const snapshot = await readAccountSnapshot(account, ownerAddress);

    expect(snapshot.balanceUsd).toBeGreaterThanOrEqual(0);
    expect(snapshot.depositAddress.toLowerCase()).toBe(ownerAddress.toLowerCase());
  }, 30_000);
});
