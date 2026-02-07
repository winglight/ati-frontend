import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type LabelHTMLAttributes,
  type ReactNode,
} from 'react';
import styles from './FieldHelp.module.css';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'object',
  'embed',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export interface FieldHelpProps extends LabelHTMLAttributes<HTMLLabelElement> {
  label: ReactNode;
  description: ReactNode;
}

function FieldHelp({
  label,
  description,
  className,
  children,
  ...labelProps
}: FieldHelpProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const popoverId = useMemo(() => `field-help-${id}`, [id]);
  const labelTextId = useMemo(() => `${popoverId}-label`, [popoverId]);
  const descriptionId = useMemo(() => `${popoverId}-description`, [popoverId]);
  const wasOpenRef = useRef(false);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
    if (isOpen) {
      wasOpenRef.current = true;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const popoverNode = popoverRef.current;
    if (popoverNode) {
      popoverNode.focus();
    }

    const getFocusableElements = () => {
      if (!popoverNode) {
        return [] as HTMLElement[];
      }
      const elements = Array.from(popoverNode.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      if (!elements.includes(popoverNode) && popoverNode.tabIndex >= 0) {
        elements.unshift(popoverNode);
      }
      return elements;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = getFocusableElements();
        if (focusable.length === 0) {
          event.preventDefault();
          popoverNode?.focus();
          return;
        }

        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (!active || active === first) {
            event.preventDefault();
            last.focus();
          }
        } else if (active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!popoverNode) {
        return;
      }
      if (popoverNode.contains(event.target as Node)) {
        return;
      }
      const focusable = getFocusableElements();
      const target = focusable[0] ?? popoverNode;
      target.focus();
    };

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (popoverNode?.contains(target)) {
        return;
      }
      if (triggerRef.current?.contains(target)) {
        return;
      }
      close();
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, close]);

  const toggle = () => {
    setIsOpen((prev) => !prev);
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle();
    }
  };

  const srLabel = typeof label === 'string' ? `Toggle help for ${label}` : 'Toggle help';

  return (
    <label {...labelProps} className={[styles.wrapper, className].filter(Boolean).join(' ')}>
      <span className={styles.header}>
        <span className={styles.labelText} id={labelTextId}>
          {label}
        </span>
        <button
          type="button"
          className={styles.helpButton}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-controls={popoverId}
          onClick={toggle}
          onKeyDown={handleTriggerKeyDown}
          ref={triggerRef}
        >
          <span aria-hidden="true" className={styles.helpIcon}>
            ?
          </span>
          <span className={styles.srOnly}>{srLabel}</span>
        </button>
      </span>
      {children}
      {isOpen ? (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelTextId}
          aria-describedby={descriptionId}
          className={styles.popover}
          ref={popoverRef}
          tabIndex={-1}
        >
          <div id={descriptionId} className={styles.popoverBody}>
            {description}
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close();
            }}
          >
            Close
          </button>
        </div>
      ) : null}
    </label>
  );
}

export default FieldHelp;
