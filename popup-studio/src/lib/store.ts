import "server-only";
import { normalizeAppeal, normalizeMotion, normalizeVisual, WIN_METRICS, type Brief, type Creative, type Hypothesis, type Learning, type ResultSnapshot, type Review } from "./types";

/**
 * Document store with two backends:
 * - MemoryStore: local dev / preview without a database (not durable on Vercel).
 * - PostgresStore: when DATABASE_URL or POSTGRES_URL is set (Neon / Vercel Postgres).
 * Each entity is stored as a JSON document in a single `documents` table.
 */

type Kind = "brief" | "creative" | "review" | "learning" | "hypothesis" | "snapshot";

export interface Store {
  readonly durable: boolean;
  get<T>(kind: Kind, id: string): Promise<T | null>;
  list<T>(kind: Kind, filter?: (doc: T) => boolean): Promise<T[]>;
  put<T extends { id: string }>(kind: Kind, doc: T): Promise<T>;
  delete(kind: Kind, id: string): Promise<void>;
}

class MemoryStore implements Store {
  readonly durable = false;
  private data = new Map<Kind, Map<string, unknown>>();

  private table(kind: Kind) {
    let t = this.data.get(kind);
    if (!t) {
      t = new Map();
      this.data.set(kind, t);
    }
    return t;
  }
  async get<T>(kind: Kind, id: string) {
    return (this.table(kind).get(id) as T) ?? null;
  }
  async list<T>(kind: Kind, filter?: (doc: T) => boolean) {
    const all = [...this.table(kind).values()] as T[];
    return filter ? all.filter(filter) : all;
  }
  async put<T extends { id: string }>(kind: Kind, doc: T) {
    this.table(kind).set(doc.id, doc);
    return doc;
  }
  async delete(kind: Kind, id: string) {
    this.table(kind).delete(id);
  }
}

class PostgresStore implements Store {
  readonly durable = true;
  private sqlPromise: Promise<import("postgres").Sql> | null = null;

  constructor(private url: string) {}

  private async sql() {
    if (!this.sqlPromise) {
      this.sqlPromise = (async () => {
        const postgres = (await import("postgres")).default;
        const sql = postgres(this.url, { max: 3, ssl: "require", prepare: false });
        await sql`
          CREATE TABLE IF NOT EXISTS documents (
            kind TEXT NOT NULL,
            id TEXT NOT NULL,
            data JSONB NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (kind, id)
          )`;
        return sql;
      })();
    }
    return this.sqlPromise;
  }

