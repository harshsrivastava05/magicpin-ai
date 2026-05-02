import { getContext } from './contextStore';
import { scoreTrigger } from './scoring';
import { compose } from './composeEngine';
import { suppress } from './suppression';

export const processTick = async (nowIso: string, availableTriggers: string[]) => {
  const nowMs = new Date(nowIso).getTime();
  const scoredTriggers = [];

  for (const triggerId of availableTriggers) {
    const trigger = getContext('trigger', triggerId);
    if (!trigger) continue;

    const payload = trigger.payload;
    if (!payload || !payload.merchant_id) continue;

    const merchant = getContext('merchant', payload.merchant_id);
    if (!merchant || !merchant.payload) continue;

    const categorySlug = merchant.payload.category_slug || payload.payload?.category;
    if (!categorySlug) continue;

    const category = getContext('category', categorySlug);
    if (!category) continue;

    let customer;
    if (payload.customer_id) {
      customer = getContext('customer', payload.customer_id);
    }

    const score = scoreTrigger(trigger, merchant, category, nowMs);
    if (score >= 0) {
      scoredTriggers.push({
        trigger,
        merchant,
        category,
        customer,
        score
      });
    }
  }

  // Sort descending by score
  scoredTriggers.sort((a, b) => b.score - a.score);

  // Take top 5 to avoid LLM rate limits on concurrent requests
  const selected = scoredTriggers.slice(0, 5);
  
  // Compose actions simultaneously to save time
  const composePromises = selected.map(item => compose(item.category, item.merchant, item.trigger, item.customer));
  const actions = await Promise.all(composePromises);

  for (const action of actions) {
    // Mark as suppressed
    const supKey = action.suppression_key;
    if (supKey) {
      // For testing, just put a generic 24h suppression
      suppress(supKey, 24 * 3600, nowMs);
    }
  }

  return { actions };
};
