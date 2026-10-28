import type { PublicSectionContent, ResolvedMediaSlot } from '@vitruv/contracts';
import type { ReactNode } from 'react';
import { CmsMedia } from '@/components/cms/cms-media';
import { JourneyMapMount } from '@/components/journey/journey-map-mount';
import { cx } from '@/components/ui';
import { splitHighlight } from '../highlighted-title';

/** Published content of the `home` section (copy + resolved media of every slot). */
export type HomeContent = PublicSectionContent<'home'>;

type Slot = ResolvedMediaSlot | null;

const nn = (i: number) => String(i + 1).padStart(2, '0');

/** A media frame of the prototype: card colour + hairline; the CMS medium fills it when set. */
function MediaSlot({
  slot,
  sizes,
  className,
  wegImg = false,
  children,
}: {
  slot: Slot | undefined;
  sizes: string;
  className?: string;
  /** Marks the stage image for the Journey map engine. */
  wegImg?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cx('r-slot', className)} data-weg-img={wegImg ? '' : undefined}>
      {slot && <CmsMedia slot={slot} sizes={sizes} />}
      {children}
    </div>
  );
}

function Head({
  eyebrow,
  title,
  lead,
  id,
  narrow = true,
  className,
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  id: string;
  narrow?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('r-head', narrow && 'r-head--narrow', className)}>
      {eyebrow && <span className="r-eyebrow">{eyebrow}</span>}
      <h2 id={id} className="r-h2">
        {title}
      </h2>
      {lead && <p className="r-lead">{lead}</p>}
    </div>
  );
}

const external = (href: string) =>
  href.startsWith('https://') ? { rel: 'noopener noreferrer', target: '_blank' } : {};

/**
 * The homepage of the reference design (`Website Funktional.dc.html`) 1:1: Hero, intro video,
 * Ergebnisse (video voices, before/after row, Dein Weg route map, Das sagen Teilnehmer),
 * Wo die meisten starten, Was drin ist, Pakete, So läuft es ab, Im Training, Coach, FAQ, CTA,
 * Bewerben. Everything — copy and every image/video slot — comes from the CMS `home` section.
 */
