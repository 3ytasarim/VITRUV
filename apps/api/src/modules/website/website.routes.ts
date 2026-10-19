import {
  pageSlugSchema,
  saveDraftRequestSchema,
  sectionKeySchema,
  updateSectionSettingsRequestSchema,
} from '@vitruv/contracts';
import { Hono } from 'hono';
import { z } from 'zod';
import { requirePermission } from '../../auth/principal';
import { validate } from '../../lib/validation';
import type { AppEnv } from '../../types';
import {
  discardDraft,
  getPageOverview,
  getPublicPage,
  getSectionDetail,
  getSectionPreview,
  listPages,
  publishSection,
  saveDraft,
  updateSectionSettings,
  type WebsiteServiceDeps,
} from './website.service';

const pageParams = z.object({ slug: pageSlugSchema });
const sectionParams = z.object({ slug: pageSlugSchema, key: sectionKeySchema });

/**
 * Admin CMS API — mounted at /v1/admin/website behind `authenticate(...)`.
 * Every route checks a website.content.* permission; responses are never cached.
 */
export function adminWebsiteRoutes(deps: WebsiteServiceDeps) {
  const routes = new Hono<AppEnv>();
  routes.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
  });

  routes.get('/pages', requirePermission('website.content.read'), async (c) =>
    c.json({ pages: await listPages(deps) }),
  );

  routes.get(
    '/pages/:slug',
    requirePermission('website.content.read'),
    validate('param', pageParams),
    async (c) => c.json(await getPageOverview(deps, c.req.valid('param').slug)),
  );

  routes.get(
    '/pages/:slug/sections/:key',
    requirePermission('website.content.read'),
    validate('param', sectionParams),
    async (c) => {
      const { slug, key } = c.req.valid('param');
      return c.json(await getSectionDetail(deps, slug, key));
    },
  );

  routes.get(
    '/pages/:slug/sections/:key/preview',
    requirePermission('website.content.read'),
    validate('param', sectionParams),
    async (c) => {
      const { slug, key } = c.req.valid('param');
      return c.json(await getSectionPreview(deps, slug, key));
    },
  );

  routes.patch(
    '/pages/:slug/sections/:key',
    requirePermission('website.content.publish'),
    validate('param', sectionParams),
    validate('json', updateSectionSettingsRequestSchema),
    async (c) =>
      c.json(
        await updateSectionSettings(deps, { ...c.req.valid('param'), ...c.req.valid('json') }),
      ),
  );

  routes.put(
    '/pages/:slug/sections/:key/draft',
    requirePermission('website.content.write'),
    validate('param', sectionParams),
    validate('json', saveDraftRequestSchema),
    async (c) => {
      const { slug, key } = c.req.valid('param');
      const result = await saveDraft(deps, {
        slug,
        key,
        content: c.req.valid('json').content,
        userId: c.get('principal')?.userId ?? null,
      });
      return c.json(result);
    },
  );

  routes.delete(
    '/pages/:slug/sections/:key/draft',
    requirePermission('website.content.write'),
    validate('param', sectionParams),
    async (c) => {
      await discardDraft(deps, c.req.valid('param'));
      return c.body(null, 204);
    },
  );

  routes.post(
    '/pages/:slug/sections/:key/publish',
    requirePermission('website.content.publish'),
    validate('param', sectionParams),
    async (c) => {
      const { slug, key } = c.req.valid('param');
      const result = await publishSection(deps, {
        slug,
        key,
        userId: c.get('principal')?.userId ?? null,
      });
      return c.json(result);
    },
  );

  return routes;
}

/**
 * Public website content — mounted at /v1/public/website. Published content only.
 * The ETag is the page's content revision, so caches revalidate cheaply after a publish.
 */
export function publicWebsiteRoutes(deps: WebsiteServiceDeps) {
  const routes = new Hono<AppEnv>();

  routes.get('/pages/:slug', validate('param', pageParams), async (c) => {
    const page = await getPublicPage(deps, c.req.valid('param').slug);
    const etag = `W/"${page.slug}-${page.contentRevision}"`;
    c.header('ETag', etag);
    c.header('Cache-Control', 'public, max-age=0, must-revalidate');
    if (c.req.header('If-None-Match') === etag) return c.body(null, 304);
    return c.json(page);
  });

  return routes;
}
