import { NextRequest, NextResponse } from 'next/server';
import { processComplaintIntake } from '@/lib/triage/orchestrator';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { generateFeedbackToken } from '@/lib/security/auth';

export async function POST(req: NextRequest) {
  try {
    // 1. IP Rate Limiting (e.g., max 30 submissions per minute per IP)
    const clientIp = getClientIp(req.headers);
    const rateLimit = checkRateLimit(`intake:${clientIp}`, {
      windowMs: 60 * 1000,
      maxRequests: 30,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Rate limit exceeded. Please wait before submitting more complaints.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds),
          },
        }
      );
    }

    // 2. Body parsing
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON request payload' },
        { status: 400 }
      );
    }

    // 3. Description bounds validation (5 to 5000 characters)
    if (typeof body.description !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Complaint description is required and must be text.' },
        { status: 400 }
      );
    }

    const trimmedDescription = body.description.trim();
    if (trimmedDescription.length < 5) {
      return NextResponse.json(
        { success: false, error: 'Complaint description must be at least 5 characters.' },
        { status: 400 }
      );
    }

    if (trimmedDescription.length > 5000) {
      return NextResponse.json(
        { success: false, error: 'Complaint description cannot exceed 5000 characters.' },
        { status: 400 }
      );
    }

    // 4. Latitude and Longitude validation
    let lat: number | undefined = undefined;
    if (body.latitude !== undefined && body.latitude !== null) {
      const numLat = Number(body.latitude);
      if (isNaN(numLat) || numLat < -90 || numLat > 90) {
        return NextResponse.json(
          { success: false, error: 'Latitude must be a valid number between -90 and 90.' },
          { status: 400 }
        );
      }
      lat = numLat;
    }

    let lng: number | undefined = undefined;
    if (body.longitude !== undefined && body.longitude !== null) {
      const numLng = Number(body.longitude);
      if (isNaN(numLng) || numLng < -180 || numLng > 180) {
        return NextResponse.json(
          { success: false, error: 'Longitude must be a valid number between -180 and 180.' },
          { status: 400 }
        );
      }
      lng = numLng;
    }

    // 5. Image URL validation
    let imageUrl: string | undefined = undefined;
    if (body.image_url) {
      if (typeof body.image_url !== 'string') {
        return NextResponse.json(
          { success: false, error: 'image_url must be a string URL.' },
          { status: 400 }
        );
      }
      const trimmedUrl = body.image_url.trim();
      if (trimmedUrl.length > 2048) {
        return NextResponse.json(
          { success: false, error: 'image_url exceeds maximum permitted length.' },
          { status: 400 }
        );
      }
      if (!/^evidence:\/\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(trimmedUrl) && !trimmedUrl.startsWith('https://')) {
        return NextResponse.json(
          { success: false, error: 'image_url must be a private evidence reference or HTTPS URL.' },
          { status: 400 }
        );
      }
      imageUrl = trimmedUrl;
    }

    // 6. Citizen contact & name validation
    const citizenName =
      typeof body.citizen_name === 'string' ? body.citizen_name.trim().slice(0, 200) : undefined;
    const citizenContact =
      typeof body.citizen_contact === 'string' ? body.citizen_contact.trim().slice(0, 200) : undefined;
    const locationText =
      typeof body.location_text === 'string' ? body.location_text.trim().slice(0, 500) : undefined;
    const language =
      typeof body.language === 'string' ? body.language.trim().slice(0, 10) : 'en';
    const sourceChannel = 'web';
    const idempotencyKey =
      typeof body.idempotency_key === 'string' ? body.idempotency_key.trim().slice(0, 128) : undefined;

    // 7. Process Complaint Intake
    const result = await processComplaintIntake({
      description: trimmedDescription,
      location_text: locationText,
      latitude: lat,
      longitude: lng,
      citizen_name: citizenName,
      citizen_contact: citizenContact,
      image_url: imageUrl,
      language: language || 'en',
      source_channel: sourceChannel || 'web',
      idempotency_key: idempotencyKey,
    });

    return NextResponse.json({ ...result, feedback_token: generateFeedbackToken(result.ticket.id) }, {
      status: 201,
      headers: {
        'X-RateLimit-Remaining': String(rateLimit.remaining),
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal complaint processing error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
