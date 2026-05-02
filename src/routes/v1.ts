import { Router } from 'express';
import { z } from 'zod';
import { getCounts, upsertContext, Scope } from '../services/contextStore';
import { processTick } from '../services/tickEngine';
import { parseReplyIntent } from '../services/replyEngine';

export const v1Router = Router();

const uptimeStart = Date.now();

v1Router.get('/healthz', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.floor((Date.now() - uptimeStart) / 1000),
    contexts_loaded: getCounts()
  });
});

v1Router.get('/metadata', (req, res) => {
  res.json({
    team_name: "Harsh",
    team_members: ["Harsh Srivastava"],
    model: "Gemini 2.5 Flash", 
    approach: "LLM-based intent understanding and multi-stage scoring",
    contact_email: "harshsrivastava8704@gmail.com",
    version: "1.0.0",
    submitted_at: new Date().toISOString()
  });
});

const contextSchema = z.object({
  scope: z.enum(['category', 'merchant', 'customer', 'trigger']),
  context_id: z.string(),
  version: z.number().int(),
  delivered_at: z.string().optional(),
  payload: z.any()
});

v1Router.post('/context', (req, res) => {
  const parseResult = contextSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ accepted: false, reason: 'invalid_payload', errors: parseResult.error.issues });
  }

  const { scope, context_id, version, payload, delivered_at } = parseResult.data;
  const result = upsertContext(scope as Scope, context_id, version, payload, delivered_at);

  if (!result.accepted) {
    return res.status(409).json(result);
  }

  return res.status(200).json(result);
});

const tickSchema = z.object({
  now: z.string(),
  available_triggers: z.array(z.string())
});

v1Router.post('/tick', async (req, res) => {
  const parseResult = tickSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'invalid payload' });
  }

  const { now, available_triggers } = parseResult.data;
  const result = await processTick(now, available_triggers);

  return res.status(200).json(result);
});

const replySchema = z.object({
  conversation_id: z.string(),
  merchant_id: z.string().optional(),
  customer_id: z.string().nullable().optional(),
  from_role: z.string(),
  message: z.string(),
  received_at: z.string(),
  turn_number: z.number().int()
});

v1Router.post('/reply', (req, res) => {
  const parseResult = replySchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'invalid payload' });
  }

  const { message, turn_number } = parseResult.data;
  const action = parseReplyIntent(message, turn_number);

  return res.status(200).json(action);
});
