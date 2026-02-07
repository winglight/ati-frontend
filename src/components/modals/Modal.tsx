import { ReactNode, useEffect } from 'react';
import { useTranslation } from '@i18n';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import styles from './Modal.module.css';

interface ModalAction {
  label: string;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

export interface ModalProps {
  open: boolean;
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ModalAction[];
  size?: 'default' | 'md' | 'lg' | 'xl';
  headerActions?: ReactNode;
  variant?: 'default' | 'frameless';
}

const modalRoot = typeof document !== 'undefined' ? document.body : null;

function Modal({
  open,
  title,
  subtitle,
  children,
  onClose,
  actions,
  size = 'default',
  headerActions,
  variant = 'default'
}: ModalProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!modalRoot) {
      return;
    }
    if (open) {
      const previousOverflow = modalRoot.style.overflow;
      modalRoot.style.overflow = 'hidden';
      return () => {
        modalRoot.style.overflow = previousOverflow;
      };
    }
    return;
  }, [open]);

  if (!open || !modalRoot) {
    return null;
  }

  const isFrameless = variant === 'frameless';

  const modalClassName = clsx(styles.modal, {
    [styles.sizeMd]: size === 'md',
    [styles.sizeLg]: size === 'lg',
    [styles.sizeXl]: size === 'xl',
    [styles.frameless]: isFrameless
  });

  const labelledBy = isFrameless ? undefined : 'modal-title';
  const describedBy = isFrameless || !subtitle ? undefined : 'modal-subtitle';

  const content = (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={modalClassName}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        aria-label={isFrameless ? title : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        {isFrameless ? (
          <div className={clsx(styles.header, styles.framelessHeader)}>
            <div className={clsx(styles.headerControls, styles.framelessHeaderControls)}>
              {headerActions ? (
                <div className={clsx(styles.headerActions, styles.framelessHeaderActions)}>
                  {headerActions}
                </div>
              ) : null}
              <button
                type="button"
                className={clsx(styles.closeButton, styles.framelessCloseButton)}
                onClick={onClose}
                aria-label={t('modals.common.close')}
              >
                ×
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.header}>
            <div className={styles.headerTexts}>
              <h2 id="modal-title" className={styles.title}>
                {title}
              </h2>
              {subtitle ? (
                <p id="modal-subtitle" className={styles.subtitle}>
                  {subtitle}
                </p>
              ) : null}
            </div>
            <div className={styles.headerControls}>
              {headerActions ? <div className={styles.headerActions}>{headerActions}</div> : null}
              <button type="button" className={styles.closeButton} onClick={onClose} aria-label={t('modals.common.close')}>
                ×
              </button>
            </div>
          </div>
        )}
        <div className={clsx(styles.content, isFrameless && styles.framelessContent)}>{children}</div>
        {actions?.length && !isFrameless ? (
          <div className={styles.footer}>
            {actions.map((action) => (
              <button
                key={action.label}
                type="button"
                className={styles.actionButton}
                onClick={() => {
                  action.onClick?.();
                  if (action.variant !== 'secondary') {
                    onClose();
                  }
                }}
              >
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, modalRoot);
}

export default Modal;
