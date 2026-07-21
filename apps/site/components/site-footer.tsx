import { TabMark } from "@tab/ui";

import { appUrl, docsUrl } from "@/lib/urls";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer-row">
        <p className="wordmark">
          <TabMark size={18} />
          <span className="wordmark-text">tab</span>
        </p>
        <nav aria-label="Footer" className="site-footer-nav">
          <a href={appUrl("/signup")}>Merchants</a>
          <a href={appUrl("/agents/login")}>Agents</a>
          <a href={docsUrl("/")}>Docs</a>
        </nav>
        <p className="site-footer-note mono">Product illustration · no financial data</p>
      </div>
    </footer>
  );
}
