import type { ElementType, ReactElement, ReactNode } from "react";

import { TabMark } from "../assets/tab-mark";
import { type NavGroup, NavList } from "./nav-list";

export interface AppShellProps {
  accountSlot?: ReactNode;
  bannerSlot?: ReactNode;
  brandHref: string;
  children: ReactNode;
  groups: readonly NavGroup[];
  /** Link renderer — apps pass next/link; defaults to <a>. */
  linkComponent?: ElementType;
  modeSlot?: ReactNode;
  navAriaLabel: string;
  /** Interactive replacement for the surface tag (e.g. a workspace switcher). */
  surfaceSlot?: ReactNode;
  surfaceTag: string;
}

/**
 * The Ledger Card: the whole app floats as one rounded card on a deeper
 * canvas, with a warm light seam along its top edge. Full-bleed below
 * 1024px. Presentational only — active states and data live in the apps.
 */
export function AppShell({
  accountSlot,
  bannerSlot,
  brandHref,
  children,
  groups,
  linkComponent,
  modeSlot,
  navAriaLabel,
  surfaceSlot,
  surfaceTag,
}: AppShellProps): ReactElement {
  const LinkComponent = (linkComponent ?? "a") as ElementType;
  return (
    <div data-tab-shell-canvas="">
      <div data-tab-shell-frame="">
        <a data-tab-skip-link="" href="#tab-main">
          Skip to content
        </a>
        <aside data-tab-shell-sidebar="">
          <div data-tab-shell-brand-row="">
            <LinkComponent aria-label="Tab home" data-tab-shell-brand="" href={brandHref}>
              <TabMark size={20} />
              <span data-tab-shell-brand-name="">tab</span>
            </LinkComponent>
            {surfaceSlot ?? <span data-tab-shell-surface-tag="">{surfaceTag}</span>}
          </div>
          <NavList ariaLabel={navAriaLabel} groups={groups} linkComponent={linkComponent} />
          <div data-tab-shell-sidebar-bottom="">
            {modeSlot}
            {accountSlot}
          </div>
        </aside>
        <div data-tab-shell-content="">
          {bannerSlot}
          <main data-tab-shell-main="" id="tab-main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
