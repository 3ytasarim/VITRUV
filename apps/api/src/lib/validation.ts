import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { AppError } from './errors';

/**
 * Route-level Zod validation that always produces the standard VALIDATION_FAILED envelope.
 * Every external input (params, query, json, headers) goes through this — no ad-hoc parsing.
 */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw AppError.validation(
        result.error.issues.map((issue) => ({
          path: issue.path.map(String).join('.') || target,
          message: issue.message,
        })),
      );
    }
  });
}
