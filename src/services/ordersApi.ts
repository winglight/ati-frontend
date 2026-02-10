import type { OrderItem } from '@features/dashboard/types';
import { resolveRequestUrl } from './config.js';

export interface OrderRecordPayload {
  id?: number | string;
  order_id?: number | string | null;
  client_order_id?: number | string | null;
  ib_order_id?: number | string | null;
  symbol?: string | null;
  side?: string | null;
  status?: string | null;
  quantity?: number | string | null;
  filled_quantity?: number | string | null;
  filled?: number | string | null;
  order_type?: string | null;
  type?: string | null;
  price?: number | string | null;
  limit_price?: number | string | null;
  stop_price?: number | string | null;
  commission?: number | string | null;
  pnl?: number | string | null;
  realized_pnl?: number | string | null;
  unrealized_pnl?: number | string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  timestamp?: string | null;
  order_source?: string | null;
  source?: string | null;
  strategy?: string | null;
  strategy_name?: string | null;
  rule_id?: string | null;
  metadata?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface OrderEventPayload extends OrderRecordPayload {
  status_changed?: boolean | null;
  remaining_quantity?: number | string | null;
  fill_delta?: number | string | null;
  last_fill_price?: number | string | null;
  last_fill_quantity?: number | string | null;
}

export interface OrderListResponsePayload {
  items?: OrderRecordPayload[] | null;
  total?: number | null;
  page?: number | null;
  page_size?: number | null;
  has_next?: boolean | null;
}

export interface OrderListParams {
  page?: number;
  pageSize?: number;
  symbol?: string;
  status?: string[];
  strategy?: string;
  source?: string;
  account?: string;
  start?: string;
  end?: string;
  includeDeleted?: boolean;
  ruleId?: string;
}

export interface OrderListResult {
  items: OrderItem[];
  total: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}

interface OrderResponsePayload {
  order?: OrderRecordPayload | null;
}

export interface CreateOrderRequest {
  symbol: string;
  secType?: string | null;
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop';
  quantity: number;
  price?: number | null;
  stopPrice?: number | null;
  timeInForce?: string | null;
  destination?: string | null;
  transmit?: boolean;
  tag?: string | null;
  comment?: string | null;
}

export interface CancelAllOrdersResponse {
  [key: string]: unknown;
}

export interface SyncOrdersResponsePayload {
  accepted?: boolean | null;
  job_id?: string | null;
  started?: boolean | null;
  status?: string | null;
  received_at?: string | null;
}

export interface SyncOrdersResult {
  accepted: boolean;
  jobId: string;
  started: boolean;
  status: string;
  receivedAt: string;
}

export class OrdersApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'OrdersApiError';
  }
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {},
  options: { errorMessage?: string } = {}
): Promise<T> => {
  const url = resolveRequestUrl(path);
  const headers: HeadersInit = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    ...(init.headers ?? {})
  };
  if (init.body && !(headers as Record<string, string>)['Content-Type']) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401) {
    throw new OrdersApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = options.errorMessage ?? '获取订单列表失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      void _error;
    }
    throw new OrdersApiError(detail, response.status);
  }

  try {
    return (await response.json()) as T;
  } catch (_error) {
    throw new OrdersApiError('解析订单服务响应失败', response.status);
  }
};

const toNumber = (value: unknown): number => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const toNullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const normalizeSide = (value: string | null | undefined): OrderItem['side'] => {
  const normalized = value?.toString().trim().toLowerCase();
  if (normalized === 'buy' || normalized === 'b' || normalized === 'long') {
    return 'buy';
  }
  if (normalized === 'sell' || normalized === 's' || normalized === 'short') {
    return 'sell';
  }
  return 'buy';
};

const normalizeType = (value: string | null | undefined): OrderItem['type'] => {
  const normalized = value?.toString().trim().toLowerCase();
  if (!normalized) {
    return 'limit';
  }
  if (normalized === 'mkt' || normalized.includes('market')) {
    return 'market';
  }
  if (normalized === 'stp' || normalized.includes('stop')) {
    return 'stop';
  }
  if (normalized === 'lmt' || normalized.includes('limit')) {
    return 'limit';
  }
  return 'limit';
};

