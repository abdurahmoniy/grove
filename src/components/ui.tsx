import { useEffect, useId, useRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  X,
  GitBranch,
  LoaderCircle,
  Check,
  AlertCircle,
  FileCode2,
  FileText,
  Braces,
} from "lucide-react";

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 27V15M16 20C7 20 4 15 5 7c8 0 12 4 11 13ZM16 15C16 7 21 3 28 4c0 8-4 12-12 11Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function IconButton({
  label,
  children,
  className = "",
  type = "button",
  title = label,
  ...props
}: {
  label: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">) {
  return (
    <button
      {...props}
      type={type}
      className={`icon-button ${className}`}
      title={title}
      aria-label={label}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function EmptyState({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <GitBranch size={30} strokeWidth={1.4} aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Loading({
  label = "Loading your workspace",
}: {
  label?: string;
}) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <LoaderCircle className="spin" size={20} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
export function FileIcon({ path }: { path: string }) {
  const extension = path.split(".").pop();
  return extension === "tsx" || extension === "ts" ? (
    <span className="file-type ts" aria-hidden="true">
      TS
    </span>
  ) : extension === "css" ? (
    <span className="file-type css" aria-hidden="true">
      #
    </span>
  ) : extension === "json" ? (
    <Braces size={15} className="muted" aria-hidden="true" />
  ) : extension === "md" ? (
    <FileText size={15} className="muted" aria-hidden="true" />
  ) : (
    <FileCode2 size={15} className="muted" aria-hidden="true" />
  );
}
export function StatusMark({ status }: { status: string }) {
  const label =
    {
      M: "Modified",
      A: "Added",
      D: "Deleted",
      R: "Renamed",
      C: "Copied",
      T: "File type changed",
      U: "Conflict",
      "?": "Untracked",
      "!": "Ignored",
    }[status] || status;
  const tone =
    status === "U" ? "conflict" : status === "?" ? "untracked" : status;
  return (
    <span
      className={`status-mark status-${tone}`}
      title={label}
      role="img"
      aria-label={label}
    >
      {status === "U" ? "!" : status}
    </span>
  );
}
export function timeAgo(date: string): string {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(date).getTime()) / 60000),
  );
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)}d ago`;
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar ${small ? "small" : ""}`}
      style={
        {
          "--avatar-hue":
            [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360,
        } as React.CSSProperties
      }
    >
      {name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("") || "G"}
    </span>
  );
}
export function Toast({
  message,
  error,
  onClose,
}: {
  message: string;
  error?: boolean;
  onClose: () => void;
}) {
  return (
    <div
      role={error ? "alert" : "status"}
      aria-atomic="true"
      className={`toast ${error ? "error" : ""}`}
    >
      {error ? (
        <AlertCircle size={18} aria-hidden="true" />
      ) : (
        <Check size={18} aria-hidden="true" />
      )}
      <span>{message}</span>
      <IconButton label="Dismiss notification" onClick={onClose}>
        <X size={15} />
      </IconButton>
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (!dialog) return;
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button, input, textarea, select, summary, [contenteditable="true"], [tabindex]',
        ),
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
          element.getClientRects().length > 0 &&
          getComputedStyle(element).visibility !== "hidden",
      );
    const isTopDialog = () => {
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      );
      return dialogs[dialogs.length - 1] === dialog;
    };
    const items = focusables();
    const initial =
      items.find((element) => element.matches("[autofocus]")) ||
      items.find((element) => element.matches("input, textarea, select")) ||
      items[0] ||
      dialog;
    if (!dialog.contains(document.activeElement)) initial.focus();
    const supportsOpenSelect = CSS.supports("selector(select:open)");
    const listener = (e: KeyboardEvent) => {
      if (!isTopDialog() || e.defaultPrevented || e.isComposing) return;
      // Let an open native picker handle Escape, Tab, and option navigation
      // before applying the containing dialog's keyboard behavior.
      if (supportsOpenSelect && dialog.querySelector("select:open")) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        if (!first) {
          e.preventDefault();
          dialog.focus();
        } else if (
          e.shiftKey &&
          (current === first || !items.includes(current as HTMLElement))
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (current === last || !items.includes(current as HTMLElement))
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const containFocus = (e: FocusEvent) => {
      if (
        isTopDialog() &&
        e.target instanceof Node &&
        !dialog.contains(e.target)
      ) {
        (focusables()[0] || dialog).focus();
      }
    };
    document.addEventListener("keydown", listener);
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("keydown", listener);
      document.removeEventListener("focusin", containFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p id={subtitleId}>{subtitle}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  );
}
