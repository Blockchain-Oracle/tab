import { ArbitrumMark, BaseMark, UsdcMark } from "@tab/ui";

/**
 * Official marks only, full names, no fabricated claims. Partner wordmarks
 * swap light/dark via CSS (.mark-img-light / .mark-img-dark).
 */
export function TrustStrip() {
  return (
    <section aria-label="Networks and infrastructure" className="band trust-band">
      <div className="container">
        <p className="eyebrow trust-eyebrow">Built on the open internet</p>
        <ul className="trust-list">
          <li className="trust-item">
            <BaseMark size={20} title="Base" />
            <span>Base</span>
          </li>
          <li className="trust-item">
            <ArbitrumMark size={20} title="Arbitrum One" />
            <span>Arbitrum One</span>
          </li>
          <li className="trust-item">
            <UsdcMark size={20} title="USDC" />
            <span>Circle USDC</span>
          </li>
          <li className="trust-item">
            {/* biome-ignore lint/performance/noImgElement: static theme-swapped SVG wordmarks need no optimization pipeline */}
            <img alt="Magic" className="mark-img" height={20} src="/marks/magic.svg" width={55} />
          </li>
          <li className="trust-item">
            {/* biome-ignore lint/performance/noImgElement: static theme-swapped SVG wordmarks need no optimization pipeline */}
            <img
              alt="Particle Network"
              className="mark-img mark-img-particle"
              height={16}
              src="/marks/particle.png"
              width={111}
            />
          </li>
          <li className="trust-item">
            {/* biome-ignore lint/performance/noImgElement: static theme-swapped SVG wordmarks need no optimization pipeline */}
            <img
              alt="x402"
              className="mark-img mark-img-light"
              height={18}
              src="/marks/x402-light.svg"
              width={72}
            />
            {/* biome-ignore lint/performance/noImgElement: static theme-swapped SVG wordmarks need no optimization pipeline */}
            <img
              alt=""
              aria-hidden="true"
              className="mark-img mark-img-dark"
              height={18}
              src="/marks/x402-dark.svg"
              width={72}
            />
          </li>
        </ul>
      </div>
    </section>
  );
}
