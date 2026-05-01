export type Scope = 'category' | 'merchant' | 'customer' | 'trigger';

export interface ContextItem {
  context_id: string;
  version: number;
  payload: any;
  delivered_at?: string | undefined;
}

const categoryStore = new Map<string, ContextItem>();
const merchantStore = new Map<string, ContextItem>();
const customerStore = new Map<string, ContextItem>();
const triggerStore = new Map<string, ContextItem>();

const getStore = (scope: Scope) => {
  switch (scope) {
    case 'category': return categoryStore;
    case 'merchant': return merchantStore;
    case 'customer': return customerStore;
    case 'trigger': return triggerStore;
    default: throw new Error(`Invalid scope: ${scope}`);
  }
};

export const getContext = (scope: Scope, id: string): ContextItem | undefined => {
  return getStore(scope).get(id);
};

export const upsertContext = (scope: Scope, id: string, version: number, payload: any, delivered_at?: string) => {
  const store = getStore(scope);
  const existing = store.get(id);

  if (existing && version <= existing.version) {
    return { accepted: false, reason: 'stale_version', current_version: existing.version };
  }

  store.set(id, { context_id: id, version, payload, delivered_at });
  return { accepted: true, ack_id: `ack_${id}_v${version}`, stored_at: new Date().toISOString() };
};

export const getCounts = () => {
  return {
    category: categoryStore.size,
    merchant: merchantStore.size,
    customer: customerStore.size,
    trigger: triggerStore.size,
  };
};

export const getAllTriggers = () => {
  return Array.from(triggerStore.values());
};
