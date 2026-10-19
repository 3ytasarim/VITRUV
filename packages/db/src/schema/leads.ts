import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { timestamps } from './columns';
import { websiteLeadStatus } from './enums';

/**
 * Inquiries from the public contact form (Sprint 3 Stage C). Minimal personal data by design:
 * no health information, no IP address, no tracking identifiers. Never exposed through any
 * public endpoint. Retention/deletion rules are pending legal review (docs/CMS-ARCHITECTURE.md).
 */
export const websiteLeads = pgTable(
  'website_leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    message: text('message').notNull(),
    /** When the visitor gave explicit consent to be contacted (checkbox, never pre-checked). */
    consentAt: timestamp('consent_at', { withTimezone: true }).notNull(),
    status: websiteLeadStatus('status').notNull().default('NEW'),
    ...timestamps,
  },
  (table) => [
    index('website_leads_created_idx').on(table.createdAt),
    check('website_leads_name_length', sql`char_length(${table.name}) between 1 and 120`),
    check('website_leads_email_length', sql`char_length(${table.email}) between 3 and 254`),
    check(
      'website_leads_phone_length',
      sql`${table.phone} is null or char_length(${table.phone}) <= 40`,
    ),
    check('website_leads_message_length', sql`char_length(${table.message}) between 1 and 2000`),
  ],
);

export type WebsiteLead = typeof websiteLeads.$inferSelect;
