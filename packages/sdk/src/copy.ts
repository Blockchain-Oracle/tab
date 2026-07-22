export const BUYER_COPY = {
  addFunds: {
    body: "Send USDC on a supported network to this address.",
    copy: "Copy address",
    copied: "Address copied",
    copyFailed: "Copy didn’t work. Select and copy the address.",
    recheck: "Check balance again",
    title: "Add funds",
  },
  auth: {
    codeDigit: "Code digit",
    codeHint: "Codes auto-submit on the 6th digit",
    codeSent: "We sent a 6-digit code to",
    emailLabel: "Email address",
    emailBody: "We’ll email you a one-time code. No password, no account setup.",
    emailTitle: "Pay with your email",
    expired: "This code has expired. Request a new code to continue.",
    invalid: "That code didn’t match. Try again.",
    otpTitle: "Enter your code",
    rateLimited: "Too many attempts. Please wait before trying again.",
    sending: "Sending code…",
    startOver: "Start over",
    verifying: "Verifying…",
  },
  balance: { label: "Your balance", suffix: "available" },
  buttons: {
    addFunds: "Add funds",
    cancel: "Cancel",
    close: "Close checkout",
    continue: "Continue",
    done: "Done",
    retry: "Try again",
  },
  checkout: "Checkout",
  checkingBalance: "Checking your balance…",
  deviceApproval: {
    body: "We sent an approval link to",
    hint: "Approve from your inbox — this screen continues automatically.",
    title: "Approve this new device",
  },
  footer: "Secured by Tab",
  insufficient: {
    body: "Nothing has been charged.",
    title: "Not enough to complete this payment",
  },
  testFunds: {
    claiming: "Sending your test funds…",
    cta: "Get free test funds",
    failed: "Test funds were not granted.",
    label: "Testnet",
  },
  loading: "Loading payment…",
  merchant: "Merchant",
  paymentComplete: "Payment complete",
  processing: "Processing your payment…",
  reference: "Reference",
  stuck: {
    body: "It may still complete — do not submit it again. You can close this window; the result will appear in your receipt.",
    close: "Close — check receipts later",
    title: "Taking longer than expected",
  },
  testMode: "Testnet",
} as const;

export const buyerFormat = {
  available(value: string) {
    return `${value} ${BUYER_COPY.balance.suffix}`;
  },
  codeDigit(index: number) {
    return `${BUYER_COPY.auth.codeDigit} ${index}`;
  },
  pay(amount: string) {
    return `Pay ${amount}`;
  },
  short(value: string) {
    return `${value} short`;
  },
  toMerchant(name: string) {
    return `to ${name}`;
  },
};

export type BuyerFailure = {
  broadcastStarted: boolean;
  kind:
    | "auth-failed"
    | "execution-blocked"
    | "network-failed"
    | "payment-failed"
    | "payment-unavailable";
};

export function buyerErrorCopy(failure: BuyerFailure) {
  if (failure.kind === "execution-blocked") {
    return {
      body: "Live payments aren’t available yet. You have not been charged.",
      title: "Payment is not available",
    };
  }
  if (failure.kind === "auth-failed") {
    return {
      body: "For your security, please start again from your email address.",
      title: "We couldn’t verify your code",
    };
  }
  if (failure.kind === "payment-unavailable") {
    return {
      body: "This payment cannot be completed right now. You have not been charged.",
      title: "Payment is not available",
    };
  }
  if (failure.kind === "network-failed" && !failure.broadcastStarted) {
    return {
      body: "Check your connection and try again. You have not been charged.",
      title: "Couldn’t connect",
    };
  }
  return failure.broadcastStarted
    ? {
        body: "We couldn’t refresh the result. Check your receipt before trying again.",
        title: "Payment status unavailable",
      }
    : {
        body: "Your details are saved. Try again when you’re ready. You have not been charged.",
        title: "Payment didn’t go through",
      };
}
