export interface SuppressionEntry {
  key: string;
  expires_at: number;
}

const registry = new Map<string, SuppressionEntry>();

export const isSuppressed = (key: string, nowMs: number = Date.now()): boolean => {
  const entry = registry.get(key);
  if (!entry) return false;
  if (entry.expires_at <= nowMs) {
    registry.delete(key);
    return false;
  }
  return true;
};

export const suppress = (key: string, ttlSeconds: number, nowMs: number = Date.now()) => {
  registry.set(key, {
    key,
    expires_at: nowMs + ttlSeconds * 1000
  });
};

export const suppressUntil = (key: string, expiresAtMs: number) => {
  registry.set(key, {
    key,
    expires_at: expiresAtMs
  });
};

export const clearExpired = (nowMs: number = Date.now()) => {
  for (const [key, entry] of registry.entries()) {
    if (entry.expires_at <= nowMs) {
      registry.delete(key);
    }
  }
};
