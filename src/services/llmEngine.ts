import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Initialize the API using process.env
const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);

export interface LLMOutput {
  body: string;
  cta: string;
  rationale: string;
  send_as: string;
  conversation_id: string;
}

export const generateMessage = async (
  category: any,
  merchant: any,
  trigger: any,
  customer: any
): Promise<LLMOutput> => {
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing');
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          body: {
            type: SchemaType.STRING,
            description: 'The highly compelling WhatsApp message body. Must contain verifiable facts from the provided context only.'
          },
          cta: {
            type: SchemaType.STRING,
            description: 'CTA type: "binary_yes_no", "binary_confirm_cancel", "multi_choice_slot", "open_ended", or "none".'
          },
          rationale: {
            type: SchemaType.STRING,
            description: 'A 1-3 sentence explanation of WHY this message works — which compulsion levers were used, why this trigger matters now, and what data anchors the message.'
          },
          send_as: {
            type: SchemaType.STRING,
            description: '"vera" for merchant-facing messages, "merchant_on_behalf" for customer-facing messages.'
          },
          conversation_id: {
            type: SchemaType.STRING,
            description: 'A descriptive, decodable conversation ID like "conv_drmeera_research_W17" or "conv_priya_recall_nov".'
          }
        },
        required: ['body', 'cta', 'rationale', 'send_as', 'conversation_id']
      }
    }
  });

  const c = category?.payload || category || {};
  const m = merchant?.payload || merchant || {};
  const t = trigger?.payload || trigger || {};
  const tPayload = t.payload || {};
  const cust = customer?.payload || customer;

  // Build rich context strings
  const voiceSection = buildVoiceSection(c);
  const merchantSection = buildMerchantSection(m);
  const triggerSection = buildTriggerSection(t, tPayload);
  const customerSection = buildCustomerSection(cust);
  const digestSection = buildDigestSection(c, tPayload);
  const categoryExamples = getCategoryGuidance(c.slug);

  const prompt = `You are Vera, magicpin's expert AI merchant engagement assistant. You compose highly compelling WhatsApp messages.

=== CRITICAL RULES (VIOLATIONS = SCORE 0) ===
1. NEVER fabricate data. Use ONLY facts from the context below. Every number, date, percentage MUST come from the provided data.
2. NEVER include URLs — Meta rejects them.
3. NEVER use taboo vocabulary listed below.
4. ALWAYS use the merchant's owner_first_name with the correct salutation style for their category.
5. ALWAYS reference specific data from the trigger payload — this is WHY you're messaging NOW.
6. ALWAYS include at least 2 verifiable data points (numbers, dates, percentages from context).
7. Keep messages concise — 2-4 sentences max. WhatsApp messages should feel conversational, not like essays.
8. End with a single, low-friction CTA (one clear next step).

=== VOICE & TONE RULES ===
${voiceSection}

=== MERCHANT DATA ===
${merchantSection}

=== TRIGGER (WHY NOW) ===
${triggerSection}

=== RELEVANT DIGEST / CATEGORY INTEL ===
${digestSection}

=== CUSTOMER DATA ===
${customerSection}

=== COMPOSITION GUIDELINES ===
${categoryExamples}

=== COMPULSION LEVERS (use at least 2) ===
- PROOF: Cite verifiable numbers from the data (views, calls, percentages, member counts, dates)
- URGENCY: Time-sensitive window (deadline, seasonal, expiring offer)
- CURIOSITY: Tease insight that makes them want to learn more
- LOSS AVERSION: Show what they're losing/missing (competitor gains, customer churn, missed revenue)
- RECIPROCITY: Offer to do work for them ("Want me to draft X?", "I'll prepare Y")
- SOCIAL PROOF: Peer benchmarks, what similar merchants are doing
- LOW-FRICTION CTA: Make the ask tiny ("Reply YES", "Want me to draft it?")

=== SEND_AS RULES ===
- If customer_id is present (customer-facing message): send_as = "merchant_on_behalf"
- If no customer (merchant-facing message): send_as = "vera"

=== CONVERSATION_ID FORMAT ===
Generate a descriptive, decodable conversation ID like:
- "conv_drmeera_research_W17" (merchant research digest)
- "conv_priya_recall_nov" (customer recall)
- "conv_powerhouse_seasonal_dip" (merchant seasonal alert)

Compose the message now. Make it specific, data-rich, category-appropriate, and irresistibly engaging.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Failed to parse LLM response: ' + text);
  }
};

function buildVoiceSection(c: any): string {
  if (!c || !c.voice) return 'No category voice data available. Use a warm, professional tone.';
  
  const v = c.voice;
  let section = `Category: ${c.slug || 'unknown'} (${c.display_name || ''})
