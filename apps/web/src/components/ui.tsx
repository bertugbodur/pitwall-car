import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';
import type { Level } from '../lib/alerts.ts';

const cx = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ');

export function Card({ title, subtitle, action, className, children }: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cx('min-w-0 rounded-lg border border-line bg-surface p-5 shadow-card sm:p-6', className)}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="m-0 text-lg font-semibold">{title}</h2>}
            {subtitle && <p className="m-0 text-[13px] text-muted">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

const BUTTON = {
  primary: 'bg-accent text-on-accent border-transparent',
  secondary: 'bg-raised text-text border-line',
  ink: 'bg-ink text-on-ink border-transparent',
};

export function Button({ variant = 'secondary', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof BUTTON;
}) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-sm border px-4 text-[14px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON[variant],
        className,
      )}
    />
  );
}

const TONE: Record<Level | 'neutral', string> = {
  ok: 'bg-accent-soft text-accent-ink',
  warn: 'bg-warn-soft text-warn-ink',
  danger: 'bg-danger-soft text-danger-ink',
  neutral: 'bg-raised text-muted',
};

export function Badge({ tone = 'neutral', children }: { tone?: Level | 'neutral'; children: ReactNode }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold', TONE[tone])}>
      {children}
    </span>
  );
}

export function Notice({ tone = 'neutral', children }: { tone?: Level | 'neutral'; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'note'} className={cx('rounded-md px-4 py-3 text-[14px] font-medium', TONE[tone])}>
      {children}
    </div>
  );
}

export function Stat({ icon, value, unit, label, tone }: {
  icon: ReactNode;
  value: string;
  unit?: string;
  label: string;
  tone?: Level;
}) {
  const color = tone === 'danger' ? 'text-danger-ink' : tone === 'warn' ? 'text-warn-ink' : tone === 'ok' ? 'text-accent-ink' : '';
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-lg border border-line bg-surface p-5 shadow-card">
      <span className={cx('mt-1 shrink-0', color)} aria-hidden="true">{icon}</span>
      <div className="min-w-0">
        <div className="tnum text-4xl leading-tight font-bold">
          {value}
          {unit && <span className="ml-1 text-base font-semibold text-muted">{unit}</span>}
        </div>
        <div className="text-[13px] text-muted">{label}</div>
      </div>
    </div>
  );
}

const CONTROL = 'min-h-11 w-full rounded-sm border border-line bg-raised px-3 text-[15px] text-text';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[13px] font-semibold">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => (
  <input {...props} className={cx(CONTROL, className)} />
);

export const Select = ({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...props} className={cx(CONTROL, className)} />
);

export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-3xl leading-tight font-bold">{title}</h1>
        {subtitle && <p className="m-0 text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
