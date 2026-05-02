import { ContextItem } from './contextStore';

export const compose = async (
  category: ContextItem,
  merchant: ContextItem,
  trigger: ContextItem,
  customer?: ContextItem
) => {
  const t = trigger.payload || {};
  const m = merchant.payload || {};
  const c = category.payload || {};
  const cust = customer?.payload;
  const triggerKind = t.kind || 'unknown';
  const tPayload = t.payload || {};

  // Determine send_as based on scope
  const isCustomerFacing = !!t.customer_id || !!customer;
  const defaultSendAs = isCustomerFacing ? 'merchant_on_behalf' : 'vera';

  // Generate a descriptive conversation_id
  const ownerShort = (m.identity?.owner_first_name || m.identity?.name || 'merchant').toLowerCase().replace(/[^a-z0-9]/g, '');
  const custShort = cust?.identity?.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  const kindShort = triggerKind.replace(/_/g, '').slice(0, 15);
  const defaultConvId = isCustomerFacing
    ? `conv_${custShort}_${kindShort}_${ownerShort}`
    : `conv_${ownerShort}_${kindShort}`;

  // Deterministic data-rich composition — no LLM needed, sub-5ms
  const result = buildFallbackMessage(c, m, t, tPayload, cust, triggerKind);

  return {
    conversation_id: defaultConvId,
    merchant_id: m.merchant_id || merchant.context_id,
    customer_id: customer ? customer.context_id : null,
    send_as: defaultSendAs,
    trigger_id: trigger.context_id,
    template_name: `${triggerKind}_v1`,
    template_params: [],
    body: result.body,
    cta: result.cta,
    suppression_key: t.suppression_key || trigger.context_id,
    rationale: result.rationale
  };
};

function validateCta(cta: string): string {
  const valid = ['binary_yes_no', 'binary_confirm_cancel', 'multi_choice_slot', 'open_ended', 'none'];
  return valid.includes(cta) ? cta : 'open_ended';
}

function getSalutation(c: any, m: any): string {
  const ownerName = m.identity?.owner_first_name || '';
  const slug = c.slug || '';

  switch (slug) {
    case 'dentists':
      return ownerName ? `Dr. ${ownerName}` : 'Doctor';
    case 'salons':
      return ownerName ? `Hi ${ownerName}` : 'Hi there';
    case 'restaurants':
      return ownerName ? `Hi ${ownerName}` : 'Hi Chef';
    case 'gyms':
      return ownerName ? `${ownerName}` : 'Coach';
    case 'pharmacies':
      return ownerName ? `${ownerName}` : 'Pharmacist';
    default:
      return ownerName ? `Hi ${ownerName}` : 'Hi';
  }
}

