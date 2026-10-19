// Vitest setup for integration suites: loads the repo-root .env (if present) without
// overriding variables already set by the shell/CI. Values are never logged.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const rootEnv = resolve(import.meta.dirname, '..', '..', '..', '.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
