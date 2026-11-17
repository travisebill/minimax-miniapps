// @ts-check

/**
 * Durable state for the Decision Ledger.
 *
 * Everything lives in `context.dataDir`, the private directory the Host owns for this plugin.
 * The file is rewritten atomically (temp file in the same directory, then rename) so a stop in
 * the middle of a write never leaves a half-written ledger behind.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const STORE_FILE = 'decisions.json';
const SCHEMA_VERSION = 1;

const STATUSES = new Set(['draft', 'decided', 'archived']);
const EVIDENCE_KINDS = new Set(['file', 'conversation', 'note']);

/**
 * @param {string} value
 * @param {number} max
 */
function text(value, max) {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 */
function num(value, min, max) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function isoDate(value) {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

/**
 * @param {unknown} value
 */
function sanitizeOptions(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 24).map((raw) => {
    const item = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    return {
      id: text(item.id, 64) || `o_${randomUUID().slice(0, 8)}`,
      label: text(item.label, 160),
      score: num(item.score, 0, 10),
      weight: num(item.weight, 1, 5),
      note: text(item.note, 600),
    };
  });
}

/**
 * @param {unknown} value
 */
function sanitizeEvidence(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).map((raw) => {
    const item = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    const kind = text(item.kind, 24);
    return {
      id: text(item.id, 64) || `e_${randomUUID().slice(0, 8)}`,
      kind: EVIDENCE_KINDS.has(kind) ? kind : 'note',
      source: text(item.source, 300),
      detail: text(item.detail, 1200),
      addedAt: isoDate(item.addedAt) ?? new Date().toISOString(),
    };
  });
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {Record<string, unknown>}
 */
function sanitizeDecision(raw) {
  const now = new Date().toISOString();
  const status = text(raw.status, 24);
  return {
    id: text(raw.id, 64) || `d_${randomUUID().slice(0, 8)}`,
    title: text(raw.title, 200),
    context: text(raw.context, 4000),
    status: STATUSES.has(status) ? status : 'draft',
    createdAt: isoDate(raw.createdAt) ?? now,
    updatedAt: isoDate(raw.updatedAt) ?? now,
    decidedAt: isoDate(raw.decidedAt),
    decidedBy: text(raw.decidedBy, 120),
    reviewAt: isoDate(raw.reviewAt),
    options: sanitizeOptions(raw.options),
    evidence: sanitizeEvidence(raw.evidence),
    rationale: text(raw.rationale, 4000),
    outcome: text(raw.outcome, 4000),
    adr: typeof raw.adr === 'string' ? raw.adr.slice(0, 60000) : null,
    agentSessionId: text(raw.agentSessionId, 128) || null,
  };
}

/**
 * @param {import('./miniapp-api.js').MiniAppContext} context
 */
export function createStore(context) {
  const file = join(context.dataDir, STORE_FILE);
  /** @type {{ version: number, decisions: Record<string, unknown>[] }} */
  let state = { version: SCHEMA_VERSION, decisions: [] };
  /** @type {Promise<void> | null} */
  let loading = null;
  /** @type {Promise<void>} */
  let writes = Promise.resolve();

  async function load() {
    if (loading) return loading;
    loading = (async () => {
      await mkdir(context.dataDir, { recursive: true });
      try {
        const raw = await readFile(file, 'utf8');
        const parsed = JSON.parse(raw);
        const decisions = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
        state = {
          version: SCHEMA_VERSION,
          decisions: decisions.map((item) => sanitizeDecision(item && typeof item === 'object' ? item : {})),
        };
      } catch (error) {
        const code = /** @type {NodeJS.ErrnoException} */ (error).code;
        if (code !== 'ENOENT') {
          context.logger.warn('decision-ledger.store.load-failed', { code: code ?? 'unknown' });
        }
        state = { version: SCHEMA_VERSION, decisions: [] };
      }
    })();
    return loading;
  }

  async function persist() {
    const snapshot = JSON.stringify(state, null, 2);
    writes = writes.then(async () => {
      const temp = `${file}.${process.pid}.tmp`;
      try {
        await writeFile(temp, snapshot, 'utf8');
        await rename(temp, file);
      } catch (error) {
        context.logger.error('decision-ledger.store.write-failed', {
          code: /** @type {NodeJS.ErrnoException} */ (error).code ?? 'unknown',
        });
        await rm(temp, { force: true }).catch(() => undefined);
      }
    });
    await writes;
  }

  return {
    async list() {
      await load();
      return state.decisions;
    },
    async get(id) {
      await load();
      return state.decisions.find((item) => item.id === id) ?? null;
    },
    async create(input) {
      await load();
      const now = new Date().toISOString();
      const decision = sanitizeDecision({
        ...input,
        id: `d_${randomUUID().slice(0, 8)}`,
        createdAt: now,
        updatedAt: now,
        status: 'draft',
      });
      state.decisions.unshift(decision);
      await persist();
      return decision;
    },
    async update(id, patch) {
      await load();
      const index = state.decisions.findIndex((item) => item.id === id);
      if (index === -1) return null;
      const merged = sanitizeDecision({
        ...state.decisions[index],
        ...patch,
        id,
        createdAt: state.decisions[index].createdAt,
        updatedAt: new Date().toISOString(),
      });
      state.decisions[index] = merged;
      await persist();
      return merged;
    },
    async remove(id) {
      await load();
      const index = state.decisions.findIndex((item) => item.id === id);
      if (index === -1) return false;
      state.decisions.splice(index, 1);
      await persist();
      return true;
    },
  };
}
