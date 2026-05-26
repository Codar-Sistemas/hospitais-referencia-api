// Lightweight telemetry layer — fires events to our own /v1/track endpoint
// and (optionally) PostHog if NEXT_PUBLIC_POSTHOG_KEY is configured.
// Both transports are fire-and-forget; they never block the UI nor throw
// to the caller. LGPD: no PII collected on the client side; server hashes IP.

import { API_BASE } from './api-client';

export type TelemetryEventType =
  | 'search_executed'
  | 'hospital_clicked'
  | 'map_opened'
  | 'phone_clicked'
  | 'directions_clicked'
  | 'shared'
  | 'page_viewed';

export interface TelemetryEvent {
  event_type: TelemetryEventType;
  state_code?: string | null;
  treatment?: string | null;
  payload?: Record<string, unknown>;
}

const SESSION_STORAGE_KEY = 'hrh_session_id';

// Random per-tab session identifier. Lets us reconstruct flows server-side
// without identifying anyone (no cookie, no fingerprint, no persistence
// across tabs or browser restarts).
function getSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let id = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return null; // private browsing / storage blocked
  }
}

function postToTrack(event: TelemetryEvent): void {
  if (typeof window === 'undefined') return;
  const body = {
    ...event,
    session_id: getSessionId(),
    path: window.location.pathname,
    referrer: document.referrer || null,
  };
  // We use fetch with keepalive (survives navigation) instead of sendBeacon
  // because sendBeacon with Content-Type: application/json triggers a CORS
  // preflight that beacons cannot perform — the request silently disappears.
  // keepalive is supported in all modern browsers and properly does CORS.
  const url = `${API_BASE}/v1/track`;
  const json = JSON.stringify(body);
  try {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: json,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Telemetry must never break the UI.
  }
}

function postToPostHog(event: TelemetryEvent): void {
  // PostHog is loaded lazily via the snippet in app/layout.tsx when the env
  // var is set. If absent, this is a no-op.
  if (typeof window === 'undefined') return;
  const ph = (window as unknown as { posthog?: { capture: (e: string, p: object) => void } })
    .posthog;
  if (!ph) return;
  try {
    ph.capture(event.event_type, {
      state_code: event.state_code,
      treatment: event.treatment,
      ...(event.payload || {}),
    });
  } catch {
    // PostHog errors must never break the UI.
  }
}

export function emit(event: TelemetryEvent): void {
  postToTrack(event);
  postToPostHog(event);
}
