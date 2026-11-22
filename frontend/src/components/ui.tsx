import { ChevronLeft, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { pushBackHandler } from "../native/platform";
import { back } from "../router";

// ---------------------------------------------------------------- layout
export function Page({ title, eyebrow, showBack, actions, children }: { title: ReactNode; eyebrow?: ReactNode; showBack?: boolean; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="screen">
      <header className="page-head">
        {showBack && (
          <button className="icon-btn" aria-label="Back" onClick={() => back()}>
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="title">
          {eyebrow && <div className="eyebrow">{eyebrow}</div>}
          <h1 className="ellipsis">{title}</h1>
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}

export function Section({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "", onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`card ${className}`} onClick={onClick} role={onClick ? "button" : undefined}>
      {children}
    </div>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="icon">{icon}</div>}
      <b>{title}</b>
      {text && <small>{text}</small>}
      {action}
    </div>
  );
}

export function Stat({ label, value, sub, icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; onClick?: () => void }) {
  return (
    <div className={`stat ${onClick ? "clickable" : ""}`} onClick={onClick} role={onClick ? "button" : undefined}>
      <div className="label">
        {icon}
        {label}
      </div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- progress
export function Bar({ value, tone }: { value: number; tone?: "success" | "warning" | "danger" }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div className={`bar ${tone ?? ""}`} role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${v * 100}%` }} />
    </div>
  );
}

export function Ring({ value, size = 76, stroke = 8, label, color = "var(--accent)", track = "var(--surface-3)" }: { value: number; size?: number; stroke?: number; label?: ReactNode; color?: string; track?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {v > 0.001 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dashoffset .6s ease" }} />}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={size * 0.24}>
        {label ?? `${Math.round(v * 100)}%`}
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------- controls
export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? "on" : ""} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" aria-label={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </label>
  );
}

export function NumberInput({ value, onChange, min, max, step, placeholder }: { value: number | null; onChange: (v: number | null) => void; min?: number; max?: number; step?: number; placeholder?: string }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => {
    const n = text === "" ? null : Number(text);
    if (n !== value) setText(value === null || value === undefined ? "" : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      inputMode="decimal"
      type="number"
      value={text}
      min={min}
      max={max}
      step={step ?? "any"}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === "") onChange(null);
        else {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------- overlays
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const pop = pushBackHandler(onClose);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => {
      pop();
      window.removeEventListener("keydown", esc);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// Global confirm dialog + toasts (imperative API, rendered by <OverlayHost/>).
type ConfirmReq = { title: string; body?: ReactNode; confirm?: string; danger?: boolean; resolve: (v: boolean) => void };
type ToastItem = { id: number; text: string; kind: "info" | "xp" | "error" };
let confirmSetter: ((r: ConfirmReq | null) => void) | null = null;
let toastSetter: ((fn: (t: ToastItem[]) => ToastItem[]) => void) | null = null;
let toastId = 0;

export function confirmDialog(opts: Omit<ConfirmReq, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    if (!confirmSetter) return resolve(window.confirm(opts.title));
    confirmSetter({ ...opts, resolve });
  });
}

export function toast(text: string, kind: ToastItem["kind"] = "info") {
  const id = ++toastId;
  toastSetter?.((t) => [...t.slice(-2), { id, text, kind }]);
  setTimeout(() => toastSetter?.((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 2800);
}

export function OverlayHost() {
  const [req, setReq] = useState<ConfirmReq | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  useEffect(() => {
    confirmSetter = setReq;
    toastSetter = setToasts;
    return () => {
      confirmSetter = null;
      toastSetter = null;
    };
  }, []);
  useEffect(() => {
    if (!req) return;
    return pushBackHandler(() => {
      req.resolve(false);
      setReq(null);
    });
  }, [req]);
  const close = (v: boolean) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <>
      {req && (
        <>
          <div className="backdrop dialog-backdrop" onClick={() => close(false)} />
          <div className="dialog" role="alertdialog" aria-modal="true">
            <h2>{req.title}</h2>
            {req.body && <div className="muted mt">{req.body}</div>}
            <div className="row mt-l" style={{ justifyContent: "flex-end" }}>
              <button className="btn" onClick={() => close(false)}>
                Cancel
              </button>
              <button className={`btn ${req.danger ? "danger" : "primary"}`} onClick={() => close(true)}>
                {req.confirm ?? "Confirm"}
              </button>
            </div>
          </div>
        </>
      )}
      <div className="toast-host" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

export function xpToast(res: { xp: number; achievements: string[] }) {
  if (res.xp > 0) toast(`+${res.xp} XP`, "xp");
  for (const a of res.achievements) toast(`🏅 Achievement unlocked: ${a}`, "xp");
}

export const COURSE_COLORS = ["#4f6bff", "#7b5cff", "#e0405a", "#f2a93b", "#16a36a", "#0ea5b7", "#ec4899", "#64748b"];
