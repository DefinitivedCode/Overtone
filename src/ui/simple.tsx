import { useId } from 'react';
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithRef,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from 'react';
import { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import s from './ui.module.css';

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ');

/* ---------- Button ---------- */
type Variant = 'primary' | 'secondary' | 'plain' | 'destructive' | 'destructiveFilled';
export interface ButtonProps extends ComponentPropsWithRef<'button'> {
  variant?: Variant;
  block?: boolean;
}
export function Button({
  variant = 'primary',
  block,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(s['button'], s[variant], block && s['block'], className)}
      {...rest}
    />
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
}
export function IconButton({
  label,
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button type={type} aria-label={label} className={cx(s['iconButton'], className)} {...rest}>
      {children}
    </button>
  );
}

/* ---------- SegmentedControl (native radios: arrow keys come for free) ---------- */
export interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; ariaLabel?: string }>;
  onChange: (value: T) => void;
  className?: string;
}
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: SegmentedProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cx(s['segmented'], className)}>
      {options.map((o) => (
        <label key={o.value} className={s['segment']}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            aria-label={o.ariaLabel}
            onChange={() => onChange(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/* ---------- TextField / TextArea ---------- */
interface FieldCommon {
  label: string;
  hint?: string;
  error?: string | undefined;
}
export interface TextFieldProps
  extends FieldCommon, Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {}
export function TextField({ label, hint, error, id, className, ...rest }: TextFieldProps) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className={cx(s['field'], className)}>
      <label className={s['label']} htmlFor={fid}>
        {label}
      </label>
      <input
        id={fid}
        className={s['input']}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
      {hint && !error ? (
        <span id={`${fid}-hint`} className={s['hint']}>
          {hint}
        </span>
      ) : null}
      <span id={`${fid}-err`} className={s['error']} role="alert">
        {error}
      </span>
    </div>
  );
}

export interface TextAreaProps
  extends FieldCommon, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  minRows?: number;
}
/** Auto-growing textarea (no inner scrollbar: the page/sheet scrolls). */
export function TextArea({
  label,
  hint,
  error,
  id,
  className,
  minRows = 8,
  value,
  ...rest
}: TextAreaProps) {
  const auto = useId();
  const fid = id ?? auto;
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <div className={cx(s['field'], className)}>
      <label className={s['label']} htmlFor={fid}>
        {label}
      </label>
      <textarea
        ref={ref}
        id={fid}
        rows={minRows}
        value={value}
        className={cx(s['input'], s['textarea'])}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-err` : hint ? `${fid}-hint` : undefined}
        {...rest}
      />
      {hint && !error ? (
        <span id={`${fid}-hint`} className={s['hint']}>
          {hint}
        </span>
      ) : null}
      <span id={`${fid}-err`} className={s['error']} role="alert">
        {error}
      </span>
    </div>
  );
}

/* ---------- Switch ---------- */
export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  hint?: string;
}
export function Switch({ label, checked, onChange, hint }: SwitchProps) {
  const id = useId();
  return (
    <div className={s['switchRow']}>
      <label htmlFor={id}>
        {label}
        {hint ? (
          <span className={s['hint']} style={{ display: 'block' }}>
            {hint}
          </span>
        ) : null}
      </label>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className={s['switch']}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}

/* ---------- Chip ---------- */
export interface ChipProps {
  children: ReactNode;
  /** Full text for screen readers when the visible text is an abbreviation (e.g. "KO"). */
  ariaLabel?: string;
}
export function Chip({ children, ariaLabel }: ChipProps) {
  return (
    <span className={s['chip']} aria-label={ariaLabel} role={ariaLabel ? 'img' : undefined}>
      {children}
    </span>
  );
}
export interface ChipButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  pressed: boolean;
}
export function ChipButton({ pressed, className, type = 'button', ...rest }: ChipButtonProps) {
  return (
    <button type={type} aria-pressed={pressed} className={cx(s['chip'], className)} {...rest} />
  );
}

/* ---------- ProgressBar ---------- */
export interface ProgressBarProps {
  value: number; // 0..1
  label?: string;
}
export function ProgressBar({ value, label }: ProgressBarProps) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <div
      className={s['progress']}
      {...(label
        ? {
            role: 'progressbar',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': Math.round(v * 100),
          }
        : { 'aria-hidden': true })}
    >
      <div className={s['progressFill']} style={{ width: `${v * 100}%` }} />
    </div>
  );
}

/* ---------- Skeleton ---------- */
export function Skeleton({
  width = '100%',
  height = 16,
}: {
  width?: number | string;
  height?: number | string;
}) {
  return <div className={s['skeleton']} aria-hidden="true" style={{ width, height }} />;
}

/* ---------- EmptyState ---------- */
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={s['empty']}>
      <svg
        className={s['emptyMark']}
        viewBox="232 312 560 400"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="232" y="312" width="248" height="64" rx="32" fill="#e5533a" />
        <rect
          className={s['l']}
          x="232"
          y="420"
          width="560"
          height="120"
          rx="60"
          fill="currentColor"
          style={{ color: 'var(--text)' }}
        />
        <rect
          x="232"
          y="592"
          width="400"
          height="120"
          rx="60"
          fill="currentColor"
          fillOpacity="0.26"
          style={{ color: 'var(--text)' }}
        />
      </svg>
      <h2 className={s['emptyTitle']}>{title}</h2>
      {children ? <p className={s['emptyBody']}>{children}</p> : null}
      {action}
    </div>
  );
}

/* ---------- Banner ---------- */
export interface BannerProps {
  tone?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
}
export function Banner({ tone = 'info', children, action, onDismiss }: BannerProps) {
  const toneClass =
    tone === 'warning'
      ? s['bannerWarning']
      : tone === 'error'
        ? s['bannerError']
        : tone === 'success'
          ? s['bannerSuccess']
          : undefined;
  return (
    <div className={cx(s['banner'], toneClass)} role={tone === 'error' ? 'alert' : 'status'}>
      <div className={s['bannerBody']}>{children}</div>
      {action}
      {onDismiss ? (
        <IconButton
          label="Dismiss"
          onClick={onDismiss}
          style={{ marginBlock: -8, marginInlineEnd: -8 }}
        >
          <X size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      ) : null}
    </div>
  );
}