const normalizeStatusKey = (value: string): string => value.replace(/[\s_-]+/g, '').toLowerCase();

const STATUS_LOOKUP: Record<string, OrderItem['status']> = {
  filled: 'filled',
  executed: 'filled',
  done: 'filled',
  completed: 'filled',
  complete: 'filled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  cancelledunfilled: 'cancelled',
  canceledunfilled: 'cancelled',
  cancelledfilled: 'cancelled',
  canceledfilled: 'cancelled',
  cancelledpartial: 'cancelled',
  canceledpartial: 'cancelled',
  apicancelled: 'cancelled',
  pendingcancel: 'cancelled',
  pendingcxl: 'cancelled',
  cancelsubmitted: 'cancelled',
  rejected: 'rejected',
  decline: 'rejected',
  declined: 'rejected',
  pending: 'pending',
  pendingnew: 'pending',
  pendingsubmit: 'pending',
  submitted: 'working',
  presubmitted: 'working',
  working: 'working',
  live: 'working',
  open: 'working',
  inactive: 'inactive'
};

const STATUS_PATTERNS: Array<[RegExp, OrderItem['status']]> = [
  [/inactive/, 'inactive'],
  [/pendingcancel|cancelsubmit|apicancel/, 'cancelled'],
  [/(cancel|cxl)/, 'cancelled'],
  [/(reject|declin)/, 'rejected'],
  [/(filled|execut|done|complete)/, 'filled'],
  [/pending|queue|hold/, 'pending'],
  [/(submit|work|live|open)/, 'working']
];

const normalizeStatus = (value: string | null | undefined): OrderItem['status'] => {
  if (value === null || value === undefined) {
    return 'working';
  }
  const text = value.toString().trim();
  if (!text) {
    return 'working';
  }

  const canonical = normalizeStatusKey(text);
  if (canonical in STATUS_LOOKUP) {
    return STATUS_LOOKUP[canonical];
  }

  for (const [pattern, status] of STATUS_PATTERNS) {
    if (pattern.test(canonical)) {
      return status;
    }
  }

  return 'working';
};

const extractRawStatus = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const resolveSource = (payload: OrderRecordPayload): string => {
  const normalize = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const text = value.trim();
    return text.length > 0 ? text : null;
  };

  const explicitSource = normalize(payload.source);
  if (explicitSource) {
    return explicitSource;
  }

  const metadataSource =
    typeof payload.metadata === 'object' && payload.metadata
      ? normalize((payload.metadata as Record<string, unknown>).source)
      : null;
  if (metadataSource) {
    return metadataSource;
  }

  const orderSource = normalize(payload.order_source);
  if (orderSource) {
    return orderSource;
  }

  const strategyName = normalize(payload.strategy_name);
  if (strategyName) {
    return strategyName;
  }
  const strategy = normalize(payload.strategy);
  if (strategy) {
    return strategy;
  }

  return '—';
};

const resolveTimestamp = (payload: OrderRecordPayload): string => {
  const candidates = [payload.timestamp, payload.updated_at, payload.created_at];
  for (const entry of candidates) {
    if (entry && typeof entry === 'string' && entry.trim()) {
      return entry;
    }
  }
  return new Date().toISOString();
};

const resolvePrice = (payload: OrderRecordPayload): number | undefined => {
  const candidates = [payload.price, payload.limit_price, payload.stop_price];
  for (const entry of candidates) {
    if (entry === null || entry === undefined) {
      continue;
    }
    const number = toNumber(entry);
    if (number !== 0 || entry === 0 || entry === '0') {
      return number;
    }
  }
  return undefined;
};

const normalisePayload = (payload: OrderRecordPayload | OrderEventPayload | undefined): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }
  return { ...payload };
};

const mapOrderSideToPayload = (side: CreateOrderRequest['side']): 'BUY' | 'SELL' => {
  return side === 'sell' ? 'SELL' : 'BUY';
};

const mapOrderTypeToPayload = (type: CreateOrderRequest['type']): 'MKT' | 'LMT' | 'STP' => {
  switch (type) {
    case 'market':
      return 'MKT';
    case 'stop':
      return 'STP';
    case 'limit':
    default:
      return 'LMT';
  }
};

