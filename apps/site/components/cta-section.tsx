import { appUrl } from "@/lib/urls";
import { Reveal } from "./reveal";

export function CtaSection() {
  return (
    <section aria-labelledby="cta-title" className="band cta-band">
      <div className="container cta-inner">
        <Reveal className="reveal">
          <h2 className="cta-title" id="cta-title">
            Open a <em className="hero-em-accent">tab</em>.
          </h2>
        </Reveal>
        <Reveal className="reveal cta-actions" delayMs={140}>
          <a className="btn btn-primary" href={appUrl("/signup")}>
            Start building
          </a>
          <a className="btn btn-quiet" href={appUrl("/agents/login")}>
            Set up an agent
          </a>
        </Reveal>
        <p className="cta-note mono">Testnet included — free sandbox funds on Base Sepolia</p>
      </div>
    </section>
  );
}
