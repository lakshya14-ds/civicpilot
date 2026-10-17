import { getServerSupabase } from '@/lib/db/supabase';
import { EvidenceError, saveEvidence } from '@/lib/media/evidence';

export interface WhatsAppDraft {
  sender: string;
  first_message_id: string;
  stage: 'description' | 'location';
  description: string | null;
  image_reference: string | null;
  location_text: string | null;
  latitude: number | null;
  longitude: number | null;
  language: string;
  updated_at: string;
  expires_at: string;
}

export interface WhatsAppReply {
  action: 'reply' | 'ignore';
  to?: string;
  text?: string;
  ticket_number?: string;
}

const demoDrafts = new Map<string, WhatsAppDraft>();
const demoMessages = new Map<string, WhatsAppReply>();

export function detectPilotLanguage(text: string, preferred?: string): 'en' | 'hi' | 'kn' {
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  if (preferred === 'en' || preferred === 'hi' || preferred === 'kn') return preferred;
  return 'en';
}

export function citizenMessage(kind: 'description' | 'location' | 'received' | 'error', language: string, ticket?: string) {
  const messages = {
    en: {
      description: 'I received your photo. Please describe the civic issue in a sentence.',
      location: 'Please share a WhatsApp location pin or send a nearby landmark and street name.',
      received: `Report ${ticket} has been registered. Keep this number to track it.`,
      error: 'I could not process that report. Please try again or use the CivicPilot website.',
    },
    hi: {
      description: 'आपकी तस्वीर मिल गई है। कृपया समस्या एक वाक्य में बताएं।',
      location: 'कृपया लोकेशन पिन या पास का स्थान और सड़क का नाम भेजें।',
      received: `शिकायत ${ticket} दर्ज हो गई है। इसे ट्रैक करने के लिए यह नंबर रखें।`,
      error: 'शिकायत दर्ज नहीं हो सकी। कृपया फिर कोशिश करें या CivicPilot वेबसाइट का उपयोग करें।',
    },
    kn: {
      description: 'ನಿಮ್ಮ ಫೋಟೋ ಸಿಕ್ಕಿದೆ. ದಯವಿಟ್ಟು ಸಮಸ್ಯೆಯನ್ನು ಒಂದು ವಾಕ್ಯದಲ್ಲಿ ವಿವರಿಸಿ.',
      location: 'ದಯವಿಟ್ಟು ಸ್ಥಳದ ಪಿನ್ ಅಥವಾ ಹತ್ತಿರದ ಗುರುತು ಮತ್ತು ರಸ್ತೆಯ ಹೆಸರನ್ನು ಕಳುಹಿಸಿ.',
      received: `ದೂರು ${ticket} ದಾಖಲಾಗಿದೆ. ಸ್ಥಿತಿಯನ್ನು ತಿಳಿಯಲು ಈ ಸಂಖ್ಯೆಯನ್ನು ಉಳಿಸಿಕೊಳ್ಳಿ.`,
      error: 'ದೂರು ದಾಖಲಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ ಅಥವಾ CivicPilot ವೆಬ್‌ಸೈಟ್ ಬಳಸಿ.',
    },
  };
  return messages[language as keyof typeof messages]?.[kind] || messages.en[kind];
}

export function citizenTicketMessage(
  kind: 'status' | 'confirmed' | 'reopened' | 'unauthorized' | 'not_ready',
  language: string,
  ticket: string,
  status?: string,
): string {
  const copy = {
    en: {
      status: `${ticket} is currently ${status}. Reply FIXED ${ticket} if the repair worked, or REOPEN ${ticket} if it did not.`,
      confirmed: `Thank you. ${ticket} is closed with your confirmation.`,
      reopened: `${ticket} is reopened and the city team will review it.`,
      unauthorized: 'This ticket is not linked to your WhatsApp number.',
      not_ready: `We can record feedback on ${ticket} after an officer marks the work resolved.`,
    },
    hi: {
      status: `${ticket} की स्थिति ${status} है। मरम्मत सही हुई हो तो FIXED ${ticket}, नहीं तो REOPEN ${ticket} भेजें।`,
      confirmed: `धन्यवाद। आपकी पुष्टि के बाद ${ticket} बंद हो गई है।`,
      reopened: `${ticket} फिर से खोली गई है और टीम इसकी समीक्षा करेगी।`,
      unauthorized: 'यह शिकायत आपके WhatsApp नंबर से जुड़ी नहीं है।',
      not_ready: `अधिकारी द्वारा ${ticket} का काम पूरा बताने के बाद प्रतिक्रिया दर्ज कर सकते हैं।`,
    },
    kn: {
      status: `${ticket} ಪ್ರಸ್ತುತ ${status} ಸ್ಥಿತಿಯಲ್ಲಿದೆ. ದುರಸ್ತಿ ಸರಿಯಾಗಿದ್ದರೆ FIXED ${ticket}, ಇಲ್ಲದಿದ್ದರೆ REOPEN ${ticket} ಕಳುಹಿಸಿ.`,
      confirmed: `ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ದೃಢೀಕರಣದೊಂದಿಗೆ ${ticket} ಮುಚ್ಚಲಾಗಿದೆ.`,
      reopened: `${ticket} ಮತ್ತೆ ತೆರೆಯಲಾಗಿದೆ. ನಗರ ತಂಡ ಪರಿಶೀಲಿಸುತ್ತದೆ.`,
      unauthorized: 'ಈ ದೂರು ನಿಮ್ಮ WhatsApp ಸಂಖ್ಯೆಗೆ ಲಿಂಕ್ ಆಗಿಲ್ಲ.',
      not_ready: `ಅಧಿಕಾರಿ ${ticket} ಪರಿಹರಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಿದ ನಂತರ ಪ್ರತಿಕ್ರಿಯೆ ನೀಡಬಹುದು.`,
    },
  };
  return (copy[language as keyof typeof copy] || copy.en)[kind];
}

