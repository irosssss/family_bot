import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Coins, X, Sparkles } from 'lucide-react';
import type { DemoAction, DemoState, DemoUser } from './types';

export type Act = (action: Omit<DemoAction, 'actorId'>) => Promise<boolean>;
export interface ScreenProps { state: DemoState; user: DemoUser; act: Act; busy: boolean; }
export const classes = { warrior: 'Воин', mage: 'Маг', healer: 'Целитель', rogue: 'Разбойник' };
export const subtypes = { father: 'Папа', mother: 'Мама', son: 'Сын', daughter: 'Дочь' };
export function Button({ children, variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'quiet' | 'danger' }) {
  return <button type="button" className={`demo-button ${variant} ${className}`} {...props}>{children}</button>;
}
export function Money({ value, premium = false }: { value: number; premium?: boolean }) {
  return <span className={`demo-money ${premium ? 'premium' : ''}`}>{premium ? <Sparkles size={16} aria-hidden /> : <Coins size={16} aria-hidden />}<span>{new Intl.NumberFormat('ru').format(value)}</span><span className="sr-only">{premium ? 'демо-кристаллов декора' : 'семейных монет'}</span></span>;
}
export function Art({ src, name, className = '' }: { src: string; name: string; className?: string }) {
  return <img className={`demo-art ${className}`} src={src} alt={name} loading="lazy" draggable={false} />;
}
export function SectionTitle({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  return <header className="demo-section-title"><div><h1>{title}</h1>{text && <p>{text}</p>}</div>{children}</header>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]');
      if (!nodes?.length) { event.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', key); prior?.focus(); };
  }, []);
  return <div className="demo-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="demo-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={ref}>
      <header><h2 id={titleId}>{title}</h2><button className="demo-icon-button" onClick={onClose} aria-label="Закрыть"><X size={22} /></button></header>
      <div className="demo-modal-body">{children}</div>
    </div>
  </div>;
}
export function Empty({ children }: { children: ReactNode }) { return <p className="demo-empty">{children}</p>; }
