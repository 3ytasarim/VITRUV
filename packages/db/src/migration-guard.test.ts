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
