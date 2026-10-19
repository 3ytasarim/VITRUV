'use client';

import { CheckCircle2 } from 'lucide-react';
import { useActionState, useEffect, useId, useRef } from 'react';
import { submitContact, type ContactFormState } from '@/app/(site)/kontakt/actions';
import { Button } from '@/components/ui';
import { track } from '@/lib/analytics';

const INITIAL: ContactFormState = { status: 'idle' };
type Field = 'name' | 'email' | 'phone' | 'message';

/**
 * Coaching inquiry form (structural UI copy; the surrounding marketing text comes from the CMS).
 * Minimal data, no health questions. Works without JavaScript (server action); with JavaScript
 * it keeps the page and announces the result. Honeypot + start time are checked by the API.
 */
export function ContactForm({ startedAt }: { startedAt: number }) {
  const [state, formAction, pending] = useActionState(submitContact, INITIAL);
  const id = useId();
  const statusRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (state.status === 'idle') return;
    statusRef.current?.focus();
    if (state.status === 'success') track('contact_submit', { section: 'kontakt' });
  }, [state]);

  const onFirstInput = () => {
    if (started.current) return;
    started.current = true;
    track('form_start', { section: 'kontakt' });
  };

  if (state.status === 'success') {
    return (
      <div ref={statusRef} tabIndex={-1} role="status" className="flex flex-col items-start gap-4">
        <CheckCircle2 aria-hidden className="size-8 text-success" />
        <h2 className="type-h3">Danke, deine Nachricht ist angekommen.</h2>
        <p className="type-body text-fg-muted">Wir melden uns so bald wie möglich bei dir.</p>
      </div>
    );
  }

  const error = (field: Field | 'consent') => state.fieldErrors?.[field];
  const describedBy = (field: Field | 'consent', hint?: boolean) =>
    [hint && `${id}-${field}-hint`, error(field) && `${id}-${field}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  const input = (
    field: Field,
    label: string,
    props: Record<string, unknown>,
    hint?: string,
    required = true,
  ) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}-${field}`} className="type-body-sm font-semibold">
        {label}
        {required ? (
          <span className="text-fg-subtle"> *</span>
        ) : (
          <span className="type-caption ml-2 text-fg-subtle">optional</span>
        )}
      </label>
      {field === 'message' ? (
        <textarea
          id={`${id}-${field}`}
          name={field}
          className="vt-input type-body"
          defaultValue={state.values?.[field]}
          aria-invalid={error(field) ? true : undefined}
          aria-describedby={describedBy(field, Boolean(hint))}
          required={required}
          {...props}
        />
      ) : (
        <input
          id={`${id}-${field}`}
          name={field}
          className="vt-input type-body"
          defaultValue={state.values?.[field]}
          aria-invalid={error(field) ? true : undefined}
          aria-describedby={describedBy(field, Boolean(hint))}
          required={required}
          {...props}
        />
      )}
      {hint && (
        <p id={`${id}-${field}-hint`} className="type-caption text-fg-subtle">
          {hint}
        </p>
      )}
      {error(field) && (
        <p id={`${id}-${field}-error`} className="type-body-sm text-error">
          {error(field)}
        </p>
      )}
    </div>
  );

  return (
    <form
      action={formAction}
      noValidate
      onInput={onFirstInput}
      className="flex flex-col gap-5"
      aria-describedby={`${id}-required`}
    >
      <div
        ref={statusRef}
        tabIndex={-1}
        role="alert"
        className={
          state.status === 'error' ? 'rounded-xs border border-error px-4 py-3' : 'sr-only'
        }
      >
        {state.status === 'error' && <p className="type-body-sm font-semibold">{state.message}</p>}
      </div>
      <p id={`${id}-required`} className="type-caption text-fg-subtle">
        Pflichtfelder sind mit * markiert.
      </p>
      {input('name', 'Name', { autoComplete: 'name', maxLength: 120 })}
      {input('email', 'E-Mail', {
        type: 'email',
        autoComplete: 'email',
        inputMode: 'email',
        maxLength: 254,
      })}
      {input(
        'phone',
        'Telefon',
        { type: 'tel', autoComplete: 'tel', inputMode: 'tel', maxLength: 40 },
        undefined,
        false,
      )}
      {input(
        'message',
        'Worum geht es dir?',
        { maxLength: 2000, rows: 5 },
        'Kurz dein Ziel oder deine Frage. Bitte keine Gesundheitsdaten oder Diagnosen angeben.',
      )}
      {/* Honeypot: hidden from people and assistive technology; bots tend to fill it. */}
      <div aria-hidden className="vt-hp">
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          name="website"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </div>
      <input type="hidden" name="startedAt" value={startedAt} />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <input
            id={`${id}-consent`}
            name="consent"
            type="checkbox"
            className="vt-check mt-1 shrink-0"
            required
            aria-invalid={error('consent') ? true : undefined}
            aria-describedby={describedBy('consent')}
          />
          <label htmlFor={`${id}-consent`} className="type-body-sm text-fg-muted">
            Ich bin einverstanden, dass meine Angaben zur Beantwortung meiner Anfrage gespeichert
            und verwendet werden. Mehr dazu in der{' '}
            <a href="/datenschutz" className="text-accent-text underline underline-offset-4">
              Datenschutzerklärung
            </a>
            . *
          </label>
        </div>
        {error('consent') && (
          <p id={`${id}-consent-error`} className="type-body-sm text-error">
            {error('consent')}
          </p>
        )}
      </div>
      <div>
        <Button type="submit" size="lg" loading={pending} className="w-full sm:w-auto">
          Nachricht senden
        </Button>
      </div>
    </form>
  );
}
