import { Reveal } from "./reveal";

/**
 * Two strands, one rail: the human line and the agent line merge into a
 * single settlement rail. Paths draw once (k-path); the stamp lands last.
 */
export function RailSection() {
  return (
    <section aria-labelledby="rail-title" className="band rail-band" id="rail">
      <div className="container">
        <p className="eyebrow">The rail</p>
        <h2 className="section-title" id="rail-title">
          One rail. Two payers.
        </h2>

        <div className="rail-figure">
          <div className="rail-sources">
            <Reveal className="reveal rail-chip" delayMs={0}>
              <span className="rail-chip-title">Human checkout</span>
              <span className="rail-chip-sub mono">email → code → pay</span>
            </Reveal>
            <Reveal className="reveal rail-chip" delayMs={120}>
              <span className="rail-chip-title">Agent payment</span>
              <span className="rail-chip-sub mono">402 → policy → sign</span>
            </Reveal>
          </div>

          <svg
            aria-hidden="true"
            className="rail-svg"
            fill="none"
            preserveAspectRatio="xMidYMid meet"
            viewBox="0 0 760 240"
          >
            <path
              className="k-path rail-strand"
              d="M8 60 C 220 60 260 120 400 120"
              pathLength="1"
              style={{ "--k-delay": "150ms" } as React.CSSProperties}
            />
            <path
              className="k-path rail-strand rail-strand-accent"
              d="M8 180 C 220 180 260 120 400 120"
              pathLength="1"
              style={{ "--k-delay": "300ms" } as React.CSSProperties}
            />
            <path
              className="k-path rail-merged"
              d="M400 120 L 752 120"
              pathLength="1"
              style={{ "--k-delay": "620ms" } as React.CSSProperties}
            />
            <circle className="rail-node" cx="400" cy="120" r="7" />
          </svg>

          <Reveal className="stamp rail-stamp" delayMs={900}>
            <span className="stamp-seal">Verified</span>
            <span className="rail-chip-sub mono">real evidence only</span>
          </Reveal>
        </div>

        <p className="visually-hidden">
          Diagram: a human checkout line and an agent payment line merge into one settlement rail
          that ends in verified evidence.
        </p>

        <p className="section-sub">
          One balance settles both. Buyers never see a wallet; agents never exceed their cap. Every
          settlement carries evidence you can independently verify.
        </p>
      </div>
    </section>
  );
}
