/**
 * Refuses to apply migrations that destroy data or structure unless the project owner has
 * explicitly approved that exact migration file (see migrations/APPROVED_DESTRUCTIVE.json).
 */
const DESTRUCTIVE_PATTERNS: ReadonlyArray<{ label: string; pattern: RegExp }> = [
  { label: 'DROP DATABASE', pattern: /\bdrop\s+database\b/i },
  { label: 'DROP SCHEMA', pattern: /\bdrop\s+schema\b/i },
  { label: 'DROP TABLE', pattern: /\bdrop\s+table\b/i },
  { label: 'DROP COLUMN', pattern: /\bdrop\s+column\b/i },
  { label: 'DROP TYPE', pattern: /\bdrop\s+type\b/i },
  { label: 'TRUNCATE', pattern: /\btruncate\b/i },
  { label: 'DELETE FROM', pattern: /\bdelete\s+from\b/i },
  { label: 'RENAME', pattern: /\balter\s+table\b[^;]*\brename\b/i },
  { label: 'ALTER COLUMN TYPE', pattern: /\balter\s+column\b[^;]*\b(set\s+data\s+)?type\b/i },
];

function stripSqlComments(sqlText: string): string {
  return sqlText.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

export function findDestructiveStatements(sqlText: string): string[] {
  const body = stripSqlComments(sqlText);
  return DESTRUCTIVE_PATTERNS.filter(({ pattern }) => pattern.test(body)).map(({ label }) => label);
}

export class DestructiveMigrationError extends Error {
  constructor(public readonly findings: ReadonlyArray<{ file: string; statements: string[] }>) {
    super(
      'Refusing to migrate: destructive statements found in unapproved migrations:\n' +
        findings.map((f) => `  - ${f.file}: ${f.statements.join(', ')}`).join('\n') +
        '\nGet explicit approval from the project owner, then list the file in ' +
        'migrations/APPROVED_DESTRUCTIVE.json.',
    );
    this.name = 'DestructiveMigrationError';
  }
}

export function assertMigrationsAreSafe(
  migrations: ReadonlyArray<{ file: string; sql: string }>,
  approvedFiles: ReadonlySet<string>,
): void {
  const findings = migrations
    .filter((m) => !approvedFiles.has(m.file))
    .map((m) => ({ file: m.file, statements: findDestructiveStatements(m.sql) }))
    .filter((f) => f.statements.length > 0);
  if (findings.length > 0) throw new DestructiveMigrationError(findings);
}
