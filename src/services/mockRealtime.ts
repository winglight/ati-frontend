import { dashboardMockData } from '@features/dashboard/data';
import type { NotificationItem } from '@features/dashboard/types';
import type { AppDispatch, RootState } from '@store/index';
import { updateAccountSummary, updatePositionPricing } from '@store/slices/accountSlice';
import { updateDepthSnapshot } from '@store/slices/marketSlice';
import { pushNotification } from '@store/slices/notificationsSlice';
import { updateOrder } from '@store/slices/ordersSlice';
import { setConnectionStatus, setHeartbeat } from '@store/slices/realtimeSlice';
import { updateStrategyStatus } from '@store/slices/strategiesSlice';

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

const nextNotification = (): NotificationItem => {
  const severities: NotificationItem['severity'][] = ['info', 'warning', 'error'];
  const severity = severities[Math.floor(Math.random() * severities.length)];
  const now = new Date();
  const baseTitle =
    severity === 'info'
      ? '状态更新'
      : severity === 'warning'
        ? '风险提醒'
        : '异常告警';
  const messageVariants: Record<NotificationItem['severity'], string[]> = {
    info: [
      '策略回测已完成并生成新的参数建议。',
      '系统已同步最新的交易日历。'
    ],
    warning: [
      '账户可用资金低于预设阈值，请关注仓位变化。',
      '最新行情波动剧烈，请检查风险敞口。'
    ],
    error: [
      '行情源暂时中断，正在尝试重连。',
      '订单通道出现异常响应，已自动降级为手动确认。'
    ]
  };

  const messageOptions = messageVariants[severity];
  const message = messageOptions[Math.floor(Math.random() * messageOptions.length)];

  return {
    id: `ntf-${now.getTime()}`,
    severity,
    title: baseTitle,
    message,
    timestamp: now.toISOString()
  };
};

export class MockRealtimeClient {
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private intervals: ReturnType<typeof setInterval>[] = [];

  constructor(private readonly dispatch: AppDispatch, private readonly getState: () => RootState) {}

  connect() {
    this.dispatch(setConnectionStatus({ channel: 'mock', status: 'connecting' }));
    this.connectionTimeout = setTimeout(() => {
      this.dispatch(setConnectionStatus({ channel: 'mock', status: 'connected' }));
      this.dispatch(
        setHeartbeat({
          channel: 'mock',
          timestamp: new Date().toISOString(),
          latencyMs: randomBetween(20, 80)
        })
      );
      this.startStreams();
    }, 380);
  }

