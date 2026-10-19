import { timestamp } from 'drizzle-orm/pg-core';

/** created_at / updated_at pair used by every table. updated_at is refreshed by Drizzle on update. */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