export async function getWhatsAppDraft(sender: string): Promise<WhatsAppDraft | null> {
  if (process.env.DEMO_MODE === 'true') {
    const draft = demoDrafts.get(sender);
    if (draft && Date.parse(draft.expires_at) > Date.now()) return draft;
    demoDrafts.delete(sender);
    return null;
  }
  const client = getServerSupabase();
  if (!client) throw new Error('Database not configured.');
  const { data, error } = await client.from('conversation_drafts').select('*').eq('sender', sender).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return data as WhatsAppDraft | null;
}

export async function saveWhatsAppDraft(draft: WhatsAppDraft): Promise<void> {
  if (process.env.DEMO_MODE === 'true') { demoDrafts.set(draft.sender, draft); return; }
  const client = getServerSupabase();
  if (!client) throw new Error('Database not configured.');
  const { error } = await client.from('conversation_drafts').upsert(draft);
  if (error) throw error;
}

export async function deleteWhatsAppDraft(sender: string): Promise<void> {
  if (process.env.DEMO_MODE === 'true') { demoDrafts.delete(sender); return; }
  const client = getServerSupabase();
  if (!client) throw new Error('Database not configured.');
  const { error } = await client.from('conversation_drafts').delete().eq('sender', sender);
  if (error) throw error;
}

export async function getWhatsAppMessage(messageId: string): Promise<WhatsAppReply | null> {
  if (process.env.DEMO_MODE === 'true') return demoMessages.get(messageId) || null;
  const client = getServerSupabase();
  if (!client) throw new Error('Database not configured.');
  const { data, error } = await client.from('channel_messages').select('response').eq('message_id', messageId).maybeSingle();
  if (error) throw error;
  return (data?.response as WhatsAppReply) || null;
}

export async function saveWhatsAppMessage(messageId: string, sender: string, response: WhatsAppReply): Promise<void> {
  if (process.env.DEMO_MODE === 'true') { demoMessages.set(messageId, response); return; }
  const client = getServerSupabase();
  if (!client) throw new Error('Database not configured.');
  const { error } = await client.from('channel_messages').upsert({ message_id: messageId, sender, response }, { onConflict: 'message_id' });
  if (error) throw error;
}

export async function downloadWhatsAppPhoto(mediaId: string): Promise<string> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const version = process.env.META_GRAPH_API_VERSION;
  if (!token || !version || !/^v\d+\.\d+$/.test(version)) {
    throw new EvidenceError('WhatsApp media credentials are not configured.', 503);
  }
  if (!/^\d{5,32}$/.test(mediaId)) throw new EvidenceError('Invalid WhatsApp media ID.');

  const metadataResponse = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!metadataResponse.ok) throw new EvidenceError('WhatsApp photo metadata could not be retrieved.', 502);
  const metadata = await metadataResponse.json() as { url?: string; file_size?: number };
  if (!metadata.url || (metadata.file_size && metadata.file_size > 5 * 1024 * 1024)) {
    throw new EvidenceError('WhatsApp photo is missing or exceeds 5 MB.', 413);
  }
  const mediaUrl = new URL(metadata.url);
  if (mediaUrl.protocol !== 'https:' || !/(^|\.)(fbcdn\.net|fbsbx\.com|facebook\.com)$/.test(mediaUrl.hostname)) {
    throw new EvidenceError('Unexpected WhatsApp media host.', 502);
  }
  const imageResponse = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!imageResponse.ok) throw new EvidenceError('WhatsApp photo could not be downloaded.', 502);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  return saveEvidence(bytes);
}
