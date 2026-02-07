import { useEffect, useMemo, useState } from 'react';
import { formatWithTimezone, normalizeTimestampToUtc } from '@utils/timezone';
import Modal from './Modal';
import styles from './RiskRuleDetailModal.module.css';
import type { OrderItem, RiskRuleItem } from '@features/dashboard/types';
import type { RiskEventItem } from '@features/risk/types';
import { useAppSelector } from '@store/hooks';
import { listOrders, OrdersApiError } from '@services/ordersApi';
import {
  fetchRiskRuleEvents,
  mapRiskEvents,
  RiskApiError
} from '@services/riskApi';

interface RiskRuleDetailModalProps {
  open: boolean;
  rule: RiskRuleItem | null;
  onClose: () => void;
}

const formatNumber = (value?: number | null, digits = 2): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(digits);
};

const formatSide = (side: OrderItem['side']): string => {
  return side === 'sell' ? '卖出' : '买入';
};

const STATUS_LABELS: Record<OrderItem['status'], string> = {
  working: '进行中',
  filled: '已成交',
  cancelled: '已撤销',
  rejected: '已拒绝',
  pending: '待提交',
  inactive: '已失效'
};

const formatStatus = (status: OrderItem['status']): string => {
  return STATUS_LABELS[status] ?? status;
};

const formatQuantity = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '—';
  }
  const digits = Math.abs(value) < 1 ? 2 : 0;
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 2)
  });
};

const formatDateTime = (value: string | undefined): string => {
  if (!value) {
    return '—';
  }
  const normalized = normalizeTimestampToUtc(value) ?? value;
  const formatted = formatWithTimezone(
    normalized,
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    },
    'zh-CN',
    'Asia/Shanghai'
  );
  return formatted ?? '—';
};

const resolveEventQuantity = (event: RiskEventItem): number | null => {
  for (const action of event.actions) {
    if (typeof action.quantity === 'number') {
      return action.quantity;
    }
  }
  const metrics = event.metrics;
  if (metrics) {
    const quantityMetric = metrics['quantity'] ?? metrics['size'];
    if (typeof quantityMetric === 'number') {
      return quantityMetric;
    }
    const positionMetric = metrics['position'];
    if (typeof positionMetric === 'number') {
      return Math.abs(positionMetric);
    }
  }
  return null;
};

const classifyClosure = (event: RiskEventItem): string => {
  const message = event.message.toLowerCase();
  if (message.includes('take-profit') || message.includes('take profit') || message.includes('止盈') || message.includes('获利')) {
    return '止盈';
  }
  if (
    message.includes('stop-loss') ||
    message.includes('stop loss') ||
    message.includes('止损') ||
    message.includes('亏损') ||
    message.includes('loss')
  ) {
    return '止损';
  }
  const pnl = event.metrics?.['unrealized_pnl'];
  if (typeof pnl === 'number') {
    if (pnl > 0) {
      return '止盈';
    }
    if (pnl < 0) {
      return '止损';
    }
  }
  return '平仓';
};

const formatMetricValue = (value: number | string | null | undefined): string => {
  if (typeof value === 'number') {
    const digits = Math.abs(value) < 1 ? 3 : 2;
    return value.toLocaleString('en-US', {
      minimumFractionDigits: value % 1 === 0 ? 0 : Math.min(digits, 4),
      maximumFractionDigits: Math.max(digits, 2)
    });
  }
  if (typeof value === 'string') {
    return value;
  }
  return '—';
};

const formatEventMetrics = (
  metrics?: Record<string, number | string | null> | null
): string => {
  if (!metrics) {
    return '—';
  }
  const entries = Object.entries(metrics).filter(([, value]) => value != null && value !== '');
  if (entries.length === 0) {
    return '—';
  }
  return entries
    .map(([key, value]) => `${key}: ${formatMetricValue(value)}`)
    .join(' · ');
};