const normalizeSecTypeForOrder = (secType?: string | null): string => {
  const text = typeof secType === 'string' ? secType.trim().toUpperCase() : '';
  return text || 'STK';
};

export const mapOrderRecord = (payload: OrderRecordPayload): OrderItem => {
  const recordMap = payload as Record<string, unknown>;
  const quantity = toNumber(payload.quantity);
  const filled = toNumber(payload.filled_quantity ?? payload.filled ?? 0);
  const remaining =
    payload.remaining_quantity !== undefined && payload.remaining_quantity !== null
      ? toNumber(payload.remaining_quantity)
      : Math.max(quantity - filled, 0);
  const fillPriceCandidate =
    recordMap.fill_price ?? recordMap.avg_fill_price ?? recordMap.last_fill_price;
  const commissionCandidate = recordMap.commission;
  const pnlCandidate = recordMap.pnl ?? recordMap.realized_pnl;
  const realizedCandidate = recordMap.realized_pnl;
  const unrealizedCandidate = recordMap.unrealized_pnl;
  const rejectionCandidate = recordMap.rejection_reason;
  const accountCandidate = recordMap.account;
  const exchangeCandidate = recordMap.exchange;
  const secTypeCandidate = recordMap.sec_type;
  const notesCandidate = recordMap.notes;

  const createdAt = typeof payload.created_at === 'string' ? payload.created_at : null;
  const executedAt =
    typeof recordMap.executed_at === 'string' ? (recordMap.executed_at as string) : null;

  let notes: string | null = null;
  if (typeof notesCandidate === 'string') {
    const trimmed = notesCandidate.trim();
    if (trimmed.length) {
      notes = trimmed;
    }
  }

  return {
    id: payload.id !== undefined && payload.id !== null ? String(payload.id) : '—',
    ibOrderId: toNullableString(payload.ib_order_id),
    clientOrderId: toNullableString(payload.client_order_id),
    symbol: payload.symbol ?? '—',
    side: normalizeSide(payload.side),
    type: normalizeType(payload.order_type ?? payload.type ?? null),
    quantity,
    filled,
    remaining,
    price: resolvePrice(payload),
    limitPrice: toNullableNumber(payload.limit_price),
    stopPrice: toNullableNumber(payload.stop_price),
    fillPrice: toNullableNumber(fillPriceCandidate),
    status: normalizeStatus(payload.status),
    rawStatus: extractRawStatus(payload.status),
    source: resolveSource(payload),
    updatedAt: resolveTimestamp(payload),
    createdAt,
    executedAt,
    account: toNullableString(accountCandidate),
    exchange: toNullableString(exchangeCandidate),
    secType: toNullableString(secTypeCandidate),
    commission: (() => {
      const v = toNullableNumber(commissionCandidate);
      return v === null || v === undefined ? v : -Math.abs(v);
    })(),
    pnl: toNullableNumber(pnlCandidate),
    realizedPnl: toNullableNumber(realizedCandidate),
    unrealizedPnl: toNullableNumber(unrealizedCandidate),
    rejectionReason: toNullableString(rejectionCandidate),
    strategy: toNullableString(payload.strategy),
    strategyName: toNullableString(payload.strategy_name),
    parentOrderId: toNullableString(payload.parent_order_id),
    ruleId: payload.rule_id ?? null,
    notes,
    orderSource: toNullableString(payload.order_source),
    raw: normalisePayload(payload)
  };
};

const resolveIdentifier = (payload: OrderEventPayload): string | null => {
  const candidates = [payload.id, payload.order_id, payload.client_order_id, payload.ib_order_id];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const text = String(candidate).trim();
    if (text) {
      return text;
    }
  }
  return null;
};

