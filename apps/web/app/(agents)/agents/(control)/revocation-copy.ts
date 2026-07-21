export type RevocationAction = "pause" | "resume" | "freeze" | "unfreeze" | "cancel" | "nuclear";

export const CANCEL_COPY_BY_SPIKE_OUTCOME = {
  credential_chain_reset:
    "Invalidates every agent key and resets the credential chain. Re-provisioning is B-03.",
  server_key_rotation:
    "Invalidates every agent key and rotates your server key. Re-provisioning is B-03.",
  unresolved:
    "Invalidates every agent key. B-03 has not established whether re-provisioning rotates the server key or resets the credential chain.",
} as const;

const reversibleCopy = {
  freeze: {
    confirmLabel: "Confirm freeze",
    consequence: "The signer will refuse every authorization while the credential stays intact.",
    dismissLabel: "Keep signer active",
    mark: "LEVEL 2 · RESUMABLE",
    title: "Freeze the signer gate?",
  },
  pause: {
    confirmLabel: "Confirm pause",
    consequence: "Tab will stop payment signing. This does not stop the external agent process.",
    dismissLabel: "Keep payments active",
    mark: "LEVEL 1 · RESUMABLE",
    title: "Pause payment signing?",
  },
  resume: {
    confirmLabel: "Confirm resume",
    consequence: "Tab will allow this agent to reach the cap and signer checks again.",
    dismissLabel: "Keep payments paused",
    mark: "LEVEL 1 · RESUMABLE",
    title: "Resume payment signing?",
  },
  unfreeze: {
    confirmLabel: "Confirm unfreeze",
    consequence: "The signer gate will accept authorization checks for this agent again.",
    dismissLabel: "Keep signer frozen",
    mark: "LEVEL 2 · RESUMABLE",
    title: "Unfreeze the signer gate?",
  },
} as const;

export function revocationDialogCopy(action: RevocationAction, agentName: string) {
  if (action in reversibleCopy) {
    return { ...reversibleCopy[action as keyof typeof reversibleCopy], confirmation: null };
  }
  if (action === "cancel") {
    return {
      confirmLabel: "Cancel credential",
      confirmation: "CANCEL",
      consequence: CANCEL_COPY_BY_SPIKE_OUTCOME.unresolved,
      dismissLabel: "Keep credential",
      mark: "CREDENTIAL RESET",
      title: "Cancel the credential?",
    };
  }
  return {
    confirmLabel: "Destroy credential",
    confirmation: agentName,
    consequence:
      "This permanently destroys the signing credential and cannot be undone. Existing funds may become stranded.",
    dismissLabel: "Keep credential",
    mark: "IRREVERSIBLE",
    title: "Destroy the credential?",
  };
}
