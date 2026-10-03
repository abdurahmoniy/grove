import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
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
  onClick,
  disabled,
  className = "",
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      className={`icon-button ${className}`}
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
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
        <GitBranch size={30} strokeWidth={1.4} />
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
    <div className="loading">
      <LoaderCircle className="spin" size={20} />
      <span>{label}</span>
    </div>
  );
}
export function FileIcon({ path }: { path: string }) {
  const extension = path.split(".").pop();
  return extension === "tsx" || extension === "ts" ? (
    <span className="file-type ts">TS</span>
  ) : extension === "css" ? (
    <span className="file-type css">#</span>
  ) : extension === "json" ? (
    <Braces size={15} className="muted" />
  ) : extension === "md" ? (
    <FileText size={15} className="muted" />
  ) : (
    <FileCode2 size={15} className="muted" />
  );
}
export function StatusMark({ status }: { status: string }) {
  const s = status === "?" ? "U" : status;
  return (
    <span
      className={`status-mark status-${s}`}
      title={
        s === "M"
          ? "Modified"
          : s === "A" || s === "U"
            ? "Added / untracked"
            : s === "D"
              ? "Deleted"
              : s
      }
    >
      {s}
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
      className={`toast ${error ? "error" : ""}`}
    >
      {error ? <AlertCircle size={18} /> : <Check size={18} />}
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input, textarea, select, [tabindex="0"]',
        ) || [],
      );
    (
      ref.current?.querySelector<HTMLElement>(
        "[autofocus], input, textarea, select",
      ) || focusables()[0]
    )?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [onClose]);
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
        aria-labelledby="modal-title"
        className={`modal ${wide ? "wide" : ""}`}
      >
        <div className="modal-heading">
          <div>
            <h2 id="modal-title">{title}</h2>
            {subtitle && <p>{subtitle}</p>}
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