function RiskRuleDetailModal({ open, rule, onClose }: RiskRuleDetailModalProps) {
  const token = useAppSelector((state) => state.auth.token);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [events, setEvents] = useState<RiskEventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!open || !rule) {
      setOrders([]);
      setOrdersError(null);
      setOrdersLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (!token) {
      setOrders([]);
      setOrdersError('无法获取关联订单：缺少认证信息');
      setOrdersLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setOrdersLoading(true);
    setOrdersError(null);
    void listOrders(token, { ruleId: rule.id, pageSize: 20, source: 'risk' })
      .then((result) => {
        if (cancelled) {
          return;
        }
        setOrders(result.items);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error instanceof OrdersApiError) {
          setOrdersError(error.message);
        } else {
          setOrdersError('加载关联订单失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOrdersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, rule, token]);

  useEffect(() => {
    let cancelled = false;
    if (!open || !rule) {
      setEvents([]);
      setEventsError(null);
      setEventsLoading(false);
      return () => {
        cancelled = true;
      };
    }
    if (!token) {
      setEvents([]);
      setEventsError('无法获取触发记录：缺少认证信息');
      setEventsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setEventsLoading(true);
    setEventsError(null);
    void fetchRiskRuleEvents(token, rule.id, { limit: 20, action: 'close_position' })
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setEvents(mapRiskEvents(payload.items).slice(0, 20));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        if (error instanceof RiskApiError) {
          setEventsError(error.message);
        } else {
          setEventsError('加载触发记录失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setEventsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, rule, token]);

  const closureBadge = useMemo(() => {
    if (!rule) {
      return null;
    }
    const count = rule.metrics?.actions?.close_position ?? 0;
    return (
      <span className={styles.badge} title="近期期内强制平仓次数">
        平仓 {count}
      </span>
    );
  }, [rule]);

  const formatEventSize = (event: RiskEventItem): string => {
    const quantity = resolveEventQuantity(event);
    if (quantity == null) {
      return '—';
    }
    return formatQuantity(quantity);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={rule ? `风险规则详情 · ${rule.symbol ?? '全局'}` : '风险规则详情'}
      subtitle="核查风控规则的阈值、仓位限制与最近触发情况"
      size="md"
      headerActions={closureBadge}
    >
      {rule ? (
        <>
          <div className={styles.grid}>
            <div className={styles.card}>
              <span className={styles.label}>状态</span>
              <span className={styles.value}>{rule.enabled ? '启用' : '停用'}</span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>类型</span>
              <span className={styles.value}>
                {rule.type === 'atr_trailing'
                  ? 'ATR 跟踪'
                  : rule.type === 'trailing'
                    ? '跟踪'
                    : '固定'}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>止损偏移</span>
              <span className={styles.value}>{formatNumber(rule.stopLossOffset)}</span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>止盈偏移</span>
              <span className={styles.value}>{formatNumber(rule.takeProfitOffset)}</span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>跟踪距离</span>
              <span className={styles.value}>
                {rule.type === 'trailing' || rule.type === 'atr_trailing'
                  ? formatNumber(rule.trailingDistance)
                  : '—'}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>跟踪百分比</span>
              <span className={styles.value}>
                {rule.type === 'trailing' || rule.type === 'atr_trailing'
                  ? formatNumber(rule.trailingPercent, 3)
                  : '—'}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>ATR 倍数</span>
              <span className={styles.value}>
                {rule.type === 'atr_trailing' ? formatNumber(rule.atrMultiplier) : '—'}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>仓位限制</span>
              <span className={styles.value}>
                {rule.positionLimit
                  ? [
                      rule.positionLimit.maxNet != null ? `净 ${rule.positionLimit.maxNet}` : null,
                      rule.positionLimit.maxLong != null ? `多 ${rule.positionLimit.maxLong}` : null,
                      rule.positionLimit.maxShort != null ? `空 ${rule.positionLimit.maxShort}` : null
                    ]
                      .filter(Boolean)
                      .join(' / ') || '—'
                  : '—'}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>最新事件</span>
              <span className={styles.value}>
                {rule.metrics?.lastEventAt ? formatDateTime(rule.metrics.lastEventAt) : '—'}
              </span>
            </div>
            <div className={styles.card}>
              <span className={styles.label}>事件计数</span>
              <span className={styles.value}>{rule.metrics?.events ?? 0}</span>
            </div>
          </div>
          {rule.notes ? <div className={styles.notes}>{rule.notes}</div> : null}
          <section className={styles.eventsSection}>
            <div className={styles.eventsHeader}>
              <h4 className={styles.eventsTitle}>触发记录</h4>
              {eventsLoading ? <span className={styles.eventsStatus}>加载中…</span> : null}
            </div>
            {eventsError ? <div className={styles.error}>{eventsError}</div> : null}
            {!eventsLoading && !eventsError && events.length === 0 ? (
              <div className={styles.eventsEmpty}>近期未触发平仓事件</div>
            ) : null}
            {!eventsError && events.length > 0 ? (
              <div className={styles.eventsTableWrapper}>
                <table className={styles.eventsTable}>
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>动作</th>
                      <th>数量</th>
                      <th>指标</th>
                      <th>消息</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((event) => (
                      <tr key={event.id}>
                        <td>{formatDateTime(event.createdAt)}</td>
                        <td>
                          <span className={styles.eventAction}>{classifyClosure(event)}</span>
                        </td>
                        <td>{formatEventSize(event)}</td>
                        <td>{formatEventMetrics(event.metrics)}</td>
                        <td className={styles.eventMessage}>{event.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section className={styles.ordersSection}>
            <div className={styles.ordersHeader}>
              <h4 className={styles.ordersTitle}>关联订单</h4>
              {ordersLoading ? <span className={styles.ordersStatus}>加载中…</span> : null}
            </div>
            {ordersError ? <div className={styles.error}>{ordersError}</div> : null}
            {!ordersLoading && !ordersError && orders.length === 0 ? (
              <div className={styles.ordersEmpty}>暂无关联订单记录</div>
            ) : null}
            {!ordersError && orders.length > 0 ? (
              <div className={styles.ordersTableWrapper}>
                <table className={styles.ordersTable}>
                  <thead>
                    <tr>
                      <th>订单号</th>
                      <th>方向</th>
                      <th>数量</th>
                      <th>价格</th>
                      <th>状态</th>
                      <th>更新时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={`${order.id}-${order.updatedAt}`}>
                        <td>{order.id}</td>
                        <td>{formatSide(order.side)}</td>
                        <td>{formatQuantity(order.quantity)}</td>
                        <td>{formatNumber(order.price ?? null)}</td>
                        <td>{formatStatus(order.status)}</td>
                        <td>{formatDateTime(order.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </Modal>
  );
}

export default RiskRuleDetailModal;
