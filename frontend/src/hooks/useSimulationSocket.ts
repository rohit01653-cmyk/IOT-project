import { useEffect, useRef, useState, useCallback } from 'react';
import type { SimMessage } from '@/lib/types';

const RECONNECT_DELAY = 2000;

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

export function useSimulationSocket(url: string) {
  const [state, setState] = useState<ConnectionState>('connecting');
  const [message, setMessage] = useState<SimMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUnmount = useRef(false);

  const connect = useCallback(() => {
    if (closedByUnmount.current) return;
    setState('connecting');
    setError(null);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setState('connected');
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data) as SimMessage;
        setMessage(parsed);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Invalid message');
      }
    };
    ws.onerror = () => setError('WebSocket error');
    ws.onclose = () => {
      setState('disconnected');
      if (!closedByUnmount.current) {
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
      }
    };
  }, [url]);

  useEffect(() => {
    closedByUnmount.current = false;
    connect();
    return () => {
      closedByUnmount.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { state, message, error };
}
