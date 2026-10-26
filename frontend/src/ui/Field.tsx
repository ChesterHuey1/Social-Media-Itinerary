import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';
import ui from './ui.module.css';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  time?: boolean;
  derived?: boolean;
};

/** The label always sits above the input. A placeholder is never the label. */
export function TextField({ label, time, derived, className, ...input }: FieldProps) {
  const id = useId();
  return (
    <div className={cx(ui.field, className)}>
      <label htmlFor={id} className={ui.fieldLabel}>
        {label}
      </label>
      <input id={id} className={cx(ui.input, time && ui.inputTime, derived && ui.inputDerived)} {...input} />
    </div>
  );
}

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string };

export function TextArea({ label, className, ...area }: AreaProps) {
  const id = useId();
  return (
    <div className={cx(ui.field, className)}>
      <label htmlFor={id} className={ui.fieldLabel}>
        {label}
      </label>
      <textarea id={id} className={cx(ui.input, ui.textarea)} {...area} />
    </div>
  );
}

export function SmallLabel({ children }: { children: ReactNode }) {
  return <div className={ui.label}>{children}</div>;
}
