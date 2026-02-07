import { ElementType, HTMLAttributes, ReactNode } from 'react';
import clsx from 'clsx';
import styles from './Typography.module.css';

type HeadingLevel = 'display' | 'section' | 'subsection';

type HeadingProps<T extends ElementType> = {
  as?: T;
  level?: HeadingLevel;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children'>;

export function Heading<T extends ElementType = 'h2'>({
  as,
  level = 'section',
  children,
  className,
  ...rest
}: HeadingProps<T>) {
  const Component = (as ?? 'h2') as ElementType;
  return (
    <Component
      className={clsx(
        styles.heading,
        level === 'display' && styles.headingDisplay,
        level === 'section' && styles.headingSection,
        level === 'subsection' && styles.headingSubsection,
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

type TextTone = 'default' | 'strong' | 'muted';

type TextProps<T extends ElementType> = {
  as?: T;
  tone?: TextTone;
  children: ReactNode;
} & Omit<HTMLAttributes<HTMLElement>, 'children'>;

export function Text<T extends ElementType = 'p'>({ as, tone = 'default', children, className, ...rest }: TextProps<T>) {
  const Component = (as ?? 'p') as ElementType;
  return (
    <Component
      className={clsx(
        styles.text,
        tone === 'strong' && styles.textStrong,
        tone === 'muted' && styles.textMuted,
        className
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}

export interface CaptionProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
}

export function Caption({ children, className, ...rest }: CaptionProps) {
  return (
    <span className={clsx(styles.caption, className)} {...rest}>
      {children}
    </span>
  );
}
