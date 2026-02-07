import { useEffect, useRef } from 'react';
import { useStore } from 'react-redux';
import OrdersRealtimeClient from '@services/ordersRealtime';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import type { RootState } from '@store/index';

interface UseOrdersRealtimeOptions {
  enabled?: boolean;
}

export default function useOrdersRealtime(options?: UseOrdersRealtimeOptions) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const token = useAppSelector((state) => state.auth.token);
  const ordersStatus = useAppSelector((state) => state.orders.status);
  const defaultEnabled = ordersStatus === 'succeeded' || ordersStatus === 'loading';
  const shouldEnable = options?.enabled ?? defaultEnabled;
  const enabled = Boolean(token && shouldEnable);

  const clientRef = useRef<OrdersRealtimeClient | null>(null);

  useEffect(() => {
    if (!enabled) {
      if (clientRef.current) {
        void clientRef.current.disconnect();
        clientRef.current = null;
      }
      return;
    }

    if (clientRef.current) {
      return;
    }

    const client = new OrdersRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token,
      stateProvider: () => store.getState()
    });

    clientRef.current = client;
    void client.connect();

    return () => {
      void client.disconnect();
      if (clientRef.current === client) {
        clientRef.current = null;
      }
    };
  }, [dispatch, enabled, store, token]);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        void clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, []);
}
