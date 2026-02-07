import { FormEvent, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { readAutoLoginPreference, readStoredCredentials } from '@store/thunks/auth';
import styles from './LoginDialog.module.css';

interface LoginDialogProps {
  open: boolean;
  loading?: boolean;
  error?: string;
  onSubmit: (credentials: { username: string; password: string; autoLogin: boolean }) => void;
}

function LoginDialog({ open, loading = false, error, onSubmit }: LoginDialogProps) {
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [autoLogin, setAutoLogin] = useState(false);

  useEffect(() => {
    if (open && usernameRef.current) {
      usernameRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (typeof window === 'undefined') {
      setAutoLogin(false);
      return;
    }
    const autoLoginPreference = readAutoLoginPreference();
    const storedCredentials = readStoredCredentials();
    const hasStoredCredentials = Boolean(storedCredentials);
    const shouldAutoLogin = autoLoginPreference && hasStoredCredentials;
    setAutoLogin(shouldAutoLogin);
    if (storedCredentials) {
      setUsername(storedCredentials.username);
      if (shouldAutoLogin) {
        setPassword(storedCredentials.password);
      } else {
        setPassword('');
      }
    } else {
      setUsername('');
      if (!shouldAutoLogin) {
        setPassword('');
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open && !autoLogin) {
      setPassword('');
    }
  }, [open, autoLogin]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!username.trim() || !password.trim() || loading) {
      return;
    }
    onSubmit({ username: username.trim(), password, autoLogin });
  };

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-dialog-title"
      >
        <h2 id="login-dialog-title" className={styles.title}>
          欢迎登录
        </h2>
        <p className={styles.subtitle}>请输入您的账号密码以继续使用控制台功能。</p>
        {error ? <div className={styles.error}>{error}</div> : null}
        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>用户名</span>
            <input
              ref={usernameRef}
              className={styles.input}
              type="text"
              autoComplete="username"
              placeholder="请输入用户名"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={loading}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>密码</span>
            <input
              className={styles.input}
              type="password"
              autoComplete="current-password"
              placeholder="请输入密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
            />
          </label>
          <label className={clsx(styles.autoLogin, { [styles.autoLoginDisabled]: loading })}>
            <input
              className={styles.autoLoginCheckbox}
              type="checkbox"
              checked={autoLogin}
              onChange={(event) => setAutoLogin(event.target.checked)}
              disabled={loading}
            />
            <div className={styles.autoLoginTexts}>
              <span className={styles.autoLoginTitle}>自动登录</span>
              <span className={styles.autoLoginDescription}>记住用户名和密码，下一次自动登录。</span>
            </div>
          </label>
          <div className={styles.actions}>
            <button
              type="submit"
              className={clsx(styles.submitButton, { [styles.submitButtonLoading]: loading })}
              disabled={loading}
            >
              {loading ? '登录中…' : '登录'}
            </button>
          </div>
        </form>
        <p className={styles.helper}>登录成功后将自动恢复您的会话数据。</p>
      </div>
    </div>
  );
}

export default LoginDialog;
