import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import ui from './ui.module.css';

type Variant = 'primary' | 'secondary' | 'text' | 'textAccent';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  icon?: IconName;
  tall?: boolean;
};

const variantClass: Record<Variant, string> = {
  primary: ui.primary,
  secondary: ui.secondary,
  text: ui.text,
  textAccent: cx(ui.text, ui.textAccent),
};

/** Each screen has exactly one `primary` button: the one thing to do next. */
export function Button({ variant = 'secondary', icon, tall, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={cx(ui.btn, variantClass[variant], tall && ui.tall, className)} {...rest}>
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}
