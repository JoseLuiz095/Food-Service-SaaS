import packageJson from '../../package.json';
import { isDemoMode } from '../lib/config';
import { restFetch } from '../lib/supabaseRest';

export type PlatformEventResult = 'started' | 'success' | 'error' | 'warning';
export type PlatformEventKind = 'interaction' | 'audit';

export type PlatformEventLog = {
  id: string;
  createdAt: string;
  kind: PlatformEventKind;
  action: string;
  result: PlatformEventResult;
  route: string;
  storeId?: string;
  storeName?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  appVersion?: string;
  correlationId?: string;
};

type RecordEventInput = {
  action: string;
  result: PlatformEventResult;
  kind?: PlatformEventKind;
  storeId?: string;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  correlationId?: string;
};

const VERSION = packageJson.version;
let globalInstalled = false;

const sanitize = (value?: string) => (value || '')
  .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
  .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/g, '[token-redacted]')
  .slice(0, 500);

const correlationId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `evt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const recordPlatformEvent = async (input: RecordEventInput): Promise<void> => {
  if (isDemoMode) return;
  try {
    await restFetch<unknown>('rpc/food_log_platform_event_v1', {
      method: 'POST',
      body: {
        p_store_id: input.storeId || null,
        p_kind: input.kind || 'interaction',
        p_action: input.action.slice(0, 120),
        p_result: input.result,
        p_route: typeof window !== 'undefined' ? window.location.pathname.slice(0, 240) : '',
        p_duration_ms: input.durationMs == null ? null : Math.max(0, Math.round(input.durationMs)),
        p_error_code: sanitize(input.errorCode),
        p_error_message: sanitize(input.errorMessage),
        p_app_version: VERSION,
        p_correlation_id: input.correlationId || null,
      },
      keepalive: true,
    });
  } catch {
    // Telemetria nunca deve bloquear a operação principal.
  }
};

export const trackInteraction = async <T>(
  action: string,
  operation: () => Promise<T>,
  options: { storeId?: string; successKind?: PlatformEventKind } = {},
): Promise<T> => {
  const startedAt = performance.now();
  const id = correlationId();
  void recordPlatformEvent({ action, result: 'started', storeId: options.storeId, correlationId: id });
  try {
    const result = await operation();
    void recordPlatformEvent({
      action,
      result: 'success',
      kind: options.successKind || 'interaction',
      storeId: options.storeId,
      correlationId: id,
      durationMs: performance.now() - startedAt,
    });
    return result;
  } catch (error) {
    void recordPlatformEvent({
      action,
      result: 'error',
      storeId: options.storeId,
      correlationId: id,
      durationMs: performance.now() - startedAt,
      errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const installGlobalInteractionTelemetry = () => {
  if (globalInstalled || typeof window === 'undefined') return;
  globalInstalled = true;

  window.addEventListener('error', (event) => {
    void recordPlatformEvent({
      action: 'window_error',
      result: 'error',
      errorCode: event.error instanceof Error ? event.error.name : 'WINDOW_ERROR',
      errorMessage: event.error instanceof Error ? event.error.message : event.message,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    void recordPlatformEvent({
      action: 'unhandled_promise_rejection',
      result: 'error',
      errorCode: reason instanceof Error ? reason.name : 'UNHANDLED_REJECTION',
      errorMessage: reason instanceof Error ? reason.message : String(reason),
    });
  });
};
