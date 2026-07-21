import type { ElementType, ReactElement, ReactNode } from "react";

export interface NavItem {
  active: boolean;
  badge?: ReactNode;
  href: string;
  label: string;
}

export interface NavGroup {
  items: readonly NavItem[];
  label: string;
}

export interface NavListProps {
  ariaLabel: string;
  groups: readonly NavGroup[];
  /** Link renderer — apps pass next/link; defaults to <a>. */
  linkComponent?: ElementType | undefined;
}

/**
 * Grouped sidebar navigation. The active item carries a vermilion rail bar
 * that redraws once per route change (keyed on href).
 */
export function NavList({ ariaLabel, groups, linkComponent }: NavListProps): ReactElement {
  const LinkComponent = (linkComponent ?? "a") as ElementType;
  return (
    <nav aria-label={ariaLabel} data-tab-nav="">
      {groups.map((group) => (
        <ul aria-label={group.label} data-tab-nav-group="" key={group.label}>
          <li aria-hidden="true" data-tab-nav-group-label="">
            {group.label}
          </li>
          {group.items.map((item) => (
            <li key={item.href}>
              <LinkComponent
                aria-current={item.active ? "page" : undefined}
                data-tab-nav-item=""
                data-active={item.active ? "" : undefined}
                href={item.href}
              >
                {item.active ? (
                  <span aria-hidden="true" data-tab-nav-rail="" key={item.href} />
                ) : null}
                <span data-tab-nav-label="">{item.label}</span>
                {item.badge}
              </LinkComponent>
            </li>
          ))}
        </ul>
      ))}
    </nav>
  );
}
