import type { PublicSectionContent, PublicWebsitePage } from '@vitruv/contracts';
import type { Metadata } from 'next';

/**
 * SEO from PUBLISHED CMS data only (the `seo` page-settings document, visible FAQ and footer).
 * Pure functions — the caller passes the published page and the configured public base URL, so
 * drafts, request headers or source material can never influence the output.
 */
type SeoContent = PublicSectionContent<'seo'>;

function sectionContent<T extends PublicWebsitePage['sections'][number]['type']>(
  page: PublicWebsitePage,
  type: T,
) {
  const section = page.sections.find((s) => s.type === type);
  return section?.content as PublicSectionContent<T> | undefined;
}

export function seoSettings(page: PublicWebsitePage): SeoContent | undefined {
  return sectionContent(page, 'seo');
}

/** Absolute URL for a path on the public site. */
export function absoluteUrl(siteUrl: string, path = '/'): string {
  return new URL(path, `${siteUrl}/`).toString();
}

export function buildHomeMetadata(
  page: PublicWebsitePage | null,
  options: { siteUrl: string; indexing: boolean },
): Metadata {
  const robots = options.indexing ? { index: true, follow: true } : { index: false, follow: false };
  const canonical = absoluteUrl(options.siteUrl, '/');
  const seo = page ? seoSettings(page) : undefined;
  if (!seo) return { alternates: { canonical }, robots };

  const og = seo.ogImage?.desktop;
  const images = og
    ? [
        {
          url: og.url,
          alt: og.altText,
          ...(og.width && og.height ? { width: og.width, height: og.height } : {}),
        },
      ]
    : undefined;
  return {
    title: { absolute: seo.title },
    description: seo.description,
    alternates: { canonical },
    robots,
    openGraph: {
      type: 'website',
      locale: 'de_DE',
      url: canonical,
      siteName: seo.siteName,
      title: seo.title,
      description: seo.description,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: seo.title,
      description: seo.description,
      ...(images ? { images: images.map((image) => image.url) } : {}),
    },
  };
}

type JsonLdNode = Record<string, unknown>;

/**
 * JSON-LD graph: WebSite + Organization (+ FAQPage if enabled and the FAQ is published and
 * visible). Only published, visible CMS values are used — contact details and profiles only if
 * the footer shows them. No address, ratings, reviews, credentials or invented properties.
 */
export function buildStructuredData(page: PublicWebsitePage, siteUrl: string): JsonLdNode | null {
  const seo = seoSettings(page);
  if (!seo) return null;
  const url = absoluteUrl(siteUrl, '/');
  const footer = sectionContent(page, 'footer');
  const faq = sectionContent(page, 'faq');

  const organization: JsonLdNode = {
    '@type': 'Organization',
    '@id': `${url}#organization`,
    name: seo.siteName,
    url,
  };
  if (footer?.contact.email) organization.email = footer.contact.email;
  if (footer?.contact.phone) organization.telephone = footer.contact.phone;
  if (footer && footer.social.length > 0) organization.sameAs = footer.social.map((s) => s.href);

  const graph: JsonLdNode[] = [
    {
      '@type': 'WebSite',
      '@id': `${url}#website`,
      url,
      name: seo.siteName,
      description: seo.description,
      inLanguage: 'de-DE',
      publisher: { '@id': `${url}#organization` },
    },
    organization,
  ];

  if (seo.faqStructuredData && faq && faq.items.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${url}#faq`,
      mainEntity: faq.items.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

/** Serialises JSON-LD for an inline data block; `<` is escaped so CMS text can not end the tag. */
export function serializeJsonLd(data: JsonLdNode): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
