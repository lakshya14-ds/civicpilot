/**
 * Privacy & Security: PII Masking Utility
 * Masks citizen contact numbers, email addresses, and identifiable patterns
 * before submitting text to LLM or public external APIs.
 */

export function maskPII(text: string): { maskedText: string; detectedPII: string[] } {
  if (!text) return { maskedText: '', detectedPII: [] };

  const detectedPII: string[] = [];
  let result = text;

  // Mask emails: e.g. john.doe@example.com -> [EMAIL_PROTECTED]
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const replacedEmail = result.replace(emailRegex, '[EMAIL_PROTECTED]');
  if (replacedEmail !== result) {
    detectedPII.push('email');
    result = replacedEmail;
  }

  // Mask phone numbers (10 digits, +91-..., +1-..., xxx-xxx-xxxx)
  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?(\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/g;
  const replacedPhone = result.replace(phoneRegex, '[PHONE_PROTECTED]');
  if (replacedPhone !== result) {
    detectedPII.push('phone');
    result = replacedPhone;
  }

  // Mask standard credit card or identification numbers
  const idRegex = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
  const replacedId = result.replace(idRegex, '[ID_PROTECTED]');
  if (replacedId !== result) {
    detectedPII.push('id_number');
    result = replacedId;
  }

  return { maskedText: result, detectedPII };
}