export const mapOrderEventToChanges = (
  payload: OrderEventPayload
): { id: string; changes: Partial<OrderItem> } | null => {
  const identifier = resolveIdentifier(payload);
  if (!identifier) {
    return null;
  }

  const changes: Partial<OrderItem> = {};
  const recordMap = payload as Record<string, unknown>;

  if (payload.symbol !== undefined && payload.symbol !== null) {
    changes.symbol = String(payload.symbol);
  }
  if (payload.side !== undefined) {
    changes.side = normalizeSide(payload.side);
  }
  const typeSource = payload.order_type ?? payload.type ?? null;
  if (typeSource !== null && typeSource !== undefined) {
    changes.type = normalizeType(typeSource);
  }
  // order_id presence is handled by resolveIdentifier; no direct field mapping required
  if (payload.ib_order_id !== undefined) {
    changes.ibOrderId = toNullableString(payload.ib_order_id);
  }
  if (payload.client_order_id !== undefined) {
    changes.clientOrderId = toNullableString(payload.client_order_id);
  }
  if (payload.order_source !== undefined) {
    changes.orderSource = toNullableString(payload.order_source);
  }
  if (payload.strategy_name !== undefined) {
    changes.strategyName = toNullableString(payload.strategy_name);
  }
  if (payload.strategy !== undefined) {
    changes.strategy = toNullableString(payload.strategy);
  }
  if (payload.rule_id !== undefined) {
    changes.ruleId = toNullableString(payload.rule_id);
  }
  if (payload.quantity !== undefined && payload.quantity !== null) {
    changes.quantity = toNumber(payload.quantity);
  }
  if (payload.filled_quantity !== undefined || payload.filled !== undefined) {
    const filledValue = payload.filled_quantity ?? payload.filled ?? 0;
    changes.filled = toNumber(filledValue);
  }
  if (payload.remaining_quantity !== undefined && payload.remaining_quantity !== null) {
    changes.remaining = toNumber(payload.remaining_quantity);
  } else if (changes.quantity !== undefined && changes.filled !== undefined) {
    changes.remaining = Math.max(changes.quantity - changes.filled, 0);
  }
  if (payload.status !== undefined && payload.status !== null) {
    changes.status = normalizeStatus(payload.status);
    changes.rawStatus = extractRawStatus(payload.status);
  }
  const price = resolvePrice(payload);
  if (price !== undefined) {
    changes.price = price;
  }
  if (payload.limit_price !== undefined) {
    changes.limitPrice = toNullableNumber(payload.limit_price);
  }
  if (payload.stop_price !== undefined) {
    changes.stopPrice = toNullableNumber(payload.stop_price);
  }
  if (
    recordMap.fill_price !== undefined ||
    recordMap.avg_fill_price !== undefined ||
    payload.last_fill_price !== undefined
  ) {
    const fillPriceCandidate =
      recordMap.fill_price ?? recordMap.avg_fill_price ?? payload.last_fill_price;
    changes.fillPrice = toNullableNumber(fillPriceCandidate);
  }
  if (
    payload.order_source !== undefined ||
    payload.source !== undefined ||
    payload.strategy_name !== undefined ||
    payload.strategy !== undefined ||
    payload.metadata !== undefined
  ) {
    changes.source = resolveSource(payload);
  }
  if (payload.order_source !== undefined) {
    changes.orderSource = toNullableString(payload.order_source);
  }
  if (payload.strategy !== undefined) {
    changes.strategy = toNullableString(payload.strategy);
  }
  if (payload.strategy_name !== undefined) {
    changes.strategyName = toNullableString(payload.strategy_name);
  }
  if (payload.parent_order_id !== undefined) {
    changes.parentOrderId = toNullableString(payload.parent_order_id);
  }
  if (recordMap.account !== undefined) {
    changes.account = toNullableString(recordMap.account);
  }
  if (recordMap.exchange !== undefined) {
    changes.exchange = toNullableString(recordMap.exchange);
  }
  if (recordMap.sec_type !== undefined) {
    changes.secType = toNullableString(recordMap.sec_type);
  }
  if (payload.rule_id !== undefined) {
    changes.ruleId = toNullableString(payload.rule_id);
  }
  if (recordMap.notes !== undefined) {
    if (typeof recordMap.notes === 'string') {
      const trimmed = recordMap.notes.trim();
      changes.notes = trimmed.length ? trimmed : null;
    } else {
      changes.notes = null;
    }
  }
  if (payload.timestamp || payload.updated_at || payload.created_at) {
    changes.updatedAt = resolveTimestamp(payload);
  }
  if (payload.created_at !== undefined) {
    changes.createdAt = typeof payload.created_at === 'string' ? payload.created_at : null;
  }
  if (recordMap.executed_at !== undefined) {
    changes.executedAt =
      typeof recordMap.executed_at === 'string' ? (recordMap.executed_at as string) : null;
  }
  if (payload.commission !== undefined) {
    const v = toNullableNumber(payload.commission);
    changes.commission = v === null || v === undefined ? v : -Math.abs(v);
  }
  if (payload.pnl !== undefined || recordMap.realized_pnl !== undefined) {
    const pnlCandidate = payload.pnl ?? recordMap.realized_pnl;
    changes.pnl = toNullableNumber(pnlCandidate);
  }
  if (recordMap.realized_pnl !== undefined) {
    changes.realizedPnl = toNullableNumber(recordMap.realized_pnl);
  }
  if (recordMap.unrealized_pnl !== undefined) {
    changes.unrealizedPnl = toNullableNumber(recordMap.unrealized_pnl);
  }
  if (recordMap.rejection_reason !== undefined) {
    changes.rejectionReason = toNullableString(recordMap.rejection_reason);
  }
  if (payload.fill_delta !== undefined) {
    // ensure filled value stays in sync when IB reports incremental fills only
    const delta = toNumber(payload.fill_delta);
    if (delta > 0 && changes.filled === undefined) {
      changes.filled = delta;
    }
  }
  if (Object.keys(recordMap).length) {
    changes.raw = normalisePayload(payload);
  }

  return { id: identifier, changes };
};

