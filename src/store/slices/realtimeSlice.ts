import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'offline';

interface ChannelState {
  status: ConnectionStatus;
  lastHeartbeat?: string;
  latencyMs?: number;
}

interface RealtimeState {
  status: ConnectionStatus;
  lastHeartbeat?: string;
  latencyMs?: number;
  subscriptions: string[];
  clientId?: string | null;
  connections: Record<string, ChannelState>;
}

type ConnectionStatusPayload =
  | ConnectionStatus
  | {
      status: ConnectionStatus;
      channel?: string;
    };

interface HeartbeatPayload {
  timestamp: string;
  latencyMs?: number;
  channel?: string;
}

const initialState: RealtimeState = {
  status: 'disconnected',
  subscriptions: [],
  clientId: null,
  connections: {}
};

const normaliseChannel = (channel?: string): string => {
  if (!channel) {
    return 'core';
  }
  return channel.trim() || 'core';
};

const ensureChannelState = (state: RealtimeState, channel: string): ChannelState => {
  const existing = state.connections[channel];
  if (existing) {
    return existing;
  }
  const created: ChannelState = { status: 'disconnected' };
  state.connections[channel] = created;
  return created;
};

const aggregateState = (state: RealtimeState) => {
  const channels = Object.values(state.connections);
  if (!channels.length) {
    state.status = 'disconnected';
    state.lastHeartbeat = undefined;
    state.latencyMs = undefined;
    return;
  }

  if (channels.some((entry) => entry.status === 'connected')) {
    state.status = 'connected';
  } else if (channels.some((entry) => entry.status === 'connecting')) {
    state.status = 'connecting';
  } else if (channels.some((entry) => entry.status === 'offline')) {
    state.status = 'offline';
  } else {
    state.status = 'disconnected';
  }

  let latest = 0;
  let latency: number | undefined;
  for (const entry of channels) {
    if (!entry.lastHeartbeat) {
      continue;
    }
    const parsed = Date.parse(entry.lastHeartbeat);
    if (Number.isNaN(parsed)) {
      continue;
    }
    if (parsed >= latest) {
      latest = parsed;
      latency = entry.latencyMs;
    }
  }

  if (latest > 0) {
    state.lastHeartbeat = new Date(latest).toISOString();
    state.latencyMs = latency;
  } else {
    state.lastHeartbeat = undefined;
    state.latencyMs = undefined;
  }
};

const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    setConnectionStatus(state, action: PayloadAction<ConnectionStatusPayload>) {
      const payload = action.payload;
      const { status, channel } =
        typeof payload === 'string' ? { status: payload, channel: 'core' } : payload;
      const resolvedChannel = normaliseChannel(channel);
      const entry = ensureChannelState(state, resolvedChannel);
      entry.status = status;
      aggregateState(state);
    },
    setHeartbeat(state, action: PayloadAction<HeartbeatPayload>) {
      const { timestamp, latencyMs, channel } = action.payload;
      const resolvedChannel = normaliseChannel(channel);
      const entry = ensureChannelState(state, resolvedChannel);
      entry.lastHeartbeat = timestamp;
      entry.latencyMs = latencyMs;
      aggregateState(state);
    },
    setSubscriptions(state, action: PayloadAction<string[]>) {
      state.subscriptions = action.payload;
    },
    setClientId(state, action: PayloadAction<string | null | undefined>) {
      const value = action.payload;
      const text = typeof value === 'string' ? value.trim() : '';
      state.clientId = text ? text : null;
    }
  }
});

export const { setConnectionStatus, setHeartbeat, setSubscriptions, setClientId } = realtimeSlice.actions;

export default realtimeSlice.reducer;
