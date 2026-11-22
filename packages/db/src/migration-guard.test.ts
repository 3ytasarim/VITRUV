import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertMigrationsAreSafe,
  DestructiveMigrationError,
  findDestructiveStatements,
} from './migration-guard';

describe('findDestructiveStatements', () => {
  it('accepts purely additive DDL', () => {
    const sql = `CREATE TYPE "public"."user_role" AS ENUM('ADMIN');
      CREATE TABLE "users" ("id" uuid PRIMARY KEY);
      ALTER TABLE "media_assets" ADD CONSTRAINT "fk" FOREIGN KEY ("u") REFERENCES "users"("id") ON DELETE set null;
      CREATE INDEX "i" ON "users" USING btree ("id");`;
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it('flags drops, truncates, deletes, renames and type changes', () => {
    expect(findDestructiveStatements('DROP TABLE "users";')).toContain('DROP TABLE');
    expect(findDestructiveStatements('drop schema public cascade;')).toContain('DROP SCHEMA');
    expect(findDestructiveStatements('ALTER TABLE "u" DROP COLUMN "x";')).toContain('DROP COLUMN');
    expect(findDestructiveStatements('TRUNCATE "u";')).toContain('TRUNCATE');
    expect(findDestructiveStatements('DELETE FROM "u";')).toContain('DELETE FROM');
    expect(findDestructiveStatements('ALTER TABLE "u" RENAME COLUMN "a" TO "b";')).toContain(
      'RENAME',
    );
    expect(
      findDestructiveStatements('ALTER TABLE "u" ALTER COLUMN "a" SET DATA TYPE integer;'),
    ).toContain('ALTER COLUMN TYPE');
  });

  it('ignores destructive words inside comments', () => {
    expect(findDestructiveStatements('-- never DROP TABLE here\nCREATE TABLE "a" ();')).toEqual([]);
  });
});

describe('assertMigrationsAreSafe', () => {
  const destructive = { file: '0002_x.sql', sql: 'DROP TABLE "users";' };

  it('throws for unapproved destructive migrations', () => {
    expect(() => assertMigrationsAreSafe([destructive], new Set())).toThrow(
      DestructiveMigrationError,
    );
  });

  it('allows a destructive migration only when explicitly approved', () => {
    expect(() => assertMigrationsAreSafe([destructive], new Set(['0002_x.sql']))).not.toThrow();
  });
});

describe('Sprint 2 migrations (iOS training v2)', () => {
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  const read = (file: string) => readFileSync(join(dir, file), 'utf8');
  const files = readdirSync(dir).filter((file) => file.endsWith('.sql'));
  const approved = new Set<string>(JSON.parse(read('APPROVED_DESTRUCTIVE.json')) as string[]);

  it('flags dropping constraints and indexes (relaxing production rules needs approval)', () => {
    expect(
      findDestructiveStatements(
        'ALTER TABLE "a" DROP CONSTRAINT "training_assignments_meaningful";',
      ),
    ).toContain('DROP CONSTRAINT');
    expect(findDestructiveStatements('DROP INDEX "x";')).toContain('DROP INDEX');
  });

  it('every migration file passes the guard (no approvals needed)', () => {
    expect(approved.size).toBe(0);
    expect(() =>
      assertMigrationsAreSafe(
        files.map((file) => ({ file, sql: read(file) })),
        approved,
      ),
    ).not.toThrow();
  });

  it('0022/0023 are additive only and journaled in order', () => {
    for (const file of ['0022_training_v2.sql', '0023_workout_templates.sql']) {
      const sql = read(file);
      expect(findDestructiveStatements(sql), file).toEqual([]);
      // No data writes ("ON UPDATE no action" in FK clauses is not one).
      expect(sql).not.toMatch(/\binsert\s+into\b|\bupdate\s+"/i);
      expect(sql).not.toMatch(/training_assignments_meaningful/);
    }
    const journal = JSON.parse(read('meta/_journal.json')) as { entries: { tag: string }[] };
    expect(journal.entries.slice(-3, -1).map((entry) => entry.tag)).toEqual([
      '0022_training_v2',
      '0023_workout_templates',
    ]);
  });

  it('0024 (Sprint 3) is additive only, uses no new enum value and is a separate file', () => {
    const sql = read('0024_sprint3_template_library.sql');
    expect(findDestructiveStatements(sql)).toEqual([]);
    expect(sql).not.toMatch(/\binsert\s+into\b|\bupdate\s+"/i);
    // No ALTER TYPE … ADD VALUE (drizzle applies pending migrations in ONE transaction).
    expect(sql).not.toMatch(/alter\s+type/i);
    // Only nullable columns → existing rows stay valid without a backfill.
    for (const line of sql.split('\n').filter((l) => /ADD COLUMN/.test(l))) {
      expect(line).not.toMatch(/NOT NULL/);
    }
    const journal = JSON.parse(read('meta/_journal.json')) as { entries: { tag: string }[] };
    expect(journal.entries.at(-1)?.tag).toBe('0024_sprint3_template_library');
  });

  it('new columns are nullable or defaulted — existing rows stay valid without a backfill', () => {
    const sql = read('0022_training_v2.sql');
    for (const line of sql.split('\n').filter((l) => /ADD COLUMN/.test(l))) {
      expect(line.includes('NOT NULL') ? /DEFAULT/.test(line) : true, line).toBe(true);
    }
  });

  it('the warm-up constraint change is a proposal outside migrations/ and would need approval', () => {
    expect(files.some((file) => /warmup|meaningful/i.test(file))).toBe(false);
    const proposal = readFileSync(
      fileURLToPath(new URL('../proposals/warmup-checklist-constraint.sql', import.meta.url)),
      'utf8',
    );
    expect(findDestructiveStatements(proposal)).toEqual(['DROP CONSTRAINT']);
  });
});
