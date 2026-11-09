import { init, sendEvent } from "@dash0/sdk-web";

const endpoint = import.meta.env.VITE_DASH0_ENDPOINT as string | undefined;
const authToken = import.meta.env.VITE_DASH0_AUTH_TOKEN as string | undefined;
let enabled = false;

/**
 * Real-user monitoring with the Dash0 Web SDK: page views, web vitals, fetch timing
 * (with trace propagation to the same-origin API) and JS errors.
 * Use an ingest-only token limited to this dataset: it is public in the bundle.
 */
export function startRum(): void {
  if (!endpoint || !authToken) return;
  init({
    serviceName: "console",
    endpoint: { url: endpoint, authToken, dataset: (import.meta.env.VITE_DASH0_DATASET as string | undefined) ?? "default" },
  });
  enabled = true;
}

/** Game events (join, check-in, circle change) as Dash0 custom events. */
export function track(name: string, attributes: Record<string, string | number | boolean> = {}): void {
  if (!enabled) return;
  sendEvent(name, { attributes });
}
