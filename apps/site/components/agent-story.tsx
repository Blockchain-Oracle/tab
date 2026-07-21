import { Reveal } from "./reveal";

const FRAMES = [
  { detail: "A paid API answers with a payment challenge.", label: "402 challenge" },
  { detail: "Cap, status, and kill-switch checked first.", label: "Policy gates" },
  { detail: "The server wallet signs the exact amount.", label: "Signature" },
  { detail: "The x402 facilitator settles USDC on-chain.", label: "Settlement" },
  { detail: "The request retries and simply succeeds.", label: "200 OK" },
] as const;

/** The agent story as a film-strip storyboard, punctuated by 402 → 200. */
export function AgentStory() {
  return (
    <section aria-labelledby="agents-title" className="band band-ink agent-band" id="agents">
      <div className="container">
        <p className="eyebrow">For your AI</p>
        <h2 className="section-title" id="agents-title">
          Your agent hits a paywall.
          <br />
          Tab handles the rest.
        </h2>

        <Reveal className="reveal code-flip mono" delayMs={80}>
          <span className="code-402">402</span>
          <span aria-hidden="true" className="code-arrow accent">
            →
          </span>
          <span className="code-200">200</span>
        </Reveal>

        <ol className="frame-strip">
          {FRAMES.map((frame, index) => (
            <Reveal as="li" className="reveal frame" delayMs={index * 110} key={frame.label}>
              <span className="frame-index mono">{String(index + 1).padStart(2, "0")}</span>
              <span className="frame-label">{frame.label}</span>
              <span className="frame-detail">{frame.detail}</span>
            </Reveal>
          ))}
        </ol>

        <p className="section-sub">
          No model in the loop, no blind allowance. A policy engine gates every request before any
          signature exists — and a kill switch stops new spending instantly.
        </p>
      </div>
    </section>
  );
}
