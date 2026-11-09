import { init, sendEvent } from '@dash0/sdk-web';

const endpoint = import.meta.env.VITE_DASH0_ENDPOINT as string | undefined;
const authToken = import.meta.env.VITE_DASH0_AUTH_TOKEN as string | undefined;
let enabled = false;

/**
 * Dash0 real-user monitoring for the 3D game: page views, web vitals, errors, and the
 * /api fetches (same origin, so `traceparent` links a check-in tap to its backend trace).
 * Off unless VITE_DASH0_ENDPOINT and VITE_DASH0_AUTH_TOKEN are set at build time. Use an
 * ingest-only token limited to one dataset: it is public in the bundle.
 */
export function startRum(): void {
  if (!endpoint || !authToken) return;
  init({
    serviceName: 'game',
    endpoint: { url: endpoint, authToken, dataset: (import.meta.env.VITE_DASH0_DATASET as string | undefined) ?? 'default' },
  });
  enabled = true;
}

/** Game events (joined, check-in, storm, frame rate) as Dash0 custom events. */
export function track(name: string, attributes: Record<string, string | number | boolean> = {}): void {
  if (!enabled) return;
  sendEvent(name, { attributes });
}
