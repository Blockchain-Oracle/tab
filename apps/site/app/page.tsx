import { AgentStory } from "@/components/agent-story";
import { CheckoutStory } from "@/components/checkout-story";
import { CtaSection } from "@/components/cta-section";
import { DeveloperSection } from "@/components/developer-section";
import { EvidenceSection } from "@/components/evidence-section";
import { Hero } from "@/components/hero";
import { RailSection } from "@/components/rail-section";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TrustStrip } from "@/components/trust-strip";

export default function HomePage() {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <RailSection />
        <AgentStory />
        <CheckoutStory />
        <EvidenceSection />
        <DeveloperSection />
        <TrustStrip />
        <CtaSection />
      </main>
      <SiteFooter />
    </>
  );
}