export const listOrders = async (
  token: string,
  params: OrderListParams = {}
): Promise<OrderListResult> => {
  const searchParams = new URLSearchParams();
  if (params.page) {
    searchParams.set('page', params.page.toString());
  }
  if (params.pageSize) {
    searchParams.set('page_size', params.pageSize.toString());
  }
  if (params.symbol) {
    searchParams.set('symbol', params.symbol);
  }
  if (params.status && params.status.length) {
    for (const value of params.status) {
      searchParams.append('status', value);
    }
  }
  if (params.strategy) {
    searchParams.set('strategy', params.strategy);
  }
  if (params.source) {
    searchParams.set('source', params.source);
  }
  if (params.account) {
    searchParams.set('account', params.account);
  }
  if (params.start) {
    searchParams.set('start', params.start);
  }
  if (params.end) {
    searchParams.set('end', params.end);
  }
  if (params.includeDeleted) {
    searchParams.set('include_deleted', 'true');
  }
  if (params.ruleId) {
    searchParams.set('rule_id', params.ruleId);
  }

  const query = searchParams.toString();
  const endpoint = query ? `/orders?${query}` : '/orders';
  const payload = await requestJson<OrderListResponsePayload>(endpoint, token, {
    method: 'GET'
  });

  const items = Array.isArray(payload.items) ? payload.items.map(mapOrderRecord) : [];
  return {
    items,
    total: typeof payload.total === 'number' ? payload.total : items.length,
    page: typeof payload.page === 'number' ? payload.page : 1,
    pageSize: typeof payload.page_size === 'number' ? payload.page_size : items.length,
    hasNext: Boolean(payload.has_next)
  };
};

