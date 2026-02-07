import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { removeToast } from '@store/slices/toastSlice';
import styles from './ToastCenter.module.css';

interface ToastCenterProps {
  position?: 'top-right' | 'bottom-right' | 'top-left' | 'bottom-left';
}

interface ToastMessageProps {
  id: string;
  message: string;
  variant: 'success' | 'error' | 'info';
  duration?: number;
  onDismiss: (id: string) => void;
}

const ToastMessage = ({ id, message, variant, duration, onDismiss }: ToastMessageProps) => {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(id), duration ?? 4000);
    return () => window.clearTimeout(timer);
  }, [duration, id, onDismiss]);

  return (
    <div className={`${styles.toast} ${styles[variant]}`}>
      <span>{message}</span>
      <button type="button" onClick={() => onDismiss(id)}>
        ×
      </button>
    </div>
  );
};

const ToastCenter = ({ position = 'top-right' }: ToastCenterProps) => {
  const dispatch = useAppDispatch();
  const toasts = useAppSelector((state) => state.toast.items);

  if (!toasts.length) {
    return null;
  }

  const handleDismiss = (id: string) => {
    dispatch(removeToast(id));
  };

  return (
    <div className={`${styles.toastContainer} ${styles[position]}`}>
      {toasts.map((toast) => (
        <ToastMessage
          key={toast.id}
          id={toast.id}
          message={toast.message}
          variant={toast.variant}
          duration={toast.duration}
          onDismiss={handleDismiss}
        />
      ))}
    </div>
  );
};

export default ToastCenter;
