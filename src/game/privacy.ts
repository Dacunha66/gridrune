// Datenschutz: the operator's details for the privacy page (settings document "privacy", written by the admin).
// The rest of the page describes what the game really stores (src/screens/Privacy.tsx).
export const PRIVACY_DOC = 'privacy';

export interface PrivacyInfo {
  /** Name and postal address of the person responsible (several lines). */
  operator: string;
  /** E-mail address for privacy requests. */
  contact: string;
  /** Date shown as "Stand" (YYYY-MM-DD); empty = date of the last change in the code. */
  updated: string;
}

export const EMPTY_PRIVACY: PrivacyInfo = { operator: '', contact: '', updated: '' };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\r/g, '').trim().slice(0, max) : '');

export function parsePrivacy(raw: unknown): PrivacyInfo {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const contact = text(r.contact, 120);
  const updated = text(r.updated, 10);
  return { operator: text(r.operator, 400), contact: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact) ? contact : '', updated: /^\d{4}-\d{2}-\d{2}$/.test(updated) ? updated : '' };
}

let INFO: PrivacyInfo = { ...EMPTY_PRIVACY };
export const privacyInfo = () => INFO;
export function setPrivacyInfo(p: PrivacyInfo): void {
  INFO = p;
}