export function ReferenceHome({ content: c }: { content: HomeContent }) {
  const lastLine = c.hero.lines.length - 1;
  const outro = splitHighlight(c.doubts.outro ?? '', c.doubts.outroHighlight);
  const totalStages = String(c.journey.stages.length).padStart(2, '0');

  return (
    <div className="r-page">
      {/* ---- Hero ---- */}
      <section id="top" className="r-hero" aria-labelledby="top-title" data-hero-media="">
        {c.hero.media && (
          <div className="r-hero__video" aria-hidden>
            <CmsMedia slot={c.hero.media} priority sizes="100vw" />
          </div>
        )}
        <div aria-hidden className="r-hero__shade" />
        <div aria-hidden className="r-hero__fade" />
        <div className="r-hero__inner">
          {c.hero.eyebrow && <span className="r-hero__eyebrow">{c.hero.eyebrow}</span>}
          <h1 id="top-title" className="r-hero__title">
            {c.hero.lines.map((line, i) =>
              i === lastLine ? (
                <span key={i} className="r-glow-text">
                  {line}
                </span>
              ) : (
                <span key={i}>
                  {line}
                  <br />
                </span>
              ),
            )}
          </h1>
          {c.hero.body && <p className="r-hero__body">{c.hero.body}</p>}
          <div className="r-hero__actions">
            <a
              href={c.hero.primary.href}
              className="r-btn r-btn--primary"
              data-track="cta_click"
              data-track-section="hero"
              data-track-label="primary"
            >
              {c.hero.primary.label}
            </a>
            {c.hero.secondary && (
              <a
                href={c.hero.secondary.href}
                className="r-btn r-btn--glass"
                data-track="cta_click"
                data-track-section="hero"
                data-track-label="secondary"
              >
                {c.hero.secondary.label}
              </a>
            )}
          </div>
          {c.hero.note && <p className="r-hero__note">{c.hero.note}</p>}
        </div>
      </section>

      {/* ---- Intro video ---- */}
      <section className="r-video" data-video-sec="" aria-label={c.intro.caption ?? 'Video'}>
        <div className="r-wrap r-video__inner">
          <MediaSlot
            slot={c.intro.media}
            sizes="(min-width: 1328px) 1240px, 100vw"
            className="r-video__frame"
          />
          {c.intro.caption && <span className="r-video__caption">{c.intro.caption}</span>}
        </div>
      </section>

      {/* ---- Ergebnisse + Dein Weg + Das sagen Teilnehmer ---- */}
      <section id="ergebnisse" className="r-results" aria-labelledby="ergebnisse-title">
        <div className="r-wrap r-results__inner">
          <Head
            eyebrow={c.results.eyebrow}
            title={c.results.title}
            id="ergebnisse-title"
            narrow={false}
            className="r-head--fit"
          />
          {c.results.videos.length > 0 && (
            <div className="r-videos">
              {c.results.videos.map((item) => (
                <div key={item.id} className="r-videos__item">
                  <MediaSlot
                    slot={item.media}
                    sizes="(min-width: 1024px) 620px, 100vw"
                    className="r-videos__frame r-cut-16"
                  />
                  <p className="r-videos__quote">{item.quote}</p>
                  <span className="r-who">{item.who}</span>
                </div>
              ))}
            </div>
          )}
          {c.results.gallery.length > 0 && (
            <>
              {c.results.swipeHint && (
                <div aria-hidden className="r-swipe">
                  {c.results.swipeHint}
                </div>
              )}
              <div className="r-rail" tabIndex={0} role="region" aria-label={c.results.title}>
                {c.results.gallery.map((item) => (
                  <div key={item.id} className="r-rail__item">
                    <MediaSlot slot={item.media} sizes="300px" className="r-rail__frame r-cut-14" />
                    <span className="r-rail__who">{item.who}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div id="weg" className="r-weg-head">
            {c.journey.eyebrow && <span className="r-eyebrow">{c.journey.eyebrow}</span>}
            <h2 className="r-h2">{c.journey.title}</h2>
          </div>
          <JourneyMapMount className="r-weg">
            <svg data-weg-svg="" aria-hidden className="r-weg__svg" preserveAspectRatio="none">
              <path data-weg-ghost="" d="" fill="none" className="r-weg__ghost" />
              <path data-weg-line="" d="" fill="none" className="r-weg__line" />
            </svg>
            <div data-weg-dot="" aria-hidden className="r-weg__dot">
              <div className="r-weg__dot-core" />
              <div className="r-weg__dot-label">
                <span>Fortschritt</span>
                <span data-weg-pct="">0%</span>
              </div>
            </div>
            {c.journey.stages.map((stage, i) => (
              <div key={stage.id} data-weg-m="" className="r-weg__m">
                <MediaSlot
                  slot={stage.media}
                  sizes="(min-width: 820px) 330px, 42vw"
                  className="r-weg__img r-cut-14"
                  wegImg
                />
                <div data-weg-txt="" className="r-weg__txt">
                  <span className="r-weg__kicker">
                    {nn(i)} / {totalStages} · {stage.name}
                  </span>
                  <h3 className="r-weg__title">{stage.title}</h3>
                  <p className="r-weg__text">{stage.text}</p>
                </div>
              </div>
            ))}
          </JourneyMapMount>

          {c.voices.items.length > 0 && (
            <>
              {c.voices.eyebrow && (
                <div className="r-voices-head">
                  <span className="r-eyebrow">{c.voices.eyebrow}</span>
                </div>
              )}
              <div className="r-voices">
                {c.voices.items.map((v) => (
                  <figure key={v.id} className="r-voice r-cut-16">
                    <span aria-hidden className="r-voice__mark">
                      “
                    </span>
                    <blockquote>{v.quote}</blockquote>
                    <figcaption className="r-who">{v.who}</figcaption>
                  </figure>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* ---- Wo die meisten starten ---- */}
      <section className="r-sec r-sec--rule" aria-labelledby="start-title">
        <div className="r-wrap r-doubts__inner">
          <Head
            eyebrow={c.doubts.eyebrow}
            title={c.doubts.title}
            id="start-title"
            narrow={false}
            className="r-doubts__head"
          />
          <div className="r-doubts__grid">
            {c.doubts.items.map((d) => (
              <div key={d.id} className="r-doubt">
                <span aria-hidden className="r-doubt__mark">
                  „
                </span>
                <p>{d.text}</p>
              </div>
            ))}
          </div>
          {c.doubts.outro && (
            <p className="r-doubts__outro">
              {outro.before}
              {outro.highlight && <span className="r-glow-text">{outro.highlight}</span>}
              {outro.after}
            </p>
          )}
        </div>
      </section>

      {/* ---- Was drin ist ---- */}
      <section id="leistung" className="r-leistung" aria-labelledby="leistung-title">
        <div className="r-panel">
          <Head
            eyebrow={c.included.eyebrow}
            title={c.included.title}
            lead={c.included.lead}
            id="leistung-title"
          />
          <div className="r-included">
            {c.included.items.map((item, i) => (
              <div key={item.id} className="r-included__item">
                <span className="r-included__num">{nn(i)}</span>
                <div className="r-included__body">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Pakete ---- */}
      <section id="pakete" className="r-sec r-sec--rule" aria-labelledby="pakete-title">
        <div className="r-wrap r-pakete__inner">
          <Head
            eyebrow={c.packages.eyebrow}
            title={c.packages.title}
            lead={c.packages.lead}
            id="pakete-title"
          />
          <div className="r-pakete__grid">
            {c.packages.items.map((pkg) => (
              <article
                key={pkg.id}
                className="r-package"
                data-featured={pkg.featured ? '' : undefined}
              >
                <div className="r-package__head">
                  <h3>{pkg.name}</h3>
                  {pkg.label && (
                    <span className={pkg.featured ? 'r-package__badge' : 'r-package__label'}>
                      {pkg.label}
                    </span>
                  )}
                </div>
                {pkg.text && <p className="r-package__text">{pkg.text}</p>}
                <ul>
                  {pkg.features.map((f, i) => (
                    <li key={i}>+ {f}</li>
                  ))}
                  {pkg.note && <li className="r-package__note">{pkg.note}</li>}
                </ul>
                <a
                  href={pkg.cta.href}
                  className={cx('r-btn', pkg.featured ? 'r-btn--primary' : 'r-btn--outline')}
                  data-track="package_cta_click"
                  data-track-section="packages"
                  data-track-label={pkg.id}
                >
                  {pkg.cta.label}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---- So läuft es ab ---- */}
      <section id="ablauf" className="r-sec r-sec--rule" aria-labelledby="ablauf-title">
        <div className="r-wrap r-ablauf__inner">
          <Head eyebrow={c.steps.eyebrow} title={c.steps.title} id="ablauf-title" narrow={false} />
          <ol className="r-steps">
            {c.steps.items.map((s, i) => (
              <li key={s.id} className="r-step">
                <span className="r-step__num">{nn(i)}</span>
                <div className="r-step__body">
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Im Training ---- */}
      <section id="training" className="r-sec r-sec--rule" aria-labelledby="training-title">
        <div className="r-wrap r-training__inner">
          <Head
            eyebrow={c.training.eyebrow}
            title={c.training.title}
            lead={c.training.lead}
            id="training-title"
          />
          <div className="r-training__grid">
            {c.training.items.map((t) => (
              <MediaSlot
                key={t.id}
                slot={t.media}
                sizes="(min-width: 1024px) 300px, 50vw"
                className="r-training__card"
              >
                <div className="r-training__text">
                  <span className="r-training__label">{t.label}</span>
                  <p>{t.text}</p>
                </div>
              </MediaSlot>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Coach ---- */}
      <section id="coach" className="r-boxsec r-coach" aria-labelledby="coach-title">
        <div className="r-panel">
          <div className="r-boxhead">
            {c.coach.eyebrow && <span className="r-eyebrow">{c.coach.eyebrow}</span>}
            <h2 id="coach-title" className="r-h2">
              {c.coach.name}
            </h2>
          </div>
          <div className="r-coach__grid">
            <div className="r-coach__aside">
              <MediaSlot slot={c.coach.media} sizes="320px" className="r-coach__portrait" />
              {c.coach.facts.length > 0 && (
                <div className="r-coach__facts">
                  {c.coach.facts.map((f, i) => (
                    <span key={i}>{f}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="r-coach__text">
              {c.coach.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              {c.coach.closing && <p className="r-coach__closing">{c.coach.closing}</p>}
            </div>
          </div>
        </div>
      </section>

      {/* ---- FAQ ---- */}
      <section id="faq" className="r-boxsec r-faq" aria-labelledby="faq-title">
        <div className="r-panel">
          <div className="r-boxhead">
            {c.faq.eyebrow && <span className="r-eyebrow">{c.faq.eyebrow}</span>}
            <h2 id="faq-title" className="r-h2">
              {c.faq.title}
            </h2>
          </div>
          <div className="r-faq__list">
            {c.faq.items.map((f) => (
              <details key={f.id}>
                <summary>
                  <span>{f.question}</span>
                  <span aria-hidden className="r-faq__plus">
                    +
                  </span>
                </summary>
                <p>{f.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ---- CTA ---- */}
      <section className="r-cta" aria-labelledby="cta-title">
        <div className="r-cta__box">
          {c.cta.media && (
            <div className="r-cta__media" aria-hidden>
              <CmsMedia slot={c.cta.media} sizes="100vw" />
            </div>
          )}
          <div aria-hidden className="r-cta__shade" />
          <div className="r-cta__inner">
            {c.cta.eyebrow && <span className="r-eyebrow">{c.cta.eyebrow}</span>}
            <h2 id="cta-title" className="r-cta__title">
              {c.cta.title}
            </h2>
            {c.cta.body && <p className="r-cta__body">{c.cta.body}</p>}
            <a
              href={c.cta.action.href}
              className="r-btn r-btn--primary"
              data-track="cta_click"
              data-track-section="cta"
            >
              {c.cta.action.label}
            </a>
          </div>
        </div>
      </section>

      {/* ---- Bewerben ---- */}
      <section id="bewerben" className="r-apply" aria-labelledby="bewerben-title">
        <div className="r-wrap r-apply__inner">
          <Head
            eyebrow={c.apply.eyebrow}
            title={c.apply.title}
            lead={c.apply.lead}
            id="bewerben-title"
          />
          <div className="r-apply__grid">
            {c.apply.channels.map((ch) => (
              <a
                key={ch.id}
                href={ch.href}
                className="r-channel"
                {...external(ch.href)}
                data-track="cta_click"
                data-track-section="apply"
                data-track-label={ch.id}
              >
                <span aria-hidden className="r-channel__tag">
                  {ch.tag}
                </span>
                <h3>{ch.title}</h3>
                {ch.text && <p>{ch.text}</p>}
                <span className="r-channel__cta">{ch.cta}</span>
              </a>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
