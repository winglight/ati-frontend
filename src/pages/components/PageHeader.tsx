import { ReactNode } from 'react';
import styles from './PageHeader.module.css';

interface HeaderAction {
  label: string;
  variant: 'primary' | 'outline';
  onClick?: () => void;
  disabled?: boolean;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: HeaderAction[];
  headerMeta?: ReactNode;
}

function PageHeader({ title, description, actions, headerMeta }: PageHeaderProps) {
  return (
    <div className={styles.header}>
      <div>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {headerMeta ? <div className={styles.headerMeta}>{headerMeta}</div> : null}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions && actions.length > 0 ? (
        <div className={styles.actions}>
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={styles[action.variant]}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default PageHeader;
