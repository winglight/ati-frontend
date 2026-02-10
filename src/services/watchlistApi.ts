import type { WatchlistGroup, WatchlistItem } from '@features/dashboard/types';
import { resolveRequestUrl } from './config';

interface WatchlistItemPayload {
  id?: string | number | null;
  group_ref_id?: string | number | null;
  symbol?: string | null;
  sort_order?: number | null;
}

interface WatchlistGroupPayload {
  id?: string | number | null;
  name?: string | null;
  group_type?: string | null;
  strategy_ref_id?: string | number | null;
  sort_order?: number | null;
  items?: WatchlistItemPayload[] | null;
}

interface WatchlistResponsePayload {
  groups?: WatchlistGroupPayload[] | null;
}

export class WatchlistApiError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'WatchlistApiError';
  }
}

const requestJson = async <T>(
  path: string,
  token: string,
  init: RequestInit = {}
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
    throw new WatchlistApiError('认证状态已失效，请重新登录', response.status);
  }
  if (!response.ok) {
    let detail = '操作自选股失败';
    try {
      const payload = await response.json();
      if (payload && typeof payload === 'object' && typeof payload.detail === 'string') {
        detail = payload.detail;
      }
    } catch (_error) {
      void _error;
    }
    throw new WatchlistApiError(detail, response.status);
  }

  const text = await response.text();
  if (!text) {
    return JSON.parse('{}') as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch (_error) {
    throw new WatchlistApiError('解析自选股响应失败', response.status);
  }
};

const toStringId = (value: unknown, fallbackPrefix: string): string => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return `${fallbackPrefix}-${Math.random().toString(16).slice(2, 8)}`;
};

const toNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
};

const mapWatchlistItem = (payload: WatchlistItemPayload): WatchlistItem => ({
  id: toStringId(payload.id, 'watch-item'),
  groupId: toStringId(payload.group_ref_id, 'watch-group'),
  symbol: typeof payload.symbol === 'string' ? payload.symbol.trim().toUpperCase() : '',
  sortOrder: toNumber(payload.sort_order, 0)
});

const mapWatchlistGroup = (payload: WatchlistGroupPayload): WatchlistGroup => {
  const groupId = toStringId(payload.id, 'watch-group');
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => {
        const mapped = mapWatchlistItem(item);
        return { ...mapped, groupId };
      })
    : [];
  return {
    id: groupId,
    name: typeof payload.name === 'string' ? payload.name : 'Untitled',
    groupType: payload.group_type === 'screener' ? 'screener' : 'manual',
    strategyId:
      payload.strategy_ref_id === null || payload.strategy_ref_id === undefined
        ? null
        : toStringId(payload.strategy_ref_id, 'strategy'),
    sortOrder: toNumber(payload.sort_order, 0),
    items: items
      .filter((item) => item.symbol.length > 0)
      .sort((a, b) => (a.sortOrder - b.sortOrder) || a.symbol.localeCompare(b.symbol))
  };
};

const mapWatchlistGroups = (payload: WatchlistResponsePayload): WatchlistGroup[] => {
  if (!Array.isArray(payload.groups)) {
    return [];
  }
  return payload.groups
    .map(mapWatchlistGroup)
    .sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
};

const fetchGroups = async (
  token: string,
  path: string,
  init: RequestInit = { method: 'GET' }
): Promise<WatchlistGroup[]> => {
  const payload = await requestJson<WatchlistResponsePayload>(path, token, init);
  return mapWatchlistGroups(payload);
};

export const fetchWatchlist = async (token: string): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, '/strategies/watchlist', { method: 'GET' });
};

export const createWatchlistGroup = async (token: string, name: string): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, '/strategies/watchlist/groups', {
    method: 'POST',
    body: JSON.stringify({ name })
  });
};

export const renameWatchlistGroup = async (
  token: string,
  groupId: string,
  name: string
): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, `/strategies/watchlist/groups/${encodeURIComponent(groupId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name })
  });
};

export const deleteWatchlistGroup = async (
  token: string,
  groupId: string
): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, `/strategies/watchlist/groups/${encodeURIComponent(groupId)}`, {
    method: 'DELETE'
  });
};

export const reorderWatchlistGroups = async (
  token: string,
  groupIds: string[]
): Promise<WatchlistGroup[]> => {
  const normalized = groupIds
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  return fetchGroups(token, '/strategies/watchlist/groups/reorder', {
    method: 'POST',
    body: JSON.stringify({ group_ids: normalized })
  });
};

export const addWatchlistItem = async (
  token: string,
  groupId: string,
  symbol: string
): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, `/strategies/watchlist/groups/${encodeURIComponent(groupId)}/items`, {
    method: 'POST',
    body: JSON.stringify({ symbol })
  });
};

export const updateWatchlistItem = async (
  token: string,
  itemId: string,
  symbol: string
): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, `/strategies/watchlist/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ symbol })
  });
};

export const deleteWatchlistItem = async (
  token: string,
  itemId: string
): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, `/strategies/watchlist/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE'
  });
};

export const moveWatchlistItem = async (
  token: string,
  args: { itemId: string; targetGroupId: string; targetIndex: number }
): Promise<WatchlistGroup[]> => {
  return fetchGroups(token, '/strategies/watchlist/items/move', {
    method: 'POST',
    body: JSON.stringify({
      item_id: Number(args.itemId),
      target_group_id: Number(args.targetGroupId),
      target_index: Math.max(0, Math.trunc(args.targetIndex))
    })
  });
};
