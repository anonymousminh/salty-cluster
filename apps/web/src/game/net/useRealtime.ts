import { useEffect, useRef } from 'react';
import { RealtimeClient, realtime } from './client';

/**
 * Keeps one realtime connection open while `sessionId` is set (api mode, playing).
 * Changing or clearing the session closes the old connection and opens a new one.
 */
export function useRealtime(sessionId: string | null, onSessionExpired?: () => void): void {
  const expired = useRef(onSessionExpired);
  expired.current = onSessionExpired;

  useEffect(() => {
    if (!sessionId) return;
    const client = new RealtimeClient(sessionId, { onSessionExpired: () => expired.current?.() });
    realtime.set(client);
    client.start();
    return () => {
      client.stop();
      realtime.set(null);
    };
  }, [sessionId]);
}
