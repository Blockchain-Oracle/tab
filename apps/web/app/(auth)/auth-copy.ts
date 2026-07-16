export type AuthFlow = "login" | "signup";

export const authCopy = {
  login: {
    action: "Log in",
    alternateAction: "Sign up",
    alternateHref: "/signup",
    alternateLead: "Don’t have an account?",
    genericError: "Couldn’t log you in. Try again.",
    redirectBody: "Taking you to your dashboard…",
    redirectTitle: "You’re in",
    subtitle: "A trusted browser signs in instantly. Otherwise, we’ll email a one-time code.",
    title: "Log in to Tab",
  },
  signup: {
    action: "Create account",
    alternateAction: "Log in",
    alternateHref: "/login",
    alternateLead: "Already have an account?",
    genericError: "Couldn’t create your account. Try again.",
    redirectBody: "Taking you to your Quickstart…",
    redirectTitle: "Account created",
    subtitle: "Start accepting payments in test mode — no approval process, no forms.",
    title: "Create your Tab account",
  },
} as const;