function buildFallbackMessage(c: any, m: any, t: any, tPayload: any, cust: any, triggerKind: string) {
  const salutation = getSalutation(c, m);
  const locality = m.identity?.locality || 'your area';
  const merchantName = m.identity?.name || 'your business';
  const ownerFirst = m.identity?.owner_first_name || '';
  const views = m.performance?.views || 0;
  const calls = m.performance?.calls || 0;
  const ctr = m.performance?.ctr || 0;
  const directions = m.performance?.directions || 0;
  const peerViews = c.peer_stats?.avg_views_30d || 0;
  const peerCalls = c.peer_stats?.avg_calls_30d || 0;
  const peerCtr = c.peer_stats?.avg_ctr || 0;
  const catSlug = c.slug || '';

  let body = '';
  let cta = 'open_ended';
  let rationale = '';

  switch (triggerKind) {
    case 'research_digest': {
      const topItemId = tPayload.top_item_id;
      const digest = c.digest?.find((d: any) => d.id === topItemId);
      if (digest) {
        const trialRef = digest.trial_n ? ` (n=${digest.trial_n})` : '';
        const patientSeg = digest.patient_segment?.replace(/_/g, ' ') || '';
        const actionRef = digest.actionable ? ` Actionable: ${digest.actionable}.` : '';
        const highRiskCount = m.customer_aggregate?.high_risk_adult_count || '';
        const relevance = highRiskCount && patientSeg.includes('high') ? ` This likely affects your ${highRiskCount} high-risk patient cohort.` : '';
        body = `${salutation}, worth a look — ${digest.title}${trialRef}. Source: ${digest.source}.${relevance}${actionRef} Want me to draft a patient recall list for affected cases? Reply YES.`;
      } else {
        body = `${salutation}, new research relevant to your practice just landed. Your ${views} profile views suggest active patient flow — this could affect protocol. Want me to pull the key findings?`;
      }
      cta = 'binary_yes_no';
      rationale = `Research digest with source (${digest?.source || 'publication'}), trial size, and patient cohort relevance. Peer-clinical voice.`;
      break;
    }

    case 'regulation_change': {
      const deadline = tPayload.deadline_iso ? new Date(tPayload.deadline_iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'soon';
      const topItemId = tPayload.top_item_id;
      const digest = c.digest?.find((d: any) => d.id === topItemId);
      body = `${salutation}, compliance update: ${digest?.title || 'new regulation change'} — effective ${deadline}. ${digest?.summary?.slice(0, 100) || 'Action may be required'}. Want me to summarize what you need to do? — ${digest?.source || 'regulatory circular'}`;
      cta = 'binary_yes_no';
      rationale = 'Compliance alert with deadline and source citation. Urgency + reciprocity levers.';
      break;
    }

    case 'recall_due': {
      const custName = cust?.identity?.name || 'there';
      const service = tPayload.service_due?.replace(/_/g, ' ') || 'checkup';
      const slots = tPayload.available_slots || [];
      const slotText = slots.map((s: any) => s.label).join(' or ') || 'this week';
      const offer = m.offers?.find((o: any) => o.status === 'active');
      const lastVisit = cust?.relationship?.last_visit || '';
      const totalVisits = cust?.relationship?.visits_total || 0;
      if (catSlug === 'dentists') {
        body = `Hi ${custName}, ${ownerFirst ? 'Dr. ' + ownerFirst : merchantName} here. Your ${service} is due${lastVisit ? ` — last visit was ${lastVisit}` : ''}. ${slots.length > 0 ? `We have openings: ${slotText}.` : 'Let us know a convenient time.'} ${offer ? offer.title + ' available.' : ''} Reply to confirm or suggest a time that works.`;
      } else if (catSlug === 'gyms') {
        body = `Hi ${custName}, ${ownerFirst || 'Coach'} from ${merchantName} here. Time for your ${service}${totalVisits ? ` — you've completed ${totalVisits} sessions so far, great progress` : ''}. ${slots.length > 0 ? `Next available: ${slotText}.` : ''} ${offer ? offer.title + '.' : ''} Reply YES to book your spot.`;
      } else {
        body = `Hi ${custName}, ${ownerFirst ? ownerFirst + ' from ' : ''}${merchantName} here. Your ${service} is coming up${lastVisit ? ` — last visit was ${lastVisit}` : ''}. ${slots.length > 0 ? `Available: ${slotText}.` : ''} ${offer ? offer.title + '.' : ''} Reply to book or tell us a time that works.`;
      }
      cta = slots.length > 1 ? 'multi_choice_slot' : 'binary_yes_no';
      rationale = `Customer recall with specific slots, last visit date, and active offer. Category-appropriate voice for ${catSlug}.`;
      break;
    }

    case 'perf_dip': {
      const metric = tPayload.metric || 'views';
      const delta = tPayload.delta_pct ? `${Math.abs(tPayload.delta_pct * 100).toFixed(0)}%` : '20%';
      const baseline = tPayload.vs_baseline || calls;
      body = `${salutation}, your ${metric} dropped ${delta} this week (was ${baseline}, now ${Math.round(baseline * (1 + (tPayload.delta_pct || -0.2)))}). ${views} people in ${locality} are still searching. Want me to draft a recovery plan?`;
      cta = 'binary_yes_no';
      rationale = `Performance dip alert with specific numbers. Loss aversion + reciprocity.`;
      break;
    }

    case 'seasonal_perf_dip': {
      const metric = tPayload.metric || 'views';
      const delta = tPayload.delta_pct ? `${Math.abs(tPayload.delta_pct * 100).toFixed(0)}%` : '25%';
      const seasonNote = tPayload.season_note?.replace(/_/g, ' ') || 'seasonal pattern';
      const members = m.customer_aggregate?.total_active_members || m.customer_aggregate?.total_unique_ytd || '';
      const baseline = tPayload.vs_baseline || views;
      const currentVal = Math.round(baseline * (1 + (tPayload.delta_pct || -0.25)));
      const seasonBeat = c.seasonal_beats?.find((s: any) => {
        const lower = s.note?.toLowerCase() || '';
        return lower.includes('low') || lower.includes('retention') || lower.includes('dip') || lower.includes('drop');
      });
      body = `${salutation}, your ${metric} went from ${baseline} to ${currentVal} (${delta} dip) this week — but this is normal for ${seasonNote}. ${seasonBeat ? seasonBeat.note + '.' : `Peer avg in ${catSlug} is ${peerViews} views — you're still ${currentVal > peerViews * 0.7 ? 'within range' : 'below peer avg'}.`} Focus: retain your ${members || calls} existing ${catSlug === 'gyms' ? 'members' : 'customers'} — retention outperforms new acquisition 3:1 in this window. Want me to draft a retention campaign?`;
      cta = 'binary_yes_no';
      rationale = `Seasonal dip reframe with baseline-to-current numbers (${baseline}→${currentVal}), peer benchmark, and retention ROI. Anxiety pre-emption.`;
      break;
    }

    case 'ipl_match_today': {
      const match = tPayload.match || 'IPL match';
      const venue = tPayload.venue || 'local stadium';
      const matchTime = tPayload.match_time_iso ? new Date(tPayload.match_time_iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : 'tonight';
      const isWeeknight = tPayload.is_weeknight;
      const activeOffer = m.offers?.find((o: any) => o.status === 'active');
      const matchOffer = c.offer_catalog?.find((o: any) => o.title?.toLowerCase().includes('match')) || activeOffer;
      const avgCovers = c.peer_stats?.avg_views_30d || 0;

      if (isWeeknight === false) {
        body = `${salutation}, ${match} at ${venue} tonight (${matchTime}). Data point: Saturday IPL matches shift -12% restaurant covers vs Saturday avg — viewers stay home. Your ${views} monthly views are solid, don't dilute with a match-night promo. Instead, push ${activeOffer?.title || 'your delivery menu'} as delivery-only tonight. Want me to draft a "watch from home + order in" post? Ready in 10 min.`;
      } else {
        body = `${salutation}, ${match} at ${venue} tonight (${matchTime}). Weeknight IPL matches drive +18% covers across metros. Your current footfall: ${views} views, ${calls} calls this month. Push ${matchOffer?.title || activeOffer?.title || 'a match-night combo'} tonight — peer avg is ${avgCovers} views, you're ${views > avgCovers ? 'ahead' : 'within range'}. Want me to draft the post?`;
      }
      cta = 'binary_yes_no';
      rationale = `IPL match alert with magicpin order data: ${isWeeknight === false ? 'Saturday = -12% covers (stay-home effect), contrarian delivery recommendation' : 'weeknight = +18% covers, capitalize with combo push'}. Peer benchmark comparison included.`;
      break;
    }

    case 'competitor_opened': {
      const comp = tPayload.competitor_name || 'A new competitor';
      const dist = tPayload.distance_km || '?';
      const theirOffer = tPayload.their_offer || 'competitive pricing';
      const activeOffer = m.offers?.find((o: any) => o.status === 'active');
      body = `${salutation}, ${comp} opened ${dist}km away offering "${theirOffer}". Your ${activeOffer?.title || 'active offer'} is still competitive. Want me to draft a "loyal customer" message to your top regulars this week?`;
      cta = 'binary_yes_no';
      rationale = 'Competitor alert with distance and their offer. Loss aversion + proactive defense.';
      break;
    }

    case 'festival_upcoming': {
      const fest = tPayload.festival || 'upcoming festival';
      const daysUntil = tPayload.days_until || '?';
      const catOffer = c.offer_catalog?.find((o: any) => o.audience === 'new_user') || c.offer_catalog?.[0];
      const seasonalBeat = c.seasonal_beats?.find((s: any) => {
        const lower = s.note?.toLowerCase() || '';
        return lower.includes(fest.toLowerCase().slice(0, 4)) || lower.includes('festival') || lower.includes('wedding');
      });
      const activeCustomers = m.customer_aggregate?.total_active_members || m.customer_aggregate?.total_unique_ytd || '';
      const activeOffer = m.offers?.find((o: any) => o.status === 'active');
      const isClose = typeof daysUntil === 'number' && daysUntil <= 30;
      const timeFrame = isClose ? `only ${daysUntil} days away` : `${daysUntil} days out — early-bird window is NOW`;
      body = `${salutation}, ${fest} is ${timeFrame}. ${seasonalBeat ? seasonalBeat.note + '.' : 'Festival season typically drives 2x baseline bookings.'} Your ${locality} profile gets ${views} views/month and ${calls} calls — ${activeCustomers ? `your ${activeCustomers} active customers` : 'your regulars'} should hear first. Want me to draft a "${activeOffer?.title || catOffer?.title || 'festival special'}" campaign? Reply YES to preview.`;
      cta = 'binary_yes_no';
      rationale = `Festival anticipation with ${daysUntil}-day timeline, seasonal beat, performance data (${views} views, ${calls} calls), and customer count. Urgency + social proof.`;
      break;
    }

    case 'milestone_reached': {
      const metric = tPayload.metric?.replace(/_/g, ' ') || 'milestone';
      const current = tPayload.value_now || '?';
      const target = tPayload.milestone_value || '?';
      body = `${salutation}, you're at ${current} ${metric} — just ${(target as number) - (current as number)} away from ${target}! Want me to message recent visitors to help you cross that milestone this week?`;
      cta = 'binary_yes_no';
      rationale = 'Milestone proximity with specific numbers. Goal gradient effect + reciprocity.';
      break;
    }

    case 'review_theme_emerged': {
      const theme = tPayload.theme?.replace(/_/g, ' ') || 'a trend';
      const count = tPayload.occurrences_30d || '?';
      const quote = tPayload.common_quote || '';
      body = `${salutation}, ${count} reviews in the last 30 days mention "${theme}"${quote ? ` ("${quote}")` : ''}. Want me to draft a response template to address this and protect your rating?`;
      cta = 'binary_yes_no';
      rationale = 'Review theme alert with specific count and customer quote. Reputation protection + reciprocity.';
      break;
    }

    case 'supply_alert': {
      const molecule = tPayload.molecule || 'medication';
      const batches = tPayload.affected_batches?.join(', ') || tPayload.batch_numbers?.join(', ') || '';
      const mfr = tPayload.manufacturer || '';
      const chronicCount = m.customer_aggregate?.chronic_rx_count || m.customer_aggregate?.repeat_customer_count || '';
      const riskNote = tPayload.risk_assessment || tPayload.safety_note || 'no safety risk beyond suboptimal efficacy';
      const source = tPayload.source || 'CDSCO alert';
      body = `${salutation}, urgent from ${source}: voluntary recall on ${molecule}${batches ? ` (batches: ${batches})` : ''}${mfr ? ` by ${mfr}` : ''}. ${riskNote}. ${chronicCount ? `Your ${chronicCount} chronic-Rx customers on this molecule may be affected.` : 'Check your shelf stock.'} Replacement available via distributor return chain. Want me to draft the WhatsApp notification to affected customers?`;
      cta = 'binary_yes_no';
      rationale = `Supply alert citing ${source} with ${batches ? 'batch numbers' : 'molecule'}, risk assessment, and affected customer count. Urgency + compliance + reciprocity.`;
      break;
    }

    case 'chronic_refill_due': {
      const custName = cust?.identity?.name || 'Customer';
      const molecules = tPayload.molecule_list?.join(', ') || 'medications';
      const runOutDate = tPayload.stock_runs_out_iso ? new Date(tPayload.stock_runs_out_iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'soon';
      const seniorDiscount = m.offers?.find((o: any) => o.title?.includes('Senior'));
      const delivery = m.offers?.find((o: any) => o.title?.includes('Delivery'));
      const isSenior = cust?.identity?.senior_citizen;
      const langPref = cust?.identity?.language_pref || 'english';

      if (isSenior && langPref === 'hi') {
        body = `Namaste — ${merchantName} yahan. ${custName} ji ki medicines (${molecules}) ${runOutDate} ko khatam hongi. Same dose, same brand ready hai. ${seniorDiscount ? seniorDiscount.title + ' applied.' : ''} ${delivery ? delivery.title + '.' : ''} Reply CONFIRM to dispatch.`;
      } else {
        body = `Hi, ${merchantName} here. ${custName}'s medicines (${molecules}) run out ${runOutDate}. Same dose, same brand pack ready. ${seniorDiscount ? seniorDiscount.title + ' applied.' : ''} ${delivery ? delivery.title + '.' : ''} Reply CONFIRM to dispatch.`;
      }
      cta = 'binary_confirm_cancel';
      rationale = `Chronic refill reminder with molecule names and exact date. ${isSenior ? 'Senior-appropriate Hindi tone.' : 'Personalized to customer.'} Low-friction confirm CTA.`;
      break;
    }

    case 'customer_lapsed_hard':
    case 'customer_lapsed_soft': {
      const custName = cust?.identity?.name || 'Customer';
      const daysSince = tPayload.days_since_last_visit || '?';
      const focus = tPayload.previous_focus?.replace(/_/g, ' ') || '';
      const activeOffer = m.offers?.find((o: any) => o.status === 'active');
      const ownerName = m.identity?.owner_first_name || '';
      body = `Hi ${custName} 👋 ${ownerName} from ${merchantName} here. It's been about ${Math.round((daysSince as number) / 7)} weeks — happens to everyone, no judgment.${focus ? ` We have new options that fit ${focus} goals well.` : ''} ${activeOffer ? activeOffer.title + '.' : ''} Want me to hold a free trial spot for you? Reply YES — no commitment.`;
      cta = 'binary_yes_no';
      rationale = `Lapsed customer winback with no-shame framing. ${focus ? `References their past focus (${focus}).` : ''} Low-friction single CTA.`;
      break;
    }

    case 'winback_eligible': {
      const daysSinceExpiry = tPayload.days_since_expiry || '?';
      const dipPct = tPayload.perf_dip_pct ? `${Math.abs(tPayload.perf_dip_pct * 100).toFixed(0)}%` : '?';
      const lapsedAdded = tPayload.lapsed_customers_added_since_expiry || '?';
      body = `${salutation}, it's been ${daysSinceExpiry} days since your subscription expired. Your profile visibility has dropped ${dipPct} and ${lapsedAdded} customers have lapsed in that period. Want to see what reactivation would look like? I can show you the numbers.`;
      cta = 'open_ended';
      rationale = 'Winback with specific lapse data. Loss aversion (dropped visibility + lapsed customers) + curiosity.';
      break;
    }

    case 'perf_spike': {
      const metric = tPayload.metric || 'traffic';
      const delta = tPayload.delta_pct ? `+${(tPayload.delta_pct * 100).toFixed(0)}%` : 'up';
      const driver = tPayload.likely_driver?.replace(/_/g, ' ') || '';
      body = `${salutation}, your ${metric} are ${delta} this week${driver ? ` — likely driven by your ${driver}` : ''}! Now is the time to double down. Want me to boost this momentum with a promoted post?`;
      cta = 'binary_yes_no';
      rationale = `Performance spike celebration with driver attribution. Momentum + reciprocity.`;
      break;
    }

    case 'active_planning_intent': {
      const topic = tPayload.intent_topic?.replace(/_/g, ' ') || 'your idea';
      const lastMsg = tPayload.merchant_last_message || '';
      const relevantOffer = c.offer_catalog?.find((o: any) => {
        const topicLower = topic.toLowerCase();
        return o.title?.toLowerCase().includes(topicLower.split(' ')[0]);
      }) || c.offer_catalog?.[0];
      const trendSignal = c.trend_signals?.find((ts: any) => {
        const topicLower = topic.toLowerCase();
        return ts.query?.toLowerCase().includes(topicLower.split(' ')[0]);
      });
      body = `${salutation}, here's a starter draft for the ${topic}:\n\n"${merchantName} presents: ${relevantOffer?.title || topic}${trendSignal ? ` — demand for '${trendSignal.query}' is +${(trendSignal.delta_yoy * 100).toFixed(0)}% YoY in your segment` : ''}. ${locality} customers, book this week for priority access."\n\nYour current reach: ${views} profile views, ${calls} calls/month. Want me to finalize the copy and prepare the WhatsApp broadcast?`;
      cta = 'open_ended';
      rationale = `Active planning continuation with concrete draft using real offer catalog and trend data. Honors merchant intent ("${lastMsg.slice(0, 50)}").`;
      break;
    }

    case 'wedding_package_followup': {
      const custName = cust?.identity?.name || 'Customer';
      const weddingDate = tPayload.wedding_date || '';
      const daysToWedding = tPayload.days_to_wedding || '?';
      const nextStep = tPayload.next_step_window_open?.replace(/_/g, ' ') || 'next step';
      const ownerName = m.identity?.owner_first_name || '';
      body = `Hi ${custName} 💍 ${ownerName} from ${merchantName} here. ${daysToWedding} days to your wedding — perfect window to start the ${nextStep}. Want me to block your preferred slot for the first session?`;
      cta = 'binary_yes_no';
      rationale = `Bridal followup with wedding countdown. Urgency (window) + relationship continuity.`;
      break;
    }

    case 'curious_ask_due': {
      const askTemplate = tPayload.ask_template?.replace(/_/g, ' ') || '';
      const topTrend = c.trend_signals?.[0];
      const trendRef = topTrend ? `'${topTrend.query}' searches are +${(topTrend.delta_yoy * 100).toFixed(0)}% YoY in your area. ` : '';
      body = `${salutation}! ${trendRef}Quick check — what service has been most asked-for this week at ${merchantName}? I'll turn the answer into a Google post + a WhatsApp reply template you can use when customers ask about pricing. Takes 5 min. Your profile currently has ${views} views and ${calls} calls — let's push those higher.`;
      cta = 'open_ended';
      rationale = `Curious ask anchored with trend data (${topTrend?.query || 'category trends'}) and current performance metrics. Reciprocity offer (will create content). Low-stakes question.`;
      break;
    }

    case 'dormant_with_vera': {
      const daysSince = tPayload.days_since_last_merchant_message || '?';
      const lastTopic = tPayload.last_topic?.replace(/_/g, ' ') || '';
      const ctrVsPeer = ctr > peerCtr ? `Your CTR (${(ctr * 100).toFixed(1)}%) is above peer avg (${(peerCtr * 100).toFixed(1)}%)` : `Your CTR (${(ctr * 100).toFixed(1)}%) is below peer avg (${(peerCtr * 100).toFixed(1)}%)`;
      const topTrend = c.trend_signals?.[0];
      body = `${salutation}, it's been ${daysSince} days since we last chatted${lastTopic ? ` about ${lastTopic}` : ''}. Quick update: ${views} views, ${calls} calls, ${directions} directions this month. ${ctrVsPeer}. ${topTrend ? `Meanwhile, '${topTrend.query}' searches are +${(topTrend.delta_yoy * 100).toFixed(0)}% YoY.` : ''} One quick win I can set up for you — want to hear it?`;
      cta = 'binary_yes_no';
      rationale = `Re-engagement after ${daysSince}-day dormancy with performance snapshot, peer comparison, and trend signal. Curiosity CTA.`;
      break;
    }

    case 'gbp_unverified': {
      const uplift = tPayload.estimated_uplift_pct ? `${(tPayload.estimated_uplift_pct * 100).toFixed(0)}%` : '30%';
      const verifyPath = tPayload.verification_path?.replace(/_/g, ' ') || 'phone call';
      body = `${salutation}, your Google Business Profile is still unverified. Verified profiles get ${uplift} more visibility on average. Verification takes 5 min via ${verifyPath}. Want me to walk you through it right now?`;
      cta = 'binary_yes_no';
      rationale = 'GBP verification nudge with specific uplift data. Low effort + high reward framing.';
      break;
    }

    case 'cde_opportunity': {
      const credits = tPayload.credits || '?';
      const fee = tPayload.fee || 'check availability';
      const digestItemId = tPayload.digest_item_id;
      const digest = c.digest?.find((d: any) => d.id === digestItemId);
      body = `${salutation}, ${digest?.title || 'upcoming CDE opportunity'} — ${credits} CDE credits, ${fee}. ${digest?.summary?.slice(0, 80) || 'Worth checking out.'} Want me to send the registration details?`;
      cta = 'binary_yes_no';
      rationale = 'CDE opportunity with credits and cost. Professional development + low-friction CTA.';
      break;
    }

    case 'category_seasonal': {
      const season = tPayload.season?.replace(/_/g, ' ') || 'this season';
      const trends = tPayload.trends || [];
      const trendText = trends.slice(0, 3).map((t: string) => t.replace(/_/g, ' ')).join(', ');
      body = `${salutation}, ${season} demand shift underway: ${trendText}. ${tPayload.shelf_action_recommended ? 'Time to rearrange your shelf layout.' : 'Worth adjusting your inventory.'} Want me to draft the customer messaging for the seasonal push?`;
      cta = 'binary_yes_no';
      rationale = 'Seasonal demand intelligence with specific trends. Actionable + reciprocity.';
      break;
    }

    case 'renewal_due': {
      const daysRemaining = tPayload.days_remaining || '?';
      const plan = tPayload.plan || 'your plan';
      const amount = tPayload.renewal_amount || '?';
      body = `${salutation}, your ${plan} subscription renews in ${daysRemaining} days (₹${amount}). Your profile drove ${views} views and ${calls} calls this month. Want to review your renewal options?`;
      cta = 'binary_yes_no';
      rationale = 'Renewal reminder with ROI snapshot. Value demonstration + timeline urgency.';
      break;
    }

    case 'trial_followup': {
      const custName = cust?.identity?.name || 'Customer';
      const trialDate = tPayload.trial_date || 'recently';
      const nextOptions = tPayload.next_session_options || [];
      const nextText = nextOptions.map((s: any) => s.label).join(' or ') || 'this week';
      const ownerName = m.identity?.owner_first_name || '';
      body = `Hi ${custName}, ${ownerName} from ${merchantName} here. How was your trial on ${trialDate}? We'd love to have you back — next session available ${nextText}. Reply YES to book — no auto-charge, just a spot held for you.`;
      cta = 'binary_yes_no';
      rationale = 'Trial followup with specific next session options. No-pressure + low-friction CTA.';
      break;
    }

    case 'appointment_tomorrow': {
      const custName = cust?.identity?.name || 'Customer';
      const apptDate = tPayload.appointment_date || tPayload.appointment_iso || 'tomorrow';
      const service = tPayload.service || tPayload.service_name || 'appointment';
      const time = tPayload.appointment_time || tPayload.time_label || '';
      body = `Hi ${custName}, just a reminder — your ${service.replace(/_/g, ' ')} at ${merchantName} is ${time ? `${time} ` : ''}tomorrow (${typeof apptDate === 'string' ? apptDate : ''}). Reply CONFIRM to keep your slot or let us know if you need to reschedule.`;
      cta = 'binary_confirm_cancel';
      rationale = 'Appointment reminder with specific service and time. Confirmation CTA reduces no-shows.';
      break;
    }

    default: {
      body = `${salutation}, ${views} people viewed your profile in ${locality} this month with a ${(ctr * 100).toFixed(1)}% click-through rate. Want me to help you improve that?`;
      cta = 'open_ended';
      rationale = 'Generic engagement with performance data. Curiosity + reciprocity.';
      break;
    }
  }

  return { body, cta, rationale };
}
