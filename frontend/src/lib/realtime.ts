import { useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { useQueryClient } from '@tanstack/react-query';
import { getGuestToken, getStaffToken } from './api';

const topics = [
  'OrderRequested', 'OrderAccepted', 'OrderRejected', 'PaymentStatusChanged',
  'PreparationStarted', 'OrderItemReady', 'OrderReady', 'OrderItemServed',
  'OrderServed', 'ServiceRequestCreated', 'ServiceRequestResolved',
  'TableOccupancyChanged', 'InventoryLow',
];

type RealtimeEvent = { eventId: string; data: unknown };

/**
 * Start/stop the SignalR connection safely with React 18 StrictMode.
 * A deferred start prevents StrictMode's setup/cleanup/setup cycle from
 * aborting an in-flight SignalR negotiate request.
 */
export function useRealtime(
  isGuest = false,
  onEvent?: (type: string, payload: RealtimeEvent) => void,
) {
  const client = useQueryClient();
  const callbackRef = useRef(onEvent);

  // Keep the latest callback without reconnecting the socket on every render.
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    let disposed = false;
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(
        '/hubs/cafe',
        isGuest ? {} : { accessTokenFactory: () => getStaffToken() || '' },
      )
      .withAutomaticReconnect()
      .build();

    for (const topic of topics) {
      conn.on(topic, (event: RealtimeEvent) => {
        if (disposed) return;
        void client.invalidateQueries();
        callbackRef.current?.(topic, event);
      });
    }

    async function joinVisit() {
      const token = getGuestToken();
      if (!disposed && isGuest && token && conn.state === signalR.HubConnectionState.Connected) {
        try {
          await conn.invoke('JoinVisit', token);
        } catch (err) {
          if (!disposed) console.warn('[MocCafe] JoinVisit thất bại:', err);
        }
      }
    }

    conn.onreconnected(() => {
      if (disposed) return;
      void joinVisit();
      void client.invalidateQueries();
    });

    async function start() {
      if (disposed || conn.state !== signalR.HubConnectionState.Disconnected) return;
      try {
        await conn.start();
        if (disposed) {
          // If a route changed during negotiation, stop only after start settles.
          await conn.stop();
          return;
        }
        await joinVisit();
      } catch (err) {
        if (disposed) return;
        console.warn('[MocCafe] SignalR chưa kết nối, thử lại sau 5 giây:', err);
        retryTimer = setTimeout(() => { void start(); }, 5000);
      }
    }

    // React StrictMode cleans up the first effect synchronously in development.
    // Delaying start to the next task avoids start()->stop() during negotiate.
    startTimer = setTimeout(() => { void start(); }, 0);

    return () => {
      disposed = true;
      if (startTimer !== undefined) clearTimeout(startTimer);
      if (retryTimer !== undefined) clearTimeout(retryTimer);
      // During Connecting, start() handles stop AFTER negotiation has finished.
      // Stopping immediately at that point would cause the original error.
      if (conn.state === signalR.HubConnectionState.Connected ||
          conn.state === signalR.HubConnectionState.Reconnecting) {
        void conn.stop().catch(() => {});
      }
    };
  }, [client, isGuest]);
}