Tone: ${v.tone || 'professional'}
Register: ${v.register || 'respectful'}
Code-mix: ${v.code_mix || 'english'}
Salutation style: ${JSON.stringify(v.salutation_examples || [])}`;

  if (v.vocab_allowed?.length) {
    section += `\nDomain vocabulary to USE: ${v.vocab_allowed.join(', ')}`;
  }
  if (v.vocab_taboo?.length) {
    section += `\nTABOO words (NEVER use these): ${v.vocab_taboo.join(', ')}`;
  }
  if (v.tone_examples?.length) {
    section += `\nTone examples (match this register): ${v.tone_examples.join(' | ')}`;
  }
  return section;
}

function buildMerchantSection(m: any): string {
  if (!m || !m.identity) return 'No merchant data available.';

  const id = m.identity;
  let section = `Name: ${id.name || 'Unknown'}
Owner first name: ${id.owner_first_name || 'Unknown'}
City: ${id.city || '?'}, Locality: ${id.locality || '?'}
Languages: ${JSON.stringify(id.languages || [])}
Verified: ${id.verified ?? '?'}`;

  if (m.subscription) {
    section += `\nSubscription: ${m.subscription.status} (${m.subscription.plan || '?'}), ${m.subscription.days_remaining ?? '?'} days remaining`;
  }

  if (m.performance) {
    const p = m.performance;
    section += `\nPerformance (${p.window_days || 30}d): views=${p.views}, calls=${p.calls}, directions=${p.directions}, CTR=${p.ctr}, leads=${p.leads || '?'}`;
    if (p.delta_7d) {
      section += `\n7-day change: views ${formatPct(p.delta_7d.views_pct)}, calls ${formatPct(p.delta_7d.calls_pct)}`;
    }
  }

  if (m.offers?.length) {
    const activeOffers = m.offers.filter((o: any) => o.status === 'active');
    if (activeOffers.length) {
      section += `\nActive offers: ${activeOffers.map((o: any) => o.title).join(', ')}`;
    }
  }

  if (m.signals?.length) {
    section += `\nSignals: ${m.signals.join(', ')}`;
  }

  if (m.customer_aggregate) {
    const ca = m.customer_aggregate;
    section += `\nCustomer aggregate: ${JSON.stringify(ca)}`;
  }

  if (m.review_themes?.length) {
    section += `\nReview themes: ${m.review_themes.map((r: any) => `${r.theme} (${r.sentiment}, ${r.occurrences_30d}x in 30d${r.common_quote ? ': "' + r.common_quote + '"' : ''})`).join('; ')}`;
  }

  if (m.conversation_history?.length) {
    const lastConv = m.conversation_history[m.conversation_history.length - 1];
    section += `\nLast conversation: "${lastConv.body}" (${lastConv.engagement}, ${lastConv.ts})`;
  }

  return section;
}

function buildTriggerSection(t: any, tPayload: any): string {
  let section = `Trigger ID: ${t.id || 'unknown'}