  async get<T>(kind: Kind, id: string) {
    const sql = await this.sql();
    const rows = await sql<{ data: T }[]>`SELECT data FROM documents WHERE kind = ${kind} AND id = ${id}`;
    return rows[0]?.data ?? null;
  }
  async list<T>(kind: Kind, filter?: (doc: T) => boolean) {
    const sql = await this.sql();
    const rows = await sql<{ data: T }[]>`SELECT data FROM documents WHERE kind = ${kind} ORDER BY updated_at DESC`;
    const all = rows.map((r) => r.data);
    return filter ? all.filter(filter) : all;
  }
  async put<T extends { id: string }>(kind: Kind, doc: T) {
    const sql = await this.sql();
    await sql`
      INSERT INTO documents (kind, id, data, updated_at)
      VALUES (${kind}, ${doc.id}, ${sql.json(doc as never)}, now())
      ON CONFLICT (kind, id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    return doc;
  }
  async delete(kind: Kind, id: string) {
    const sql = await this.sql();
    await sql`DELETE FROM documents WHERE kind = ${kind} AND id = ${id}`;
  }
}

declare global {
  var __popupStudioStore: Store | undefined;
}

export function getStore(): Store {
  if (!globalThis.__popupStudioStore) {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    globalThis.__popupStudioStore = url ? new PostgresStore(url) : new MemoryStore();
  }
  return globalThis.__popupStudioStore;
}

// Typed helpers -------------------------------------------------------------

/**
 * Documents written by earlier versions lack fields added later (v0.1 briefs have no
 * winMetric; v0.3 ids for axes/motions/templates were renamed in v0.4). Reads go
 * through these upgraders so every page sees the current shape.
 */
export function upgradeBrief(b: Brief): Brief {
  return {
    ...b,
    winMetric: WIN_METRICS.some((m) => m.id === b.winMetric) ? b.winMetric : "line_add_rate",
    deviceSize: b.deviceSize === "pc" ? "pc" : "sp",
    appealAxes: [...new Set((b.appealAxes ?? []).map((a) => normalizeAppeal(a)))],
    visualAxes: [...new Set((b.visualAxes ?? []).map((v) => normalizeVisual(v)))],
    motions: [...new Set((b.motions ?? []).map((m) => normalizeMotion(m)))],
    brand: {
      primary: b.brand?.primary ?? "#0b6e4f",
      accent: b.brand?.accent ?? "#e5484d",
      background: b.brand?.background ?? "#ffffff",
      text: b.brand?.text ?? "#1a1a1a",
      logoText: b.brand?.logoText ?? b.clientName ?? "",
      ngWords: b.brand?.ngWords ?? [],
      tone: b.brand?.tone ?? "",
    },
    offer: b.offer ?? "",
    target: b.target ?? "",
    exitContext: b.exitContext ?? "",
    copySource: b.copySource ?? "fallback",
  };
}

export function upgradeCreative(c: Creative): Creative {
  return {
    ...c,
    appealAxis: normalizeAppeal(c.appealAxis),
    visualAxis: normalizeVisual(c.visualAxis),
    motion: normalizeMotion(c.motion),
    version: c.version ?? 1,
    slots: { ...(c.slots ?? {}), eyebrow: c.slots?.eyebrow ?? "", headline: c.slots?.headline ?? "", sub: c.slots?.sub ?? "", cta: c.slots?.cta ?? "" },
  };
}

export const db = {
  briefs: {
    get: async (id: string) => {
      const b = await getStore().get<Brief>("brief", id);
      return b ? upgradeBrief(b) : null;
    },
    list: async () => (await getStore().list<Brief>("brief")).map(upgradeBrief),
    put: (b: Brief) => getStore().put("brief", b),
  },
  creatives: {
    get: async (id: string) => {
      const c = await getStore().get<Creative>("creative", id);
      return c ? upgradeCreative(c) : null;
    },
    listByBrief: async (briefId: string) => (await getStore().list<Creative>("creative", (c) => c.briefId === briefId)).map(upgradeCreative),
    put: (c: Creative) => getStore().put("creative", c),
    delete: (id: string) => getStore().delete("creative", id),
  },
  reviews: {
    listByBrief: (briefId: string) =>
      getStore().list<Review>("review", (r) => r.briefId === briefId),
    put: (r: Review) => getStore().put("review", r),
  },
  learnings: {
    list: () => getStore().list<Learning>("learning"),
    listByBrief: (briefId: string) =>
      getStore().list<Learning>("learning", (l) => l.briefId === briefId),
    put: (l: Learning) => getStore().put("learning", l),
  },
  hypotheses: {
    get: (id: string) => getStore().get<Hypothesis>("hypothesis", id),
    list: () => getStore().list<Hypothesis>("hypothesis"),
    listByBrief: (briefId: string) => getStore().list<Hypothesis>("hypothesis", (h) => h.briefId === briefId),
    put: (h: Hypothesis) => getStore().put("hypothesis", h),
    delete: (id: string) => getStore().delete("hypothesis", id),
  },
  snapshots: {
    listByBrief: (briefId: string) => getStore().list<ResultSnapshot>("snapshot", (s) => s.briefId === briefId),
    listByCreative: (creativeId: string) => getStore().list<ResultSnapshot>("snapshot", (s) => s.creativeId === creativeId),
    put: (s: ResultSnapshot) => getStore().put("snapshot", s),
  },
};

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

export function nowIso() {
  return new Date().toISOString();
}
