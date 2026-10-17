import { NextRequest, NextResponse } from 'next/server';
import { processComplaintIntake } from '@/lib/triage/orchestrator';
import { StorageService } from '@/lib/db/storage';
import { applyCitizenFeedback } from '@/lib/triage/feedback';
import { isAuthorizedWebhook } from '@/lib/security/auth';
import {
  citizenMessage, citizenTicketMessage, deleteWhatsAppDraft, detectPilotLanguage, downloadWhatsAppPhoto,
  getWhatsAppDraft, getWhatsAppMessage, saveWhatsAppDraft, saveWhatsAppMessage,
  WhatsAppDraft, WhatsAppReply,
} from '@/lib/channels/whatsapp';

interface IncomingMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
}

function extractMessage(payload: Record<string, unknown>): IncomingMessage | null {
  const direct = payload.message as IncomingMessage | undefined;
  if (direct?.id) return direct;
  const entries = payload.entry as Array<{ changes?: Array<{ value?: { messages?: IncomingMessage[] } }> }> | undefined;
  if (entries?.[0]?.changes?.[0]?.value?.messages?.[0]) return entries[0].changes[0].value.messages[0];
  const messages = payload.messages as IncomingMessage[] | undefined;
  return messages?.[0] || null;
}

export async function POST(req: NextRequest) {
  const auth = isAuthorizedWebhook(req.headers.get('x-webhook-secret'));
  if (!auth.authorized) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  const message = extractMessage(payload);
  if (!message?.id || !message.from) return NextResponse.json({ action: 'ignore' } satisfies WhatsAppReply);
  if (!/^[\w.-]{5,128}$/.test(message.id) || !/^\+?\d{8,15}$/.test(message.from)) {
    return NextResponse.json({ error: 'Invalid message identifier or sender.' }, { status: 400 });
  }

  try {
    const previous = await getWhatsAppMessage(message.id);
    if (previous) return NextResponse.json({ ...previous, replayed: true });

    const sender = message.from.startsWith('+') ? message.from : `+${message.from}`;
    const prior = await getWhatsAppDraft(sender);
    const incomingText = (message.text?.body || message.image?.caption || '').trim().slice(0, 5000);
    const language = detectPilotLanguage(incomingText, prior?.language);
    const command = incomingText.match(/^(STATUS|FIXED|REOPEN)\s+(CP-\d{4}-\d{5,})$/i);
    if (command) {
      const ticket = await StorageService.getComplaintById(command[2]);
      const linked = ticket && ticket.citizen_contact?.replace(/\D/g, '') === sender.replace(/\D/g, '');
      let response: WhatsAppReply;
      if (!linked) {
        response = { action: 'reply', to: sender, text: citizenTicketMessage('unauthorized', language, command[2]) };
      } else if (command[1].toUpperCase() === 'STATUS') {
        response = { action: 'reply', to: sender, text: citizenTicketMessage('status', ticket.language || language, ticket.ticket_number, ticket.status) };
      } else if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
        response = { action: 'reply', to: sender, text: citizenTicketMessage('not_ready', ticket.language || language, ticket.ticket_number) };
      } else {
        const persists = command[1].toUpperCase() === 'REOPEN';
        await applyCitizenFeedback(ticket, persists ? 1 : 5, null, persists);
        response = { action: 'reply', to: sender, text: citizenTicketMessage(persists ? 'reopened' : 'confirmed', ticket.language || language, ticket.ticket_number) };
      }
      await saveWhatsAppMessage(message.id, sender, response);
      return NextResponse.json(response);
    }
    const now = new Date();
    const draft: WhatsAppDraft = prior || {
      sender,
      first_message_id: message.id,
      stage: 'description',
      description: null,
      image_reference: null,
      location_text: null,
      latitude: null,
      longitude: null,
      language,
      updated_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 24 * 3600_000).toISOString(),
    };
    draft.language = language;
    draft.updated_at = now.toISOString();
    draft.expires_at = new Date(now.getTime() + 24 * 3600_000).toISOString();

    if (message.image?.id) draft.image_reference = await downloadWhatsAppPhoto(message.image.id);
    if (message.location && Number.isFinite(message.location.latitude) && Number.isFinite(message.location.longitude)) {
      draft.latitude = message.location.latitude!;
      draft.longitude = message.location.longitude!;
      draft.location_text = [message.location.name, message.location.address].filter(Boolean).join(', ') ||
        `Location pin: ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}`;
    }
    if (incomingText) {
      if (draft.stage === 'location' && draft.description) draft.location_text = incomingText.slice(0, 500);
      else draft.description = incomingText;
    }

    let response: WhatsAppReply;
    if (!draft.description || draft.description.length < 5) {
      draft.stage = 'description';
      await saveWhatsAppDraft(draft);
      response = { action: 'reply', to: sender, text: citizenMessage('description', language) };
    } else if (!draft.location_text) {
      draft.stage = 'location';
      await saveWhatsAppDraft(draft);
      response = { action: 'reply', to: sender, text: citizenMessage('location', language) };
    } else {
      const result = await processComplaintIntake({
        description: draft.description,
        location_text: draft.location_text,
        latitude: draft.latitude,
        longitude: draft.longitude,
        citizen_contact: sender,
        image_url: draft.image_reference,
        language,
        source_channel: 'whatsapp',
        idempotency_key: `wa:${draft.first_message_id}`,
      });
      await deleteWhatsAppDraft(sender);
      response = { action: 'reply', to: sender, text: citizenMessage('received', language, result.ticket.ticket_number), ticket_number: result.ticket.ticket_number };
    }
    await saveWhatsAppMessage(message.id, sender, response);
    return NextResponse.json(response);
  } catch (error) {
    console.error('[WhatsApp intake]', error);
    return NextResponse.json({ error: 'WhatsApp intake failed; the workflow may retry.' }, { status: 503 });
  }
}
