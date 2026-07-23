/**
 * @maximo/alerts — Centralized Telegram Alert Module
 * 
 * Drop this file into any dashboard project (src/lib/telegram-alert.ts)
 * and call sendAlert() from error handlers, API routes, or cron jobs.
 * 
 * Required env vars:
 *   TELEGRAM_ALERT_BOT_TOKEN — Bot API token
 *   TELEGRAM_ALERT_CHAT_ID   — Target chat ID (default: 6090160018)
 * 
 * Usage:
 *   import { sendAlert, withAlertHandler } from '@/lib/telegram-alert';
 *   
 *   await sendAlert({
 *     dashboard: 'GitHub Repos Radar',
 *     site: 'https://github-repos-radar.maximo-seo.ai',
 *     severity: 'error',
 *     title: 'Sync Failure',
 *     details: 'Supadata API returned 403 for 3 channels',
 *     action: 'Check SUPADATA_API_KEY validity',
 *   });
 */

export type AlertSeverity = 'critical' | 'error' | 'warning' | 'info' | 'success';

export interface AlertPayload {
  /** Dashboard name as shown in the panel */
  dashboard: string;
  /** Production URL of the dashboard */
  site: string;
  /** Severity level */
  severity: AlertSeverity;
  /** Short title — what happened */
  title: string;
  /** Detailed explanation — what exactly went wrong / happened */
  details: string;
  /** Suggested action (optional) */
  action?: string;
  /** Additional context: error stack, API response, etc. (optional) */
  context?: string;
  /** Component/route that triggered the alert (optional) */
  component?: string;
}

const SEVERITY_EMOJI: Record<AlertSeverity, string> = {
  critical: '🚨',
  error: '🔴',
  warning: '🟡',
  info: '🔵',
  success: '🟢',
};

const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  critical: 'CRITICAL',
  error: 'ERROR',
  warning: 'WARNING',
  info: 'INFO',
  success: 'SUCCESS',
};

// Rate limiting: max 5 alerts per dashboard per hour
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Deduplication: don't send same alert twice within 10 minutes
const dedupeMap = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function checkRateLimit(dashboard: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(dashboard) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  
  if (recent.length >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }
  
  recent.push(now);
  rateLimitMap.set(dashboard, recent);
  return true;
}

function checkDedupe(payload: AlertPayload): boolean {
  const key = `${payload.dashboard}:${payload.title}:${payload.details}`.slice(0, 200);
  const now = Date.now();
  const lastSent = dedupeMap.get(key);
  
  if (lastSent && now - lastSent < DEDUPE_WINDOW_MS) {
    return false; // Duplicate
  }
  
  dedupeMap.set(key, now);
  return true;
}

function formatMessage(payload: AlertPayload): string {
  const emoji = SEVERITY_EMOJI[payload.severity];
  const label = SEVERITY_LABEL[payload.severity];
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  
  let msg = `${emoji} [${payload.dashboard}] — ${label}\n\n`;
  msg += `📋 ${payload.title}\n\n`;
  msg += `📝 What happened:\n${payload.details}\n\n`;
  msg += `🌐 Site: ${payload.site}\n`;
  
  if (payload.component) {
    msg += `📍 Component: ${payload.component}\n`;
  }
  
  if (payload.action) {
    msg += `\n⚡ Suggested action:\n${payload.action}\n`;
  }
  
  if (payload.context) {
    // Truncate long context
    const ctx = payload.context.length > 500 
      ? payload.context.slice(0, 500) + '...' 
      : payload.context;
    msg += `\n🔍 Context:\n\`${ctx}\`\n`;
  }
  
  msg += `\n🕐 ${timestamp}`;
  
  return msg;
}

/**
 * Send a Telegram alert. Returns true if sent, false if rate-limited/deduped/failed.
 */
export async function sendAlert(payload: AlertPayload): Promise<boolean> {
  const token = process.env.TELEGRAM_ALERT_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || '6090160018';
  
  if (!token) {
    console.warn('[telegram-alert] TELEGRAM_ALERT_BOT_TOKEN not set, skipping alert');
    return false;
  }
  
  // Rate limit check
  if (!checkRateLimit(payload.dashboard)) {
    console.warn(`[telegram-alert] Rate limited: ${payload.dashboard}`);
    return false;
  }
  
  // Dedup check
  if (!checkDedupe(payload)) {
    console.warn(`[telegram-alert] Deduped: ${payload.dashboard} — ${payload.title}`);
    return false;
  }
  
  const message = formatMessage(payload);
  
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    
    if (!res.ok) {
      const err = await res.text();
      console.error(`[telegram-alert] Failed to send: ${res.status} ${err}`);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('[telegram-alert] Network error:', err);
    return false;
  }
}

/**
 * Wrap an async handler with automatic error alerting.
 * Use in API routes:
 * 
 *   export const POST = withAlertHandler('GitHub Repos Radar', 'https://...', async (req) => {
 *     // your logic
 *   });
 */
export function withAlertHandler(
  dashboard: string,
  site: string,
  handler: (req: Request) => Promise<Response>,
  component?: string
) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.slice(0, 300) : undefined;
      
      await sendAlert({
        dashboard,
        site,
        severity: 'error',
        title: `Unhandled error in ${component || 'API route'}`,
        details: errorMsg,
        context: stack,
        component,
        action: 'Check server logs and recent deployments',
      });
      
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  };
}

/**
 * Alert on cron/sync failure
 */
export async function alertCronFailure(
  dashboard: string,
  site: string,
  jobName: string,
  error: string,
  lastSuccess?: string
) {
  return sendAlert({
    dashboard,
    site,
    severity: 'warning',
    title: `Cron job failed: ${jobName}`,
    details: `The scheduled job "${jobName}" failed.\n\nError: ${error}${lastSuccess ? `\nLast successful run: ${lastSuccess}` : ''}`,
    action: `Investigate why "${jobName}" is failing. Check API keys, rate limits, and network connectivity.`,
    component: `cron/${jobName}`,
  });
}

/**
 * Alert on successful deployment or major operation
 */
export async function alertSuccess(
  dashboard: string,
  site: string,
  title: string,
  details: string
) {
  return sendAlert({
    dashboard,
    site,
    severity: 'success',
    title,
    details,
  });
}
