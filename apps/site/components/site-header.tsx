import { TabMark } from "@tab/ui";
import Link from "next/link";

import { appUrl, docsUrl } from "@/lib/urls";
import { ThemeToggle } from "./theme-toggle";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="container site-header-row">
        <Link aria-label="Tab home" className="wordmark" href="/">
          <TabMark size={22} />
          <span className="wordmark-text">tab</span>
        </Link>

        <nav aria-label="Primary" className="site-nav">
          <a href="#rail">Product</a>
          <a href="#agents">Agents</a>
          <a href="#developers">Developers</a>
        </nav>

        <div className="site-header-actions">
          <ThemeToggle />
          <a className="site-signin" href={appUrl("/login")}>
            Sign in
          </a>
          <a className="btn btn-primary btn-compact" href={docsUrl("/")}>
            Docs
          </a>
        </div>
      </div>
    </header>
  );
}
