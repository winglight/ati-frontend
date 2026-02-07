import { ChangeEvent } from 'react';
import styles from './DocsAuthSettings.module.css';

export interface DocsAuthSettingsProps {
  headerName: string;
  headerValue: string;
  onChange: (name: string, value: string) => void;
  onReset: () => void;
}

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim();

function DocsAuthSettings({ headerName, headerValue, onChange, onReset }: DocsAuthSettingsProps) {
  const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(normalize(event.target.value), headerValue);
  };

  const handleValueChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(headerName, event.target.value);
  };

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>鉴权 Header 设置</h2>
          <p className={styles.sectionDescription}>
            配置全局鉴权 Header，接口调试时会自动携带该配置。可根据部署环境填写 Token 或其他认证信息。
          </p>
        </div>
        <button type="button" className={styles.resetButton} onClick={onReset}>
          重置
        </button>
      </div>
      <div className={styles.formGrid}>
        <label className={styles.inputGroup}>
          <span className={styles.inputLabel}>Header 名称</span>
          <input
            className={styles.input}
            placeholder="例如 Authorization"
            value={headerName}
            onChange={handleNameChange}
            spellCheck={false}
          />
        </label>
        <label className={styles.inputGroup}>
          <span className={styles.inputLabel}>Header 值</span>
          <input
            className={styles.input}
            placeholder="例如 Bearer &lt;token&gt;"
            value={headerValue}
            onChange={handleValueChange}
            spellCheck={false}
          />
        </label>
      </div>
    </section>
  );
}

export default DocsAuthSettings;
