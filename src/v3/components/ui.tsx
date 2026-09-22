import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'danger' }) {
  return <button type="button" className={`demo-button ${variant} ${className}`} {...props}>{children}</button>;
}
export function SectionTitle({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return <header className="demo-section-title"><div><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</header>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const dialog = ref.current;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (prior?.isConnected) prior.focus();
    };
  }, []);
  return <dialog className="demo-modal" aria-labelledby={titleId} ref={ref}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }}>
    <header><h2 id={titleId}>{title}</h2><button type="button" className="demo-icon-button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button></header>
    <div className="demo-modal-body">{children}</div>
  </dialog>;
}
