import { NotificationChannel, NotificationType, NotificationRecord } from '@/types';
import { StorageService } from '@/lib/db/storage';

interface SendNotificationInput {
  complaint_id?: string;
  recipient: string;
  channel: NotificationChannel;
  message_type: NotificationType;
  subject?: string;
  body: string;
}

/**
 * Dispatches notifications across external providers (Telegram, SMTP, Webhook)
 * or records explicit simulated logs when credentials are unconfigured or in demo mode.
 *
 * CRITICAL RULE: Simulated notifications are NEVER marked as 'delivered' and
 * delivered_at timestamp must strictly remain NULL unless an external provider
 * explicitly confirmed receipt.
 */
export async function dispatchNotification(
  input: SendNotificationInput
): Promise<NotificationRecord> {
  const isDemo = process.env.DEMO_MODE === 'true';
  let deliveryStatus: 'pending' | 'delivered' | 'failed' | 'simulated' = 'simulated';
  let failureReason: string | null = null;
  let deliveredAt: string | null = null;

  // Telegram dispatch if configured and channel is telegram
  if (input.channel === 'telegram') {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_OFFICER_CHAT_ID || input.recipient;

    if (botToken && chatId && !isDemo) {
      try {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: `🏛️ *CIVICPILOT ALERT*\n*${input.subject || 'Notification'}*\n\n${input.body}`,
            parse_mode: 'Markdown',
          }),
        });

        if (res.ok) {
          deliveryStatus = 'delivered';
          deliveredAt = new Date().toISOString();
        } else {
          deliveryStatus = 'failed';
          deliveredAt = null;
          failureReason = `Telegram API HTTP ${res.status}`;
        }
      } catch (err: unknown) {
        deliveryStatus = 'failed';
        deliveredAt = null;
        failureReason = err instanceof Error ? err.message : 'Unknown Telegram network error';
      }
    } else {
      deliveryStatus = 'simulated';
      deliveredAt = null;
      failureReason = isDemo
        ? 'Simulated dispatch in demo mode (credentials not configured)'
        : 'Telegram credentials (TELEGRAM_BOT_TOKEN / CHAT_ID) not configured';
    }
  } else if (input.channel === 'webhook') {
    // Webhook / n8n notification dispatch if configured
    const webhookUrl = process.env.N8N_WEBHOOK_NOTIFY_URL;
    if (webhookUrl && !isDemo) {
      try {
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET || '',
          },
          body: JSON.stringify(input),
        });

        if (res.ok) {
          deliveryStatus = 'delivered';
          deliveredAt = new Date().toISOString();
        } else {
          deliveryStatus = 'failed';
          deliveredAt = null;
          failureReason = `n8n webhook HTTP ${res.status}`;
        }
      } catch (err: unknown) {
        deliveryStatus = 'failed';
        deliveredAt = null;
        failureReason = err instanceof Error ? err.message : 'Webhook dispatch error';
      }
    } else {
      deliveryStatus = 'simulated';
      deliveredAt = null;
      failureReason = isDemo
        ? 'Simulated webhook dispatch in demo mode'
        : 'N8N_WEBHOOK_NOTIFY_URL not configured';
    }
  } else {
    // Default simulated channels (email, sms, in_app) when providers unconfigured
    deliveryStatus = 'simulated';
    deliveredAt = null;
    failureReason = isDemo
      ? 'Simulated dispatch in demo mode (credentials not configured)'
      : 'External dispatch provider credentials not configured';
  }

  // Record notification in storage with truthful deliveryStatus and deliveredAt
  const record = await StorageService.addNotification({
    complaint_id: input.complaint_id,
    recipient: input.recipient,
    channel: input.channel,
    message_type: input.message_type,
    subject: input.subject,
    body: input.body,
    status: deliveryStatus,
    failure_reason: failureReason,
    delivered_at: deliveredAt,
  });

  return record;
}
