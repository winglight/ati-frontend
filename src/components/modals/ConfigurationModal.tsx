import { useEffect, useState } from 'react';
import Modal from './Modal';
import styles from './ConfigurationModal.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { loadServiceStatuses, loadSystemInfo } from '@store/thunks/system';
import { useTranslation } from '@i18n';
import type { GlobalRiskSettingsPayload } from '@services/riskApi';
import { fetchGlobalRiskSettings, saveGlobalRiskSettings } from '@services/riskApi';

interface ConfigurationModalProps {
  open: boolean;
  onClose: () => void;
}

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
};

// 已移除服务状态面板，状态文案函数不再需要

function ConfigurationModal({ open, onClose }: ConfigurationModalProps) {
  const dispatch = useAppDispatch();
  const systemState = useAppSelector((state) => state.system);
  const { info, infoStatus, servicesStatus, infoUpdatedAt, servicesUpdatedAt } = systemState;
  const token = useAppSelector((s) => s.auth.token);
  const { t } = useTranslation();

  const [globalRiskLoading, setGlobalRiskLoading] = useState(false);
  const [globalRiskSaving, setGlobalRiskSaving] = useState(false);
  const [globalRiskForm, setGlobalRiskForm] = useState<GlobalRiskSettingsPayload>({
    max_drawdown_ratio: 0.05,
    max_loss_streak_trades: 3,
    consecutive_loss_days_threshold: 2,
    halt_duration_days: 1
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    if (infoStatus === 'idle') {
      void dispatch(loadSystemInfo());
    }
    if (servicesStatus === 'idle') {
      void dispatch(loadServiceStatuses());
    }
    if (token) {
      setGlobalRiskLoading(true);
      fetchGlobalRiskSettings(token)
        .then((settings) => setGlobalRiskForm(settings))
        .catch(() => {})
        .finally(() => setGlobalRiskLoading(false));
    }
  }, [dispatch, infoStatus, servicesStatus, open, token]);

  // 左侧操作与服务状态面板已移除，此处无需刷新按钮状态

  const infoItems = [
    { label: t('settings.info.name'), value: info?.name ?? '—' },
    { label: t('settings.info.version'), value: info?.version ?? '—' },
    { label: t('settings.info.debug'), value: info?.debug ? t('common.on') : t('common.off') },
    {
      label: t('settings.info.openapi'),
      value: info?.openapiUrl ? (
        <a className={styles.link} href={info.openapiUrl} target="_blank" rel="noreferrer">
          {info.openapiUrl}
        </a>
      ) : (
        '—'
      )
    },
    {
      label: t('settings.info.swagger'),
      value: info?.docsUrl ? (
        <a className={styles.link} href={info.docsUrl} target="_blank" rel="noreferrer">
          {info.docsUrl}
        </a>
      ) : (
        '—'
      )
    },
    {
      label: t('settings.info.redoc'),
      value: info?.redocUrl ? (
        <a className={styles.link} href={info.redocUrl} target="_blank" rel="noreferrer">
          {info.redocUrl}
        </a>
      ) : (
        '—'
      )
    },
    { label: t('settings.info.last_updated'), value: formatTimestamp(infoUpdatedAt ?? info?.timestamp ?? null) }
  ];

  const updateGlobalRisk = (patch: Partial<GlobalRiskSettingsPayload>) => {
    setGlobalRiskForm((prev) => ({ ...prev, ...patch }));
  };

  const saveGlobalRisk = async () => {
    if (!token) return;
    setGlobalRiskSaving(true);
    try {
      const saved = await saveGlobalRiskSettings(token, globalRiskForm);
      setGlobalRiskForm(saved);
    } finally {
      setGlobalRiskSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.configuration.title')}
      subtitle={t('modals.configuration.subtitle')}
      size="lg"
    >
      <div className={styles.container}>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>{t('modals.configuration.system.title')}</div>
          <div className={styles.sectionSubtitle}>
            {t('modals.configuration.system.last_refresh_prefix')}{formatTimestamp(infoUpdatedAt ?? null)} · {t('modals.configuration.system.services_refresh_prefix')}{formatTimestamp(servicesUpdatedAt ?? null)}
          </div>
          <div className={styles.infoGrid}>
            {infoItems.map((item) => (
              <div key={item.label} className={styles.infoCard}>
                <span className={styles.infoLabel}>{item.label}</span>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <div className={styles.sectionTitle}>全局风控设置</div>
          <div className={styles.sectionSubtitle}>账户级交易熔断配置（当日停止与全局暂停）</div>
          <div className={styles.infoGrid}>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>账户最大回撤比例 (%)</span>
              <input
                type="number"
                min={0}
                step={0.01}
                disabled={globalRiskLoading || globalRiskSaving}
                value={globalRiskForm.max_drawdown_ratio * 100}
                onChange={(e) => updateGlobalRisk({ max_drawdown_ratio: Math.max(0, Number(e.target.value)) / 100 })}
              />
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>连续亏损数量 (笔)</span>
              <input
                type="number"
                min={1}
                step={1}
                disabled={globalRiskLoading || globalRiskSaving}
                value={globalRiskForm.max_loss_streak_trades}
                onChange={(e) => updateGlobalRisk({ max_loss_streak_trades: Math.max(1, Math.floor(Number(e.target.value))) })}
              />
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>连续亏损天数 (天)</span>
              <input
                type="number"
                min={1}
                step={1}
                disabled={globalRiskLoading || globalRiskSaving}
                value={globalRiskForm.consecutive_loss_days_threshold}
                onChange={(e) => updateGlobalRisk({ consecutive_loss_days_threshold: Math.max(1, Math.floor(Number(e.target.value))) })}
              />
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>停止交易时长 (天)</span>
              <input
                type="number"
                min={1}
                step={1}
                disabled={globalRiskLoading || globalRiskSaving}
                value={globalRiskForm.halt_duration_days}
                onChange={(e) => updateGlobalRisk({ halt_duration_days: Math.max(1, Math.floor(Number(e.target.value))) })}
              />
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>单笔最大允许亏损 (Hard Cap)</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="不限制"
                disabled={globalRiskLoading || globalRiskSaving}
                value={globalRiskForm.single_trade_max_loss ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateGlobalRisk({ single_trade_max_loss: val ? Number(val) : null });
                }}
              />
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>日内最大亏损停手 (金额)</span>
              <input
                type="number"
                min={0}
                step={1}
                placeholder="不限制"
                disabled={globalRiskLoading || globalRiskSaving}
                value={globalRiskForm.daily_max_loss ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  updateGlobalRisk({ daily_max_loss: val ? Number(val) : null });
                }}
              />
            </div>
            <div className={styles.infoCard}>
              <span className={styles.infoLabel}>周末/例行停盘前强制平仓</span>
              <input
                type="checkbox"
                disabled={globalRiskLoading || globalRiskSaving}
                checked={globalRiskForm.weekend_force_close ?? false}
                onChange={(e) => updateGlobalRisk({ weekend_force_close: e.target.checked })}
              />
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.actionButton} disabled={globalRiskSaving} onClick={saveGlobalRisk}>保存</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ConfigurationModal;