Kind: ${t.kind || 'unknown'}
Source: ${t.source || 'unknown'}
Scope: ${t.scope || 'unknown'}
Urgency: ${t.urgency || '?'}/5
Merchant ID: ${t.merchant_id || '?'}
Customer ID: ${t.customer_id || 'none (merchant-facing)'}
Suppression key: ${t.suppression_key || '?'}`;

  if (Object.keys(tPayload).length > 0) {
    section += `\nTrigger payload (USE THIS DATA in your message): ${JSON.stringify(tPayload)}`;
  }

  return section;
}

function buildCustomerSection(cust: any): string {
  if (!cust) return 'No customer — this is a MERCHANT-FACING message. Address the merchant/owner directly as Vera.';

  const id = cust.identity || {};
  let section = `THIS IS A CUSTOMER-FACING MESSAGE. Send as merchant_on_behalf.
Customer name: ${id.name || 'Customer'}
Language preference: ${id.language_pref || 'english'}
Age band: ${id.age_band || 'unknown'}`;

  if (cust.relationship) {
    const r = cust.relationship;
    section += `\nRelationship: ${r.visits_total || '?'} visits, last visit ${r.last_visit || '?'}, lifetime value ₹${r.lifetime_value || '?'}`;
    if (r.services_received?.length) {
      section += `, services: ${r.services_received.slice(0, 5).join(', ')}`;
    }
    if (r.favourite_dish) section += `, favourite: ${r.favourite_dish}`;
    if (r.chronic_conditions?.length) section += `, conditions: ${r.chronic_conditions.join(', ')}`;
  }

  section += `\nState: ${cust.state || 'unknown'}`;

  if (cust.preferences) {
    section += `\nPreferences: ${JSON.stringify(cust.preferences)}`;
  }

  if (id.senior_citizen) section += `\nSENIOR CITIZEN — use respectful tone (Namaste, ji)`;
  if (id.language_pref === 'hi' || id.language_pref?.includes('hi')) {
    section += `\nUse Hindi or Hindi-English mix as appropriate for this customer.`;
  }

  return section;
}

function buildDigestSection(c: any, tPayload: any): string {
  if (!c) return 'No category digest available.';

  let section = '';

  // Include relevant digest items
  if (c.digest?.length) {
    const topItemId = tPayload.top_item_id || tPayload.digest_item_id || tPayload.alert_id;
    
    if (topItemId) {
      const matchingItem = c.digest.find((d: any) => d.id === topItemId);
      if (matchingItem) {
        section += `RELEVANT DIGEST ITEM (cite this source!):\n`;
        section += `  Title: ${matchingItem.title}\n`;
        section += `  Source: ${matchingItem.source}\n`;
        section += `  Summary: ${matchingItem.summary}\n`;
        if (matchingItem.trial_n) section += `  Trial size: ${matchingItem.trial_n} patients\n`;
        if (matchingItem.actionable) section += `  Actionable: ${matchingItem.actionable}\n`;
      }
    }

    // Include other recent digest items for context
    const otherItems = c.digest.filter((d: any) => d.id !== topItemId).slice(0, 2);
    if (otherItems.length) {
      section += `\nOther category intel: ${otherItems.map((d: any) => `${d.title} (${d.source})`).join('; ')}`;
    }
  }

  // Peer stats
  if (c.peer_stats) {
    section += `\nPeer benchmarks: avg CTR=${c.peer_stats.avg_ctr}, avg views=${c.peer_stats.avg_views_30d}, avg calls=${c.peer_stats.avg_calls_30d}`;
    if (c.peer_stats.retention_6mo_pct) section += `, retention=${(c.peer_stats.retention_6mo_pct * 100).toFixed(0)}%`;
    if (c.peer_stats.retention_3mo_pct) section += `, retention=${(c.peer_stats.retention_3mo_pct * 100).toFixed(0)}%`;
  }

  // Seasonal beats
  if (c.seasonal_beats?.length) {
    section += `\nSeasonal context: ${c.seasonal_beats.map((s: any) => `${s.month_range}: ${s.note}`).join('; ')}`;
  }

  // Trend signals
  if (c.trend_signals?.length) {
    section += `\nTrend signals: ${c.trend_signals.map((t: any) => `"${t.query}" ${t.delta_yoy > 0 ? '+' : ''}${(t.delta_yoy * 100).toFixed(0)}% YoY`).join(', ')}`;
  }

  // Offer catalog
  if (c.offer_catalog?.length) {
    section += `\nCategory offer catalog: ${c.offer_catalog.slice(0, 5).map((o: any) => o.title).join(', ')}`;
  }

  return section || 'No digest data available.';
}

function getCategoryGuidance(slug: string): string {
  const guidance: Record<string, string> = {
    'dentists': `DENTIST CATEGORY RULES:
- Use "Dr. {first_name}" salutation
- Clinical peer-to-peer tone — you're speaking as a colleague, not a marketer
- Can use technical terms: fluoride varnish, caries, periodontal, scaling, OPG, IOPA, RCT
- ALWAYS cite sources when mentioning research (journal name + page/date)
- Reference their specific patient cohorts (high-risk adults, pediatric, etc.) from customer_aggregate
- For compliance/regulation triggers: be precise with dates, deadlines, specific requirements
- For research digests: mention trial size, key finding, actionable implication`,

    'salons': `SALON CATEGORY RULES:
- Use "Hi {first_name}" — warm, friendly, practical tone
- Think fellow beauty business owner, not corporate consultant
- Can reference: balayage, keratin, smoothening, hair spa, bridal packages
- For bridal triggers: calculate days-to-wedding, reference skin-prep timelines
- For curious_ask: ask what's in-demand THIS WEEK, offer to create content from the answer
- Reference their specific stylist strengths or service mix from review themes
- Use emojis sparingly but appropriately (💍 for bridal, 💇 for hair)`,

    'restaurants': `RESTAURANT CATEGORY RULES:
- Operator-to-operator voice — use industry terms: covers, AOV, footfall, table turnover
- For IPL triggers: differentiate weeknight (good for promos) vs weekend (bad — people watch at home)
- Saturday IPL = -12% covers — RECOMMEND AGAINST match-night promos on weekends
- Reference existing active offers (BOGO, thali deals) rather than inventing new ones
- For planning intents: draft a complete, ready-to-use artifact (menu, pricing tiers)
- For milestone triggers: help them cross the finish line with a specific ask to recent visitors`,

    'gyms': `GYM CATEGORY RULES:
- Coach-to-operator tone — energetic, disciplined, data-driven
- For seasonal dips (Apr-Jun): REFRAME as normal, recommend skipping ad spend, focusing retention
- Reference specific member counts from customer_aggregate
- For lapsed customers: NO SHAME, NO GUILT — warm "it happens to everyone" framing
- Mention specific class times, program names from offers
- Use "no commitment, no auto-charge" type reassurances for winback
- For kids programs: reference parent's name if communicating via parent`,

    'pharmacies': `PHARMACY CATEGORY RULES:
- Trustworthy, precise tone — neighbourhood pharmacist register
- For supply alerts: cite EXACT batch numbers, manufacturer, risk assessment
- For chronic refills: list ALL molecule names, exact dates, calculate savings
- For senior citizens: use "Namaste", "ji" suffix, respectful Hindi tone
- Reference their chronic-Rx customer count from customer_aggregate
- For compliance: cite regulatory body, circular number, deadline
- For seasonal demand: give specific shelf rearrangement recommendations`
  };

  return guidance[slug] || `Use a professional, warm tone appropriate for ${slug}. Reference specific data from the context.`;
}

function formatPct(v: any): string {
  if (v === undefined || v === null) return '?';
  const pct = (v * 100).toFixed(0);
  return v >= 0 ? `+${pct}%` : `${pct}%`;
}
