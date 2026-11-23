'use client';

import type { AdminClientListItem, AssignTemplateResponse } from '@vitruv/contracts';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { assignTemplateAction, searchClientsAction } from '@/app/admin/workout-actions';
import { Button } from '@/components/ui';
import { callAction } from '@/lib/action-call';
import { PROGRAM_STATUS_LABEL } from '@/lib/training-format';

type Outcome =
  | { clientId: string; name: string; ok: true; data: AssignTemplateResponse }
  | { clientId: string; name: string; ok: false; message: string };

const nameOf = (c: AdminClientListItem) => `${c.firstName} ${c.lastName}`.trim();
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));

/**
 * "Teilnehmer zuweisen": Vorlage → Teilnehmer:in(nen) → Datum → optional eigener Name → Zuweisen.
 * Each client gets an INDEPENDENT copy (one API call per client). A request id is generated once
 * per client and reused for a retry — a double click or network retry never makes a second copy.
 * With `fixedClient` (Trainingswoche) the client and date are preset.
 */
export function AssignTemplateDialog({
  open,
  template,
  fixedClient,
  defaultDate,
  onClose,
}: {
  open: boolean;
  template: { id: string; title: string } | null;
  fixedClient?: { id: string; name: string };
  defaultDate: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [q, setQ] = useState('');
  const [clients, setClients] = useState<AdminClientListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [date, setDate] = useState(defaultDate);
  const [customTitle, setCustomTitle] = useState('');
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const requestIds = useRef(new Map<string, string>());
  const [wasOpen, setWasOpen] = useState(false);

  // Reset the form whenever the dialog opens (state adjusted during render, not in an effect).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOutcomes([]);
      setError(null);
      setDate(defaultDate);
      setCustomTitle('');
      setSelected(fixedClient ? new Map([[fixedClient.id, fixedClient.name]]) : new Map());
    }
  }

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    if (open) requestIds.current = new Map();
  }, [open]);

  useEffect(() => {
    if (!open || fixedClient) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await callAction(() => searchClientsAction(q));
      if (cancelled) return;
      if (result.ok) {
        setClients(result.data);
        setLoadError(null);
      } else setLoadError(result.message);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, q, fixedClient]);

  const toggle = (client: AdminClientListItem) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(client.id)) next.delete(client.id);
      else next.set(client.id, nameOf(client));
      return next;
    });

  const assign = (targets: [string, string][]) => {
    if (!template) return;
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setError('Bitte ein Datum wählen.');
      return;
    }
    if (targets.length === 0) {
      setError('Bitte mindestens eine:n Teilnehmer:in auswählen.');
      return;
    }
    start(async () => {
      const results: Outcome[] = [];
      for (const [clientId, name] of targets) {
        let requestId = requestIds.current.get(clientId);
        if (!requestId) {
          requestId = crypto.randomUUID();
          requestIds.current.set(clientId, requestId);
        }
        // Network failure → a failed outcome with "Erneut versuchen"; the retry reuses the same
        // requestId, so an assignment that DID reach the server is never created twice.
        const result = await callAction(() =>
          assignTemplateAction(template.id, {
            clientId,
            requestId,
            date,
            ...(customTitle.trim() ? { title: customTitle.trim() } : {}),
          }),
        );
        results.push(
          result.ok
            ? { clientId, name, ok: true, data: result.data }
            : { clientId, name, ok: false, message: result.message },
        );
      }
      setOutcomes((current) => [
        ...current.filter((o) => !results.some((r) => r.clientId === o.clientId)),
        ...results,
      ]);
      router.refresh();
    });
  };

  const failed = outcomes.filter((o) => !o.ok);
  const done = outcomes.length > 0;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="vt-dialog"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onClose();
      }}
    >
      <form
        className="flex flex-col gap-5 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          assign([...selected.entries()]);
        }}
      >
        <div>
          <h2 id={titleId} className="type-h3">
            Teilnehmer zuweisen
          </h2>
          <p className="type-body-sm text-fg-muted">
            {template?.title} wird als <strong>unabhängige Kopie</strong> in den Trainingsplan
            übernommen. Spätere Änderungen an der Vorlage ändern diese Kopie nicht.
          </p>
        </div>

        {!done && (
          <>
            {fixedClient ? (
              <p className="type-body-sm">
                Teilnehmer:in: <strong>{fixedClient.name}</strong>
              </p>
            ) : (
              <fieldset className="flex flex-col gap-2" disabled={pending}>
                <legend className="type-body-sm mb-1 font-semibold">Teilnehmer:innen</legend>
                <div className="vt-plan__search">
                  <Search aria-hidden className="size-4 text-fg-subtle" />
                  <input
                    type="search"
                    value={q}
                    maxLength={100}
                    aria-label="Teilnehmer:innen suchen"
                    placeholder="Name suchen"
                    onChange={(event) => setQ(event.target.value)}
                    className="vt-input type-body-sm w-full"
                  />
                </div>
                {loadError && <p className="type-caption text-error">{loadError}</p>}
                <ul className="vt-workout__picker-list" aria-label="Teilnehmer:innen">
                  {clients.length === 0 && !loadError && (
                    <li className="type-caption text-fg-muted">Keine Teilnehmer:innen gefunden.</li>
                  )}
                  {clients.map((client) => (
                    <li key={client.id}>
                      <label className="vt-plan__lib-item cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selected.has(client.id)}
                          onChange={() => toggle(client)}
                        />
                        <span className="type-body-sm min-w-0 flex-1 truncate">
                          {nameOf(client)}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="type-caption text-fg-muted" aria-live="polite">
                  {selected.size} ausgewählt
                </p>
              </fieldset>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${titleId}-date`} className="type-body-sm font-semibold">
                  Datum
                </label>
                <input
                  id={`${titleId}-date`}
                  type="date"
                  value={date}
                  disabled={pending}
                  onChange={(event) => setDate(event.target.value)}
                  className="vt-input type-body"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${titleId}-name`} className="type-body-sm font-semibold">
                  Eigener Name <span className="font-normal text-fg-subtle">(optional)</span>
                </label>
                <input
                  id={`${titleId}-name`}
                  value={customTitle}
                  maxLength={120}
                  disabled={pending}
                  placeholder={template?.title}
                  onChange={(event) => setCustomTitle(event.target.value)}
                  className="vt-input type-body"
                />
              </div>
            </div>
            <p className="type-caption text-fg-muted">
              Das Workout kommt in den aktiven Plan (sonst in den neuesten Entwurf). Ohne Plan wird
              ein Entwurf ab der Woche des Datums angelegt – er ist für die Teilnehmer:in erst nach
              dem Aktivieren sichtbar. Sätze, Wiederholungen und Pausen kannst du danach unter „Für
              Teilnehmer bearbeiten“ anpassen.
            </p>
          </>
        )}

        {outcomes.length > 0 && (
          <ul className="flex flex-col gap-2" aria-live="polite">
            {outcomes.map((o) => (
              <li key={o.clientId} className="type-body-sm flex items-start gap-2">
                {o.ok ? (
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                ) : (
                  <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-error" />
                )}
                <span className="min-w-0 flex-1">
                  <strong>{o.name}</strong>:{' '}
                  {o.ok ? (
                    <>
                      {o.data.created ? 'zugewiesen' : 'war bereits zugewiesen'}
                      {o.data.date ? ` für ${formatDate(o.data.date)}` : ''} · Plan „
                      {o.data.programTitle}“ ({PROGRAM_STATUS_LABEL[o.data.programStatus]}
                      {o.data.programCreated ? ', neu angelegt' : ''}).{' '}
                      <Link
                        href={`/admin/kunden/${o.clientId}/training/workout/${o.data.dayId}`}
                        className="underline"
                      >
                        Für Teilnehmer bearbeiten
                      </Link>
                    </>
                  ) : (
                    <span className="text-error">{o.message}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="type-body-sm text-error">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {done && failed.length === 0 ? 'Schließen' : 'Abbrechen'}
          </Button>
          {!done && (
            <Button type="submit" variant="primary" loading={pending}>
              Zuweisen
            </Button>
          )}
          {done && failed.length > 0 && (
            <Button
              type="button"
              variant="primary"
              loading={pending}
              onClick={() => assign(failed.map((o) => [o.clientId, o.name]))}
            >
              Erneut versuchen
            </Button>
          )}
        </div>
      </form>
    </dialog>
  );
}
