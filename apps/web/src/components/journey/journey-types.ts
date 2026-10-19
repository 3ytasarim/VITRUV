import type { PublicSectionContent } from '@vitruv/contracts';

/**
 * The Journey component renders exactly the CMS contract's public Journey content
 * (`publicSectionContentSchemas.journey` in @vitruv/contracts) — there is no second model.
 * The API delivers it with media resolved and hidden stages removed; the display number of a
 * stage ("01") is derived from its position, so reordering in the CMS renumbers automatically.
 */
export type JourneyContent = PublicSectionContent<'journey'>;

/** One stage: id, name, title, description, media (`null` → neutral placeholder), enabled. */
export type JourneyStage = JourneyContent['stages'][number];

/** Visual state of a stage / milestone relative to the reader's progress. */
export type StageState = 'upcoming' | 'active' | 'completed';
