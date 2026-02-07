import { useEffect, useState } from 'react';
import styles from './ConfigurationModal.module.css';
import Modal from './Modal';
import type { GlobalRiskSettingsPayload } from '@services/riskApi';
import { fetchGlobalRiskSettings, saveGlobalRiskSettings } from '@services/riskApi';
import { useAppSelector } from '@store/hooks';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: (settings: GlobalRiskSettingsPayload) => void;
}

export const GlobalRiskSettingsModal = ({ open, onClose, onSaved }: Props) => {
  const token = useAppSelector((s) => s.auth.token);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<GlobalRiskSettingsPayload>({
    max_drawdown_ratio: 0.05,
    max_loss_streak_trades: 3,
    consecutive_loss_days_threshold: 2,
    halt_duration_days: 1
  });

  useEffect(() => {
    if (!open || !token) return;
    setLoading(true);
    fetchGlobalRiskSettings(token)
      .then((settings) => setForm(settings))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, token]);

  const update = (patch: Partial<GlobalRiskSettingsPayload>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const submit = async () => {
    if (!token) return;
    setSaving(true);
    try {
      const saved = await saveGlobalRiskSettings(token, form);
      onSaved?.(saved);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="全局风控设置">
      <div className={styles.container}>
        <div>
          <label>账户最大回撤比例 (%)</label>
          <input
            type="number"
            min={0}
            step={0.01}
            disabled={loading || saving}
            value={form.max_drawdown_ratio * 100}
            onChange={(e) => update({ max_drawdown_ratio: Math.max(0, Number(e.target.value)) / 100 })}
          />
        </div>
        <div>
          <label>连续亏损数量 (笔)</label>
          <input
            type="number"
            min={1}
            step={1}
            disabled={loading || saving}
            value={form.max_loss_streak_trades}
            onChange={(e) => update({ max_loss_streak_trades: Math.max(1, Math.floor(Number(e.target.value))) })}
          />
        </div>
        <div>
          <label>连续亏损天数 (天)</label>
          <input
            type="number"
            min={1}
            step={1}
            disabled={loading || saving}
            value={form.consecutive_loss_days_threshold}
            onChange={(e) => update({ consecutive_loss_days_threshold: Math.max(1, Math.floor(Number(e.target.value))) })}
          />
        </div>
        <div>
          <label>停止交易时长 (天)</label>
          <input
            type="number"
            min={1}
            step={1}
            disabled={loading || saving}
            value={form.halt_duration_days}
            onChange={(e) => update({ halt_duration_days: Math.max(1, Math.floor(Number(e.target.value))) })}
          />
        </div>
        <div>
          <label>单笔最大允许亏损 (Hard Cap)</label>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="不限制"
            disabled={loading || saving}
            value={form.single_trade_max_loss ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              update({ single_trade_max_loss: val ? Number(val) : null });
            }}
          />
        </div>
        <div>
          <label>日内最大亏损停手 (金额)</label>
          <input
            type="number"
            min={0}
            step={1}
            placeholder="不限制"
            disabled={loading || saving}
            value={form.daily_max_loss ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              update({ daily_max_loss: val ? Number(val) : null });
            }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            type="checkbox"
            id="weekend_close"
            disabled={loading || saving}
            checked={form.weekend_force_close ?? false}
            onChange={(e) => update({ weekend_force_close: e.target.checked })}
          />
          <label htmlFor="weekend_close" style={{ marginBottom: 0 }}>周末/例行停盘前强制平仓</label>
        </div>
        <div className={styles.actions}>
          <button className={styles.actionButton} disabled={saving} onClick={submit}>保存</button>
          <button className={styles.actionButton} disabled={saving} onClick={onClose}>取消</button>
        </div>
      </div>
    </Modal>
  );
};

export default GlobalRiskSettingsModal;
