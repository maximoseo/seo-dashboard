import type { NextApiRequest, NextApiResponse } from 'next';
import { sendAlert, AlertPayload } from '@/lib/telegram-alert';

/**
 * POST /api/alert — Universal alert endpoint
 * Any internal component can POST here to trigger a Telegram alert.
 * Also used by the global error boundary.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = await req.json();
    const { severity, title, details, action, component, context } = body;

    if (!title || !details) {
      return res.status(200).json({ error: 'title and details are required' });
    }

    const payload: AlertPayload = {
      dashboard: process.env.NEXT_PUBLIC_DASHBOARD_NAME || 'Unknown Dashboard',
      site: process.env.NEXT_PUBLIC_DASHBOARD_URL || '',
      severity: severity || 'error',
      title,
      details,
      action,
      component,
      context,
    };

    const sent = await sendAlert(payload);
    return res.status(200).json({ sent });
  } catch (err) {
    console.error('[alert-route]', err);
    return res.status(200).json({ error: 'Failed to send alert' });
  }
}
