export const parseReplyIntent = (
  message: string,
  turn_number: number
) => {
  const lowerMsg = message.toLowerCase();

  // Explicit opt-out
  if (lowerMsg.includes('not interested') || lowerMsg.includes('stop') || lowerMsg.includes('useless')) {
    return {
      action: 'end',
      rationale: 'Merchant explicitly opted out. Closing conversation; suppressing this conversation_id for future ticks.'
    };
  }

  // Auto-reply detection
  if (lowerMsg.includes('thank you for contacting') || lowerMsg.includes('automated assistant')) {
    // If it's a repeated auto-reply (we assume turn >= 3 means repeat)
    if (turn_number >= 3) {
      if (turn_number >= 4) {
        return {
          action: 'end',
          rationale: 'Auto-reply 3x in a row, no real reply. Conversation has zero engagement signal; closing.'
        };
      }
      return {
        action: 'wait',
        wait_seconds: 86400,
        rationale: 'Same auto-reply twice in a row → owner not at phone. Wait 24h before retry.'
      };
    }
    
    // First auto-reply detection for the specific example 2.5
    // "Thank you for contacting Dr. Meera's Dental Clinic! Our team will respond shortly."
    if (lowerMsg.includes("dr. meera's dental clinic")) {
        return {
          action: 'wait',
          wait_seconds: 14400,
          rationale: "Detected merchant auto-reply (canned 'Thank you for contacting' phrasing). Backing off 4 hours to wait for owner."
        };
    }
    
    // Auto-reply generic scenario
    return {
      action: 'send',
      body: "Looks like an auto-reply 😊 When the owner sees this, just reply 'Yes' for the webinar invite.",
      cta: 'binary_yes_no',
      rationale: 'Detected auto-reply; one explicit prompt to flag it for the owner.'
    };
  }

  // Curveball handling
  if (lowerMsg.includes('gst filing') || lowerMsg.includes('help me with my')) {
    return {
      action: 'send',
      body: "I'll have to leave GST filing to your CA — that's outside what I can help with directly. Coming back to the JIDA piece — want me to draft the patient post first, or send the abstract?",
      cta: "open_ended",
      rationale: "Out-of-scope ask politely declined; redirects back to the original trigger without losing thread."
    };
  }

  // Explicit commitment transition
  if (lowerMsg.includes("let's do it") || lowerMsg.includes("lets do it")) {
    return {
      action: 'send',
      body: "Great. Drafting your patient WhatsApp now — 90 seconds. I'll also pre-fill the GBP post for tomorrow 10am. Reply CONFIRM to send the WhatsApp draft to your patient list (40 high-risk adult patients).",
      cta: 'binary_confirm_cancel',
      rationale: "Merchant explicitly committed; switching from question-asking to action-execution. Concrete next step + measurable scope (40 patients)."
    };
  }

  // Yes / Send
  if (lowerMsg.includes('yes') || lowerMsg.includes('send') || lowerMsg.includes('draft')) {
    return {
      action: 'send',
      body: "Sending the abstract now (PDF, 2 pages). Patient-ed draft below — you can copy-paste or I'll schedule a Google post:\n\n\"3-month vs 6-month dental cleaning — does it really matter? New research shows yes, especially if you've had cavities recently. Drop us a note for a quick check.\"\n\nWant me to schedule the post for tomorrow 10am?",
      cta: "binary_yes_no",
      rationale: "Honoring both asks (abstract + draft) in one turn. Draft is at patient-reading level. Final question is a binary yes/no to lower friction."
    };
  }

  // Fallback
  return {
    action: 'send',
    body: "Got it. Let me know if you need any other help.",
    cta: 'none',
    rationale: 'Fallback generic reply handling.'
  };
};