  disconnect() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    this.intervals.forEach((intervalId) => clearInterval(intervalId));
    this.intervals = [];
    this.dispatch(setConnectionStatus({ channel: 'mock', status: 'disconnected' }));
  }

  private startStreams() {
    this.intervals.push(setInterval(() => this.emitAccountSnapshot(), 6000));
    this.intervals.push(setInterval(() => this.emitOrderUpdate(), 7500));
    this.intervals.push(setInterval(() => this.emitDepthUpdate(), 4500));
    this.intervals.push(setInterval(() => this.emitStrategyUpdate(), 12000));
    this.intervals.push(setInterval(() => this.emitNotification(), 15000));
  }

  private emitAccountSnapshot() {
    const state = this.getState();
    const summary = state.account.summary;
    if (!summary) {
      return;
    }

    const delta = randomBetween(-1500, 2200);
    const equity = Number((summary.equity + delta).toFixed(2));
    const realizedDelta = delta * 0.35;
    const updatedSummary = {
      pnlRealized: Number((summary.pnlRealized + realizedDelta).toFixed(2)),
      pnlUnrealized: Number((summary.pnlUnrealized + (delta - realizedDelta)).toFixed(2)),
      pnlRealizedToday:
        summary.pnlRealizedToday == null
          ? undefined
          : Number((summary.pnlRealizedToday + realizedDelta).toFixed(2)),
      equity,
      marginRatio: equity > 0 ? Number((summary.marginUsed / equity).toFixed(4)) : 0,
      updatedAt: new Date().toISOString()
    } satisfies Partial<typeof summary>;

    this.dispatch(updateAccountSummary(updatedSummary));

    if (state.account.positions.length) {
      const index = Math.floor(Math.random() * state.account.positions.length);
      const position = state.account.positions[index];
      const markDrift = randomBetween(-0.6, 0.9);
      const basePrice =
        position.markPrice == null || Number.isNaN(position.markPrice)
          ? position.avgPrice
          : position.markPrice;
      const nextPrice = Number((basePrice + markDrift).toFixed(2));
      this.dispatch(updatePositionPricing({ symbol: position.symbol, price: nextPrice }));
    }

    this.dispatch(
      setHeartbeat({
        channel: 'mock',
        timestamp: new Date().toISOString(),
        latencyMs: randomBetween(20, 80)
      })
    );
  }

  private emitOrderUpdate() {
    const state = this.getState();
    if (!state.orders.items.length) {
      return;
    }
    const index = Math.floor(Math.random() * state.orders.items.length);
    const target = state.orders.items[index];
    if (target.status === 'filled' || target.status === 'cancelled' || target.status === 'rejected') {
      return;
    }

    const progress = Math.min(target.quantity, Math.max(target.filled, Math.round(target.quantity * randomBetween(0.2, 0.65))));
    const isFilled = progress >= target.quantity;

    this.dispatch(
      updateOrder({
        id: target.id,
        changes: {
          filled: progress,
          status: isFilled ? 'filled' : 'working',
          updatedAt: new Date().toISOString()
        }
      })
    );

    if (isFilled) {
      const notification: NotificationItem = {
        id: `ord-${target.id}-${Date.now()}`,
        severity: 'info',
        title: '订单成交',
        message: `${target.symbol} ${target.side === 'buy' ? '买入' : '卖出'} ${target.quantity} 手已成交。`,
        timestamp: new Date().toISOString(),
        read: false
      };
      this.dispatch(pushNotification(notification));
    }
  }

  private emitDepthUpdate() {
    const state = this.getState();
    const depth = state.market.depth ?? dashboardMockData.depth;
    const symbol =
      depth.symbol ??
      state.market.selectedSymbol ??
      dashboardMockData.selectedSymbol ??
      state.account.positions[0]?.symbol ??
      null;
    const nextDepth = {
      bids: depth.bids.map((bid) => ({
        price: Number((bid.price + randomBetween(-0.05, 0.05)).toFixed(2)),
        size: Math.max(50, Math.round(bid.size * randomBetween(0.9, 1.1)))
      })),
      asks: depth.asks.map((ask) => ({
        price: Number((ask.price + randomBetween(-0.05, 0.05)).toFixed(2)),
        size: Math.max(50, Math.round(ask.size * randomBetween(0.9, 1.1)))
      }))
    };

    const bestBid = nextDepth.bids[0]?.price ?? null;
    const bestAsk = nextDepth.asks[0]?.price ?? null;
    const derivedMid =
      bestBid != null && bestAsk != null
        ? Number(((bestBid + bestAsk) / 2).toFixed(4))
        : bestBid ?? bestAsk ?? null;
    const midPrice = derivedMid ?? depth.midPrice ?? null;
    const spread =
      bestBid != null && bestAsk != null
        ? Number((bestAsk - bestBid).toFixed(4))
        : depth.spread ?? null;

    this.dispatch(
      updateDepthSnapshot({
        ...nextDepth,
        symbol: symbol ?? undefined,
        midPrice,
        spread,
        updatedAt: new Date().toISOString()
      })
    );
    if (symbol && midPrice != null) {
      this.dispatch(updatePositionPricing({ symbol, price: midPrice }));
    }
    this.dispatch(
      setHeartbeat({
        channel: 'mock',
        timestamp: new Date().toISOString(),
        latencyMs: randomBetween(18, 60)
      })
    );
  }

  private emitStrategyUpdate() {
    const state = this.getState();
    if (!state.strategies.items.length) {
      return;
    }

    const index = Math.floor(Math.random() * state.strategies.items.length);
    const strategy = state.strategies.items[index];
    const drift = randomBetween(-0.03, 0.05);

    this.dispatch(
      updateStrategyStatus({
        id: strategy.id,
        changes: {
          returnRate: Number((strategy.returnRate + drift).toFixed(4)),
          lastSignal: `AUTO @ ${new Date().toLocaleTimeString()}`
        }
      })
    );
  }

  private emitNotification() {
    const notification = { ...nextNotification(), read: false };
    this.dispatch(pushNotification(notification));
  }
}
