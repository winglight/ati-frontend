import { useEffect, useMemo, useState } from 'react';
import Modal from './Modal';
import styles from './NotificationSettingsModal.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { fetchNotificationSettings, saveNotificationSettings } from '@store/thunks/notificationSettings';
import type { NotificationSettingsPayload } from '@services/notificationSettingsApi';

interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type TabKey = 'basic' | 'modules';

const defaultPayload: NotificationSettingsPayload = {
  telegram: { enabled: false, botToken: '', chatId: '' },
  email: { enabled: false, address: '' },
  reminder: { startTime: '20:30', endTime: '22:30', browser: true, telegram: false },
  modules: {}
};

const isEqualSettings = (
  a: NotificationSettingsPayload,
  b: NotificationSettingsPayload | null | undefined
): boolean => {
  if (!b) {
    return false;
  }
  return JSON.stringify(a) === JSON.stringify(b);
};

function NotificationSettingsModal({ open, onClose }: NotificationSettingsModalProps) {
  const dispatch = useAppDispatch();
  const settingsState = useAppSelector((state) => state.notificationSettings);
  const [activeTab, setActiveTab] = useState<TabKey>('basic');
  const [formState, setFormState] = useState<NotificationSettingsPayload>(defaultPayload);
  const [touched, setTouched] = useState(false);

  const moduleDefinitions = settingsState.data?.moduleDefinitions ?? {};

  useEffect(() => {
    if (!open) {
      return;
    }
    setActiveTab('basic');
    if (settingsState.status === 'idle') {
      void dispatch(fetchNotificationSettings());
    }
  }, [dispatch, open, settingsState.status]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (settingsState.data) {
      const nextState: NotificationSettingsPayload = {
        telegram: { ...settingsState.data.telegram },
        email: { ...settingsState.data.email },
        reminder: { ...settingsState.data.reminder },
        modules: { ...settingsState.data.modules }
      };
      setFormState(nextState);
      setTouched(false);
    }
  }, [open, settingsState.data]);

  const loading = settingsState.status === 'loading';
  const saving = settingsState.saving;
  const hasServerData = Boolean(settingsState.data);

  const hasChanges = useMemo(() => {
    if (!settingsState.data) {
      return touched;
    }
    return touched || !isEqualSettings(formState, settingsState.data);
  }, [formState, settingsState.data, touched]);

  const updateForm = (updater: (draft: NotificationSettingsPayload) => NotificationSettingsPayload) => {
    setFormState((prev) => {
      const next = updater({ ...prev, modules: { ...prev.modules } });
      if (!touched) {
        setTouched(true);
      }
      return next;
    });
  };

  const handleTelegramToggle = (enabled: boolean) => {
    updateForm((draft) => ({
      ...draft,
      telegram: { ...draft.telegram, enabled }
    }));
  };

  const handleTelegramField = (field: 'botToken' | 'chatId', value: string) => {
    updateForm((draft) => ({
      ...draft,
      telegram: { ...draft.telegram, [field]: value }
    }));
  };

  const handleEmailToggle = (enabled: boolean) => {
    updateForm((draft) => ({
      ...draft,
      email: { ...draft.email, enabled }
    }));
  };

  const handleEmailField = (value: string) => {
    updateForm((draft) => ({
      ...draft,
      email: { ...draft.email, address: value }
    }));
  };

  const handleReminderField = (field: 'startTime' | 'endTime', value: string) => {
    updateForm((draft) => ({
      ...draft,
      reminder: { ...draft.reminder, [field]: value }
    }));
  };

  const handleReminderToggle = (field: 'browser' | 'telegram', value: boolean) => {
    updateForm((draft) => ({
      ...draft,
      reminder: { ...draft.reminder, [field]: value }
    }));
  };

  const handleModuleToggle = (
    moduleKey: string,
    channel: keyof NotificationSettingsPayload['modules'][string],
    value: boolean
  ) => {
    updateForm((draft) => ({
      ...draft,
      modules: {
        ...draft.modules,
        [moduleKey]: {
          ...(draft.modules[moduleKey] ?? { chrome: true, telegram: false, email: false }),
          [channel]: value
        }
      }
    }));
  };

  const handleReset = () => {
    if (settingsState.data) {
      setFormState({
        telegram: { ...settingsState.data.telegram },
        email: { ...settingsState.data.email },
        reminder: { ...settingsState.data.reminder },
        modules: { ...settingsState.data.modules }
      });
      setTouched(false);
    }
  };

  const handleSave = () => {
    void dispatch(saveNotificationSettings(formState));
  };

  const renderBasicTab = () => (
    <div className={styles.tabContent}>
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <div>
            <h3>Telegram 通知</h3>
            <p>配置机器人凭据以接收策略事件的即时推送。</p>
          </div>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={formState.telegram.enabled}
              onChange={(event) => handleTelegramToggle(event.target.checked)}
            />
            <span className={styles.slider} />
          </label>
        </header>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Bot Token</span>
            <input
              type="text"
              value={formState.telegram.botToken}
              onChange={(event) => handleTelegramField('botToken', event.target.value)}
              placeholder="请输入 @BotFather 分配的 Token"
            />
          </label>
          <label className={styles.field}>
            <span>Chat ID</span>
            <input
              type="text"
              value={formState.telegram.chatId}
              onChange={(event) => handleTelegramField('chatId', event.target.value)}
              placeholder="请输入目标会话的 Chat ID"
            />
          </label>
        </div>
      </section>
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <div>
            <h3>邮件通知</h3>
            <p>将执行结果和风控事件发送到指定邮箱。</p>
          </div>
          <label className={styles.switch}>
            <input
              type="checkbox"
              checked={formState.email.enabled}
              onChange={(event) => handleEmailToggle(event.target.checked)}
            />
            <span className={styles.slider} />
          </label>
        </header>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>邮箱地址</span>
            <input
              type="email"
              value={formState.email.address}
              onChange={(event) => handleEmailField(event.target.value)}
              placeholder="例如 alerts@example.com"
            />
          </label>
        </div>
      </section>
      <section className={styles.card}>
        <header className={styles.cardHeader}>
          <div>
            <h3>交易时段提醒</h3>
            <p>在设定的时间窗口内发送开盘与收盘提醒。</p>
          </div>
        </header>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>开始时间</span>
            <input
              type="time"
              value={formState.reminder.startTime}
              onChange={(event) => handleReminderField('startTime', event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>结束时间</span>
            <input
              type="time"
              value={formState.reminder.endTime}
              onChange={(event) => handleReminderField('endTime', event.target.value)}
            />
          </label>
        </div>
        <div className={styles.toggleRow}>
          <label>
            <input
              type="checkbox"
              checked={formState.reminder.browser}
              onChange={(event) => handleReminderToggle('browser', event.target.checked)}
            />
            浏览器提醒
          </label>
          <label>
            <input
              type="checkbox"
              checked={formState.reminder.telegram}
              onChange={(event) => handleReminderToggle('telegram', event.target.checked)}
            />
            Telegram 提醒
          </label>
        </div>
        <div className={styles.reminderActions}>
          <button
            type="button"
            className={styles.outlineButton}
            onClick={() => window.alert('提醒测试已触发，将根据当前配置模拟发送。')}
          >
            测试提醒
          </button>
          <button
            type="button"
            className={styles.outlineButton}
            onClick={() => void dispatch(fetchNotificationSettings())}
          >
            检查通道状态
          </button>
        </div>
      </section>
    </div>
  );

  const renderModulesTab = () => (
    <div className={styles.tabContent}>
      <div className={styles.moduleTableWrapper}>
        <table className={styles.moduleTable}>
          <thead>
            <tr>
              <th>事件类型</th>
              <th>Chrome 通知</th>
              <th>Telegram</th>
              <th>邮件</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(moduleDefinitions).map(([key, label]) => {
              const prefs = formState.modules[key] ?? { chrome: true, telegram: false, email: false };
              return (
                <tr key={key}>
                  <td>{label}</td>
                  <td>
                    <label className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={prefs.chrome}
                        onChange={(event) => handleModuleToggle(key, 'chrome', event.target.checked)}
                      />
                    </label>
                  </td>
                  <td>
                    <label className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={prefs.telegram}
                        onChange={(event) => handleModuleToggle(key, 'telegram', event.target.checked)}
                      />
                    </label>
                  </td>
                  <td>
                    <label className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={prefs.email}
                        onChange={(event) => handleModuleToggle(key, 'email', event.target.checked)}
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="通知设置"
      size="md"
      headerActions={
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.outlineButton}
            onClick={handleReset}
            disabled={!hasServerData || (!hasChanges && !touched)}
          >
            重置
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? '保存中…' : '保存设置'}
          </button>
        </div>
      }
    >
      <div className={styles.container}>
        <div className={styles.tabList}>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'basic' ? styles.tabButtonActive : ''}`.trim()}
            onClick={() => setActiveTab('basic')}
          >
            基础设置
          </button>
          <button
            type="button"
            className={`${styles.tabButton} ${activeTab === 'modules' ? styles.tabButtonActive : ''}`.trim()}
            onClick={() => setActiveTab('modules')}
          >
            模块通知
          </button>
        </div>
        {loading && !settingsState.data ? (
          <div className={styles.loadingState}>正在加载通知设置…</div>
        ) : null}
        {settingsState.error ? (
          <div className={styles.errorBanner}>{settingsState.error}</div>
        ) : null}
        {!loading || settingsState.data ? (
          <div>{activeTab === 'basic' ? renderBasicTab() : renderModulesTab()}</div>
        ) : null}
      </div>
    </Modal>
  );
}

export default NotificationSettingsModal;
