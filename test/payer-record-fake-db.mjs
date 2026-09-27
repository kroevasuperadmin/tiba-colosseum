/**
 * In-memory stand-in for the tables processPayoutIntent touches.
 * No network and no real database. Solana devnet test amounts only; nothing is sent.
 */

const intents = new Map();
const adjudications = [];
let workOrder = null;
let recipient = null;
let nextId = 1;
let rulesQueries = 0;

export function resetLedger() {
  intents.clear();
  adjudications.length = 0;
  nextId = 1;
  rulesQueries = 0;
}

export function useWorkOrder(order) {
  workOrder = { ...order };
}

export function useRecipient(row) {
  recipient = { ...row };
}

export function storedAdjudications() {
  return adjudications.map((row) => ({ ...row }));
}

/** Counts queries the rules check must not make. The engine's own reads are not counted. */
export function noteRulesQuery() {
  rulesQueries += 1;
}

export function rulesQueryCount() {
  return rulesQueries;
}

function remember(row) {
  intents.set(row.id, row);
  return row;
}

function tx() {
  return {
    async $executeRaw() {
      return 0;
    },
    async $queryRaw() {
      return [{ id: "agent-1" }];
    },
    payoutIntent: {
      async count() {
        return 0;
      },
      async create({ data }) {
        const row = {
          id: `intent-${nextId++}`,
          amountMicros: 0n,
          chain: null,
          x402Routed: false,
          digest: null,
          explorerUrl: null,
          reasonCode: null,
          ...data
        };
        return remember(row);
      },
      async update({ where, data }) {
        return remember({ ...intents.get(where.id), ...data });
      }
    },
    workOrder: {
      async updateMany({ where, data }) {
        if (!workOrder || workOrder.id !== where.id) return { count: 0 };
        if (where.status && workOrder.status !== where.status) return { count: 0 };
        if (where.dischargedByIntentId === null && workOrder.dischargedByIntentId !== null) return { count: 0 };
        Object.assign(workOrder, data);
        return { count: 1 };
      }
    }
  };
}

export const prisma = {
  payoutIntent: {
    async findUnique({ where }) {
      if (where.idempotencyKey) {
        return [...intents.values()].find((row) => row.idempotencyKey === where.idempotencyKey) ?? null;
      }
      return intents.get(where.id) ?? null;
    },
    async findUniqueOrThrow({ where }) {
      const row = intents.get(where.id);
      if (!row) throw new Error("missing intent");
      return row;
    },
    async count() {
      return 0;
    },
    async update({ where, data }) {
      return remember({ ...intents.get(where.id), ...data });
    }
  },
  recipient: {
    async findFirst() {
      return recipient;
    }
  },
  workOrder: {
    async findMany() {
      if (!workOrder || workOrder.status !== "open" || workOrder.dischargedByIntentId) return [];
      if (workOrder.expiresAt.getTime() <= Date.now()) return [];
      return [workOrder];
    },
    async findUnique() {
      return workOrder ? { id: workOrder.id, ref: workOrder.ref } : null;
    },
    async updateMany(args) {
      return tx().workOrder.updateMany(args);
    }
  },
  adjudication: {
    async createMany({ data }) {
      adjudications.push(...data);
      return { count: data.length };
    }
  },
  async $transaction(fn) {
    return fn(tx());
  }
};
