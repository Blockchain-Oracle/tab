"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

export interface ModalSurfaceProps {
  children: ReactNode;
  description?: string;
  finalFocusRef?: RefObject<HTMLElement | null>;
  onDismiss: () => void;
  open: boolean;
  title: string;
}

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function canReceiveFocus(element: HTMLElement | null): element is HTMLElement {
  if (!element?.isConnected) return false;
  if (element === document.body || element.hidden || element.closest("[hidden], [inert]"))
    return false;
  if (element.getAttribute("aria-disabled") === "true") return false;
  return !("disabled" in element && element.disabled === true);
}

function tryFocus(element: HTMLElement | null) {
  if (!canReceiveFocus(element)) return false;
  element.focus();
  return document.activeElement === element;
}

function restoreFocus(overlay: HTMLElement, ...preferred: Array<HTMLElement | null>) {
  for (const element of preferred) {
    if (tryFocus(element)) return;
  }
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
    if (overlay.contains(element) || element.closest("[inert]")) continue;
    if (tryFocus(element)) return;
  }
}

function isolateBackground(overlay: HTMLElement) {
  const background: Array<{
    ariaHidden: string | null;
    element: HTMLElement;
    inert: boolean;
  }> = [];
  let branch: HTMLElement = overlay;
  let parent = branch.parentElement;

  while (parent && parent !== document.documentElement) {
    for (const sibling of Array.from(parent.children)) {
      if (!(sibling instanceof HTMLElement) || sibling === branch) continue;
      background.push({
        ariaHidden: sibling.getAttribute("aria-hidden"),
        element: sibling,
        inert: sibling.inert,
      });
      sibling.inert = true;
      sibling.setAttribute("aria-hidden", "true");
    }
    branch = parent;
    parent = parent.parentElement;
  }

  return background;
}

function ModalSurface({
  children,
  description,
  finalFocusRef,
  onDismiss,
  open,
  surface,
  title,
}: ModalSurfaceProps & { surface: "dialog" | "sheet" }) {
  const titleId = useId();
  const descriptionId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPortalTarget(null);
      return;
    }
    setPortalTarget(anchorRef.current?.closest<HTMLElement>("[data-tab-ui]") ?? document.body);
  }, [open]);

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!open || !overlay || !portalTarget) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = isolateBackground(overlay);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      for (const state of background) {
        state.element.inert = state.inert;
        if (state.ariaHidden === null) state.element.removeAttribute("aria-hidden");
        else state.element.setAttribute("aria-hidden", state.ariaHidden);
      }
      document.body.style.overflow = previousOverflow;
      restoreFocus(overlay, opener, finalFocusRef?.current ?? null);
    };
  }, [finalFocusRef, open, portalTarget]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      surfaceRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    );
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
      surfaceRef.current?.focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const closeLabel = surface === "dialog" ? "Close dialog" : "Close sheet";
  return (
    <>
      <span aria-hidden="true" data-tab-portal-anchor="" hidden ref={anchorRef} />
      {portalTarget
        ? createPortal(
            <div data-tab-overlay="" ref={overlayRef}>
              <div
                aria-describedby={description ? descriptionId : undefined}
                aria-labelledby={titleId}
                aria-modal="true"
                data-surface={surface}
                data-tab-surface=""
                onKeyDown={handleKeyDown}
                ref={surfaceRef}
                role="dialog"
                tabIndex={-1}
              >
                <div data-tab-surface-header="">
                  <h2 id={titleId}>{title}</h2>
                  <button aria-label={closeLabel} onClick={onDismiss} ref={closeRef} type="button">
                    ×
                  </button>
                </div>
                {description ? <p id={descriptionId}>{description}</p> : null}
                <div data-tab-surface-content="">{children}</div>
              </div>
            </div>,
            portalTarget,
          )
        : null}
    </>
  );
}

export function Dialog(props: ModalSurfaceProps) {
  return <ModalSurface {...props} surface="dialog" />;
}

export function Sheet(props: ModalSurfaceProps) {
  return <ModalSurface {...props} surface="sheet" />;
}