export const cancelOrder = async (
  token: string,
  orderId: string | number,
  options: { reason?: string; ibOrderId?: string | null; clientOrderId?: string | null } = {}
): Promise<OrderItem> => {
  const isNumericId =
    typeof orderId === 'number' || (typeof orderId === 'string' && /^\d+$/.test(orderId));

  if (isNumericId) {
    const searchParams = new URLSearchParams();
    if (options.reason) {
      searchParams.set('reason', options.reason);
    }
    const query = searchParams.toString();
    const endpoint = query ? `/orders/${orderId}?${query}` : `/orders/${orderId}`;
    const payload = await requestJson<OrderResponsePayload>(endpoint, token, { method: 'DELETE' });
    if (!payload || typeof payload !== 'object' || !payload.order) {
      throw new OrdersApiError('订单服务返回的结构异常');
    }
    return mapOrderRecord(payload.order);
  }

  const body: Record<string, unknown> = {};
  if (options.ibOrderId && options.ibOrderId.trim()) {
    body.ib_order_id = options.ibOrderId.trim();
  }
  if (options.clientOrderId && options.clientOrderId.trim()) {
    body.client_order_id = options.clientOrderId.trim();
  }
  if (options.reason) {
    body.reason = options.reason;
  }

  if (!('ib_order_id' in body) && !('client_order_id' in body)) {
    throw new OrdersApiError('无效的订单标识，无法撤单');
  }

  const payload = await requestJson<OrderResponsePayload>('/orders/cancel', token, {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (!payload || typeof payload !== 'object' || !payload.order) {
    throw new OrdersApiError('订单服务返回的结构异常');
  }
  return mapOrderRecord(payload.order);
};

export const cancelAllOrders = async (
  token: string,
  options: { reason?: string } = {}
): Promise<CancelAllOrdersResponse> => {
  const init: RequestInit = { method: 'POST' };
  if (options.reason) {
    init.body = JSON.stringify({ reason: options.reason });
  }
  return requestJson<CancelAllOrdersResponse>('/orders/cancel_all', token, init);
};

export const syncOrders = async (token: string): Promise<SyncOrdersResult> => {
  const payload = await requestJson<SyncOrdersResponsePayload>(
    '/orders/sync',
    token,
    { method: 'POST' },
    { errorMessage: '同步订单状态失败' }
  );
  const accepted = payload.accepted !== false;
  const jobIdRaw = typeof payload.job_id === 'string' ? payload.job_id.trim() : '';
  const statusRaw = typeof payload.status === 'string' ? payload.status.trim() : '';
  const receivedAt =
    typeof payload.received_at === 'string' ? payload.received_at : new Date().toISOString();
  return {
    accepted,
    jobId: jobIdRaw || `orders-sync-${Date.now()}`,
    started: payload.started !== false,
    status: statusRaw || (payload.started === false ? 'already_running' : 'running'),
    receivedAt
  };
};

export const createOrder = async (
  token: string,
  payload: CreateOrderRequest
): Promise<OrderItem> => {
  const body: Record<string, unknown> = {
    symbol: payload.symbol,
    side: mapOrderSideToPayload(payload.side),
    quantity: payload.quantity
  };

  const orderType = mapOrderTypeToPayload(payload.type);
  body.type = orderType;
  body.order_type = orderType;

  body.sec_type = normalizeSecTypeForOrder(payload.secType);

  if (payload.price !== undefined && payload.price !== null && Number.isFinite(payload.price)) {
    body.price = payload.price;
    if (orderType === 'LMT') {
      body.limit_price = payload.price;
    }
  }
  if (payload.stopPrice !== undefined && payload.stopPrice !== null && Number.isFinite(payload.stopPrice)) {
    body.stop_price = payload.stopPrice;
  }
  if (payload.timeInForce) {
    body.time_in_force = payload.timeInForce;
  }
  if (payload.destination) {
    body.destination = payload.destination;
  }
  if (payload.transmit !== undefined) {
    body.transmit = payload.transmit;
  }
  if (payload.tag) {
    body.tag = payload.tag;
  }
  if (payload.comment) {
    body.comment = payload.comment;
  }

  const response = await requestJson<OrderResponsePayload>(
    '/orders',
    token,
    {
      method: 'POST',
      body: JSON.stringify(body)
    },
    { errorMessage: '下单失败' }
  );

  if (!response || typeof response !== 'object' || !response.order) {
    throw new OrdersApiError('订单服务返回的结构异常');
  }

  return mapOrderRecord(response.order);
};

const ensureOrderResponse = (response: OrderResponsePayload | null | undefined): OrderItem => {
  if (!response || typeof response !== 'object' || !response.order) {
    throw new OrdersApiError('订单服务返回的结构异常');
  }
  return mapOrderRecord(response.order);
};

export const closePosition = async (token: string, symbol: string): Promise<OrderItem> => {
  const response = await requestJson<OrderResponsePayload>(
    '/orders/close_position',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ symbol })
    },
    { errorMessage: '平仓失败' }
  );

  return ensureOrderResponse(response);
};

export const reversePosition = async (token: string, symbol: string): Promise<OrderItem> => {
  const response = await requestJson<OrderResponsePayload>(
    '/orders/reverse_position',
    token,
    {
      method: 'POST',
      body: JSON.stringify({ symbol })
    },
    { errorMessage: '反向下单失败' }
  );

  return ensureOrderResponse(response);
};
