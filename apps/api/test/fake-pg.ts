import { randomUUID } from 'node:crypto';
import { schema, type DbExecutor } from '@vitruv/db';
import { drizzle } from 'drizzle-orm/node-postgres';

/**
 * In-memory stand-in for ONE PostgreSQL connection — unit tests only (Sprint 2).
 *
 * It is NOT a database and never opens a socket. It answers exactly the simple statement shapes
 * Drizzle generates for the workout write path (single-table select / insert / update with
 * `"table"."col" = $n` / `in (…)` conjunctions, FOR UPDATE, ON CONFLICT DO NOTHING, RETURNING)
 * and THROWS on anything else, so a test can never pass by silently ignoring SQL.
 * Behaviour that matters for the tests is modelled explicitly:
 *  - unique keys (incl. the partial index on client_set_id) → 23505 / ON CONFLICT DO NOTHING
 *  - row locks: `… for update` waits while another connection holds the row (per connection =
 *    per drizzle instance; released at commit/rollback)
 * Raw SQL (startWorkout's INSERT … SELECT snapshot, advisory locks) is not supported here — that
 * path is covered by the integration suite, which needs an isolated database.
 */

type Row = Record<string, unknown>;
export type FakeTables = Record<string, Row[]>;

/** Unique keys enforced by the fake (mirrors the real constraints used on this path). */
const UNIQUE: Record<string, { cols: string[]; partialNotNull?: string }[]> = {
  workout_exercise_sets: [
    { cols: ['session_exercise_id', 'set_number'] },
    { cols: ['session_exercise_id', 'client_set_id'], partialNotNull: 'client_set_id' },
  ],
};
const DEFAULTS: Record<string, () => unknown> = {
  id: () => randomUUID(),
  created_at: () => new Date(),
  updated_at: () => new Date(),
  reps_max: () => false,
  status: () => null,
};

export class FakeStore {
  readonly tables: FakeTables;
  readonly log: { connection: number; text: string; params: unknown[] }[] = [];
  private readonly locks = new Map<string, { owner: number; waiters: (() => void)[] }>();
  private nextConnection = 1;
  /** ignoreLocks: model two requests that are NOT serialised (to exercise the unique index). */
  constructor(
    tables: FakeTables,
    private readonly options: { ignoreLocks?: boolean } = {},
  ) {
    this.tables = tables;
  }

  /** A new "connection" (one drizzle instance) on the shared tables. */
  connect(): DbExecutor {
    const id = this.nextConnection++;
    const client = { query: (config: unknown, params?: unknown[]) => this.run(id, config, params) };
    return drizzle({ client: client as never, schema }) as unknown as DbExecutor;
  }

  /** Statements that touched a table (lower-case text), for scope assertions. */
  statementsOn(table: string) {
    return this.log.filter((entry) => entry.text.includes(`"${table}"`));
  }

  private async lock(connection: number, key: string) {
    for (;;) {
      const held = this.locks.get(key);
      if (!held || held.owner === connection) {
        this.locks.set(key, { owner: connection, waiters: held?.waiters ?? [] });
        return;
      }
      await new Promise<void>((resolve) => held.waiters.push(resolve));
    }
  }

  private release(connection: number) {
    for (const [key, held] of [...this.locks]) {
      if (held.owner !== connection) continue;
      this.locks.delete(key);
      for (const wake of held.waiters) wake();
    }
  }

  private async run(connection: number, config: unknown, rawParams?: unknown[]) {
    const query =
      typeof config === 'string'
        ? { text: config }
        : (config as { text: string; values?: unknown[] });
    const params = rawParams ?? query.values ?? [];
    const text = query.text.replace(/\s+/g, ' ').trim();
    this.log.push({ connection, text, params });
    // Let concurrent "connections" interleave like real network round trips.
    await Promise.resolve();
    const lower = text.toLowerCase();
    if (/^(begin|commit|rollback)\b/.test(lower)) {
      if (!lower.startsWith('begin')) this.release(connection);
      return { rows: [], rowCount: 0 };
    }
    if (lower.startsWith('select ')) return this.select(connection, text, params);
    if (lower.startsWith('insert into ')) return this.insert(text, params);
    if (lower.startsWith('update ')) return this.update(text, params);
    throw new Error(`FakeStore: unsupported statement: ${text}`);
  }

  private table(name: string) {
    const rows = this.tables[name];
    if (!rows) throw new Error(`FakeStore: unknown table ${name}`);
    return rows;
  }

