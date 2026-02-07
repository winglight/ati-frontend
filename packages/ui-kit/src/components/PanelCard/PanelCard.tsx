import { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './PanelCard.module.css';

export interface PanelAction {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'default';
  disabled?: boolean;
}

export interface PanelCardProps {
  title: string;
  children: ReactNode;
  actions?: PanelAction[];
  footer?: ReactNode;
  dense?: boolean;
  className?: string;
  headerMeta?: ReactNode;
  subtitle?: ReactNode;
}

export function PanelCard({ title, children, actions, footer, dense = false, className, headerMeta, subtitle }: PanelCardProps) {
  return (
    <section className={clsx(styles.card, dense && styles.dense, className)}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h3 className={styles.title}>{title}</h3>
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        {headerMeta ? <div className={styles.headerMeta}>{headerMeta}</div> : null}
        {actions?.length ? (
          <div className={styles.actions}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={clsx(
                  styles.actionButton,
                  action.variant === 'primary' && styles.primaryAction
                )}
                onClick={action.disabled ? undefined : action.onClick}
                disabled={action.disabled}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      <div className={styles.content}>{children}</div>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}

export default PanelCard;
