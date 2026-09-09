import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Button({ children, className = '', secondary = false, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) { return <button type="button" className={`v3-button ${secondary ? 'secondary' : ''} ${className}`} {...props}>{children}</button>; }
export function PageHeading({ title, text, children }: { title: string; text?: string; children?: ReactNode }) { return <header className="v3-heading"><div><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</header>; }
export function Meter({ value, max, label }: { value: number; max: number; label: string }) { return <div className="v3-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}><span style={{ width: `${Math.max(0, Math.min(100, value / Math.max(1, max) * 100))}%` }}/></div>; }
export function Sheet({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const titleId = useId(); const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const prior = document.activeElement as HTMLElement | null; const dialog = ref.current; const overflow = document.body.style.overflow; dialog?.showModal(); document.body.style.overflow = 'hidden'; return () => { dialog?.close(); document.body.style.overflow = overflow; prior?.focus(); }; }, []);
  return <dialog ref={ref} className="v3-sheet" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close(); } }}><header><h2 id={titleId}>{title}</h2><Button secondary aria-label="Закрыть" onClick={close}><X size={20}/></Button></header><div className="v3-sheet-body">{children}</div></dialog>;
}