  /** `"t"."col" = $n` and `"t"."col" in ($a, $b)` conjunctions (OR is refused). */
  private filter(where: string, params: unknown[]) {
    if (/\bor\b|\bnot\b|\bis\b|\blike\b|<|>/i.test(where)) {
      throw new Error(`FakeStore: unsupported where: ${where}`);
    }
    const value = (token: string) => params[Number(token.slice(1)) - 1];
    const tests: ((row: Row) => boolean)[] = [];
    for (const m of where.matchAll(/"\w+"\."(\w+)" = (\$\d+)/g)) {
      const [, col, token] = m as unknown as [string, string, string];
      const expected = value(token);
      tests.push((row) => row[col] === expected);
    }
    for (const m of where.matchAll(/"\w+"\."(\w+)" in \(([^)]*)\)/g)) {
      const [, col, list] = m as unknown as [string, string, string];
      const allowed = list.split(',').map((t) => value(t.trim()));
      tests.push((row) => allowed.includes(row[col]));
    }
    return (row: Row) => tests.every((test) => test(row));
  }

  private columns(list: string) {
    return list.split(',').map((part) => {
      const m = /"(\w+)"\s*$/.exec(part.trim()) ?? /^"(\w+)"/.exec(part.trim());
      if (!m?.[1]) throw new Error(`FakeStore: unsupported column ${part}`);
      return m[1];
    });
  }

  private async select(connection: number, text: string, params: unknown[]) {
    const m =
      /^select (.+?) from "(\w+)"(?: where (.+?))?(?: order by .+?)?(?: limit \$\d+)?( for update| for share.*)?$/i.exec(
        text,
      );
    if (!m || /\bjoin\b/i.test(text)) {
      // Media lookups join exercises → media_assets; the fake has no media: empty result.
      if (/\bjoin "media_assets"/i.test(text)) return { rows: [], rowCount: 0 };
      throw new Error(`FakeStore: unsupported select: ${text}`);
    }
    const [, list, name, where, lock] = m as unknown as [string, string, string, string?, string?];
    const rows = this.table(name).filter(where ? this.filter(where, params) : () => true);
    if (lock?.includes('update') && !this.options.ignoreLocks) {
      for (const row of rows) await this.lock(connection, `${name}:${String(row.id)}`);
    }
    const cols = this.columns(list);
    // Drizzle's node-postgres driver reads rows in array mode, in select-list order.
    return { rows: rows.map((row) => cols.map((col) => row[col] ?? null)), rowCount: rows.length };
  }

  private conflicts(name: string, candidate: Row) {
    return (UNIQUE[name] ?? []).some(({ cols, partialNotNull }) => {
      if (partialNotNull && (candidate[partialNotNull] ?? null) === null) return false;
      return this.table(name).some((row) => cols.every((col) => row[col] === candidate[col]));
    });
  }

  private insert(text: string, params: unknown[]) {
    const m =
      /^insert into "(\w+)" \((.+?)\) values \((.+?)\)( on conflict do nothing)?(?: returning (.+))?$/i.exec(
        text,
      );
    if (!m) throw new Error(`FakeStore: unsupported insert: ${text}`);
    const [, name, colList, valueList, onConflict, returning] = m as unknown as [
      string,
      string,
      string,
      string,
      string?,
      string?,
    ];
    const cols = this.columns(colList);
    const values = valueList.split(',').map((t) => t.trim());
    const row: Row = {};
    cols.forEach((col, i) => {
      const token = values[i] ?? 'default';
      row[col] =
        token === 'default'
          ? (DEFAULTS[col]?.() ?? null)
          : token === 'null'
            ? null
            : params[Number(token.slice(1)) - 1];
    });
    if (this.conflicts(name, row)) {
      if (onConflict) return { rows: [], rowCount: 0 };
      throw Object.assign(new Error('duplicate key value violates unique constraint'), {
        code: '23505',
      });
    }
    this.table(name).push(row);
    const out = returning ? this.columns(returning) : [];
    return { rows: returning ? [out.map((col) => row[col] ?? null)] : [], rowCount: 1 };
  }

  private update(text: string, params: unknown[]) {
    const m = /^update "(\w+)" set (.+?) where (.+?)(?: returning (.+))?$/i.exec(text);
    if (!m) throw new Error(`FakeStore: unsupported update: ${text}`);
    const [, name, setList, where, returning] = m as unknown as [
      string,
      string,
      string,
      string,
      string?,
    ];
    const assignments = [...setList.matchAll(/"(\w+)" = (\$\d+|null)/g)].map(
      (a) => [a[1], a[2] === 'null' ? null : params[Number((a[2] ?? '$0').slice(1)) - 1]] as const,
    );
    const rows = this.table(name).filter(this.filter(where, params));
    for (const row of rows) for (const [col, value] of assignments) row[col as string] = value;
    const out = returning ? this.columns(returning) : [];
    return {
      rows: returning ? rows.map((row) => out.map((col) => row[col] ?? null)) : [],
      rowCount: rows.length,
    };
  }
}
