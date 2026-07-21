import { appUrl } from "@/lib/urls";

/**
 * Kinetic hero. Pure CSS choreography (see kinetic.css) gated on
 * data-tab-hero-motion so no-JS and reduced-motion render the final state.
 * Lines rise in sequence; the vermilion streak is the payment traveling.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="hero container">
      <p className="eyebrow k-fade" style={{ "--k-delay": "80ms" } as React.CSSProperties}>
        One rail · two payers
      </p>

      <h1 className="hero-title" id="hero-title">
        <span className="k-row">
          <span className="k-line" style={{ "--k-delay": "120ms" } as React.CSSProperties}>
            Invisible payments —
          </span>
        </span>
        <span className="k-row">
          <span className="k-line" style={{ "--k-delay": "240ms" } as React.CSSProperties}>
            for <em className="hero-em">you</em>,
          </span>
        </span>
        <span className="k-row">
          <span className="k-line" style={{ "--k-delay": "360ms" } as React.CSSProperties}>
            and for your <em className="hero-em-accent">AI</em>.
          </span>
        </span>
      </h1>

      <span
        aria-hidden="true"
        className="k-streak hero-streak"
        style={{ "--k-delay": "560ms" } as React.CSSProperties}
      />

      <div className="hero-foot">
        <p className="hero-sub k-fade" style={{ "--k-delay": "620ms" } as React.CSSProperties}>
          People check out with an email. AI agents pay their own x402 bills — under caps their
          owner controls. One balance, real evidence, no theatre.
        </p>

        <div className="hero-ctas k-fade" style={{ "--k-delay": "700ms" } as React.CSSProperties}>
          <a className="btn btn-primary" href={appUrl("/signup")}>
            Start building
          </a>
          <a className="btn btn-quiet" href={appUrl("/agents/login")}>
            Set up an agent
          </a>
        </div>
      </div>
    </section>
  );
}
