import { useLayoutEffect, useRef } from "react";
import type { ReactNode } from "react";

/** A keyboard-accessible action menu positioned next to its invoking button. */
export default function ActionMenu({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useLayoutEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    const panel = ref.current;
    if (!panel) return;
    const items = () =>
      Array.from(
        panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
      );
    const position = () => {
      const rect = trigger?.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(rect?.left ?? 12, window.innerWidth - panel.offsetWidth - 12))}px`;
      panel.style.top = `${Math.max(12, Math.min((rect?.bottom ?? 80) + 8, window.innerHeight - panel.offsetHeight - 12))}px`;
    };
    panel
      .querySelectorAll("button")
      .forEach((button) => button.setAttribute("role", "menuitem"));
    position();
    items()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      const buttons = items();
      const index = buttons.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        const next =
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? buttons.length - 1
              : (index +
                  (event.key === "ArrowDown" ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      } else if (event.key === "Escape" || event.key === "Tab") {
        event.preventDefault();
        close.current();
        trigger?.focus();
        if (event.key === "Tab") {
          const all = Array.from(
            document.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"], summary',
            ),
          ).filter(
            (element) =>
              !panel.contains(element) &&
              !element.closest("[inert]") &&
              element.getClientRects().length,
          );
          const next = all.indexOf(trigger!) + (event.shiftKey ? -1 : 1);
          all[next]?.focus();
        }
      }
    };
    const focusOutside = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        event.target !== trigger
      )
        close.current();
    };
    const pointerOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !panel.contains(event.target) &&
        !trigger?.contains(event.target)
      )
        close.current();
    };
    panel.addEventListener("keydown", keydown);
    document.addEventListener("focusin", focusOutside);
    document.addEventListener("pointerdown", pointerOutside, true);
    window.addEventListener("resize", position);
    return () => {
      panel.removeEventListener("keydown", keydown);
      document.removeEventListener("focusin", focusOutside);
      document.removeEventListener("pointerdown", pointerOutside, true);
      window.removeEventListener("resize", position);
      // Do not steal focus from a dialog opened by an action.
      if (
        document.activeElement === document.body ||
        panel.contains(document.activeElement)
      )
        trigger?.focus();
    };
  }, []);
  return (
    <>
      <div
        id="grove-action-menu"
        ref={ref}
        role="menu"
        aria-label={label}
        className="dropdown-menu action-menu"
      >
        {children}
      </div>
    </>
  );
}
