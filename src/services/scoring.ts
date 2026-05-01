import { ContextItem } from './contextStore';
import { isSuppressed } from './suppression';

export const scoreTrigger = (
  trigger: ContextItem,
  merchant: ContextItem | undefined,
  category: ContextItem | undefined,
  nowMs: number = Date.now()
): number => {
  const p = trigger.payload;
  let score = 0;

  // Check if missing required merchant/category
  if (!merchant || !category) return -1;
  
  // Check if expired
  if (p.expires_at) {
    const expiresAt = new Date(p.expires_at).getTime();
    if (expiresAt <= nowMs) return -1;
  }

  // Check if suppressed
  if (p.suppression_key && isSuppressed(p.suppression_key, nowMs)) {
    return -1;
  }

  // Base score
  score += (p.urgency || 1) * 5;

  // Merchant performance penalty/bonus
  if (merchant.payload?.signals && Array.isArray(merchant.payload.signals)) {
    const signals = merchant.payload.signals as string[];
    if (signals.some(s => s.includes('ctr_below_peer') || s.includes('stale'))) {
      score += 3;
    }
  }

  // Relevant offer
  if (merchant.payload?.offers?.some((o: any) => o.status === 'active')) {
    score += 2;
  }

  // Fresh trigger
  if (trigger.delivered_at) {
    const deliveredAtMs = new Date(trigger.delivered_at).getTime();
    if (nowMs - deliveredAtMs < 3600 * 1000) { // within last hour
      score += 2;
    }
  }

  return score;
};
