'use client';

import type { AdminMediaAsset, AdminMediaDetail } from '@vitruv/contracts';
import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import {
  deleteMediaAction,
  mediaDetailAction,
  updateMediaAltAction,
} from '@/app/admin/website-actions';
import { Badge, Button, Card, cx } from '@/components/ui';
import { SECTION_LABELS, formatDateTime } from '../section-registry';
import { EmptyState } from '../states';
import { describeMedia } from './media-format';
import { MediaThumb } from './media-thumb';
import { MediaUploadForm } from './media-upload-form';
import { useProgressive } from './use-progressive';

type Filter = 'ALL' | 'IMAGE' | 'VIDEO';

const STATUS_LABEL = { DRAFT: 'Entwurf', PUBLISHED: 'Veröffentlicht', ARCHIVED: 'Archiv' } as const;

function UsageList({ detail }: { detail: AdminMediaDetail }) {
  if (detail.usages.length === 0) {
    return <p className="type-body-sm text-fg-muted">Wird derzeit nicht verwendet.</p>;
  }
  return (
    <ul className="type-body-sm flex flex-col gap-1 text-fg-muted">
      {detail.usages.map((usage) => (
        <li key={`${usage.sectionKey}-${usage.role}-${usage.status}`}>
          {SECTION_LABELS[usage.sectionType as keyof typeof SECTION_LABELS] ?? usage.sectionKey}
          {' · '}
          <span className="text-fg-subtle">{usage.role}</span> ({STATUS_LABEL[usage.status]})
        </li>
      ))}
    </ul>
  );
}

/** Details of the selected asset: preview, metadata, alt text, usage, protected delete. */
function MediaDetails({
  asset,
  onChanged,
  onDeleted,
}: {
  asset: AdminMediaAsset;
  onChanged: (asset: AdminMediaAsset) => void;
  onDeleted: (id: string) => void;
}) {
  const id = useId();
  const [detail, setDetail] = useState<AdminMediaDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [alt, setAlt] = useState(asset.altText ?? '');
  const [busy, setBusy] = useState<'alt' | 'delete' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{
    tone: 'error' | 'success';
    text: string;
    items?: string[];
  } | null>(null);

  // The parent remounts this component per asset (key), so only the usage detail is fetched here.
  useEffect(() => {
    let cancelled = false;
    void mediaDetailAction(asset.id).then((result) => {
      if (cancelled) return;
      if (result.ok) setDetail(result.data);
      else setDetailError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [asset.id]);

  async function saveAlt() {
    setBusy('alt');
    const result = await updateMediaAltAction(asset.id, alt.trim() || null);
    setBusy(null);
    if (!result.ok) {
      setMessage({ tone: 'error', text: result.message });
      return;
    }
    setDetail(result.data);
    onChanged(result.data);
    setMessage({ tone: 'success', text: 'Alt-Text gespeichert.' });
  }

  async function remove() {
    setBusy('delete');
    const result = await deleteMediaAction(asset.id);
    setBusy(null);
    setConfirming(false);
    if (!result.ok) {
      setMessage({
        tone: 'error',
        text: result.message,
        items: result.details.map((d) => `${d.path} (${d.message})`),
      });
      return;
    }
    onDeleted(asset.id);
  }

  const inUse = (detail?.usageCount ?? asset.usageCount) > 0;

  return (
    <Card padding="md" className="flex flex-col gap-5">
      <h2 className="type-title break-all">{asset.fileName}</h2>
      {asset.kind === 'VIDEO' ? (
        <video
          className="vt-thumb"
          src={asset.url}
          controls
          muted
          playsInline
          preload="metadata"
          aria-label={`Vorschau ${asset.fileName}`}
        />
      ) : (
        <img className="vt-thumb" src={asset.url} alt={asset.altText ?? ''} />
      )}
      <dl className="type-body-sm grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-fg-subtle">Typ</dt>
        <dd>{asset.mimeType}</dd>
        <dt className="text-fg-subtle">Details</dt>
        <dd>{describeMedia(asset)}</dd>
        <dt className="text-fg-subtle">Hochgeladen</dt>
        <dd>{formatDateTime(asset.createdAt)}</dd>
      </dl>

      {asset.kind === 'IMAGE' && (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-alt`} className="type-body-sm font-semibold">
            Alt-Text (Standard)
          </label>
          <textarea
            id={`${id}-alt`}
            className="vt-input type-body-sm"
            maxLength={300}
            value={alt}
            aria-describedby={`${id}-alt-hint`}
            onChange={(event) => setAlt(event.target.value)}
          />
          <p id={`${id}-alt-hint`} className="type-caption text-fg-subtle">
            Beschreibt den Bildinhalt. Einzelne Platzierungen können ihn überschreiben oder das Bild
            als dekorativ markieren.
          </p>
          <div>
            <Button
              variant="secondary"
              loading={busy === 'alt'}
              disabled={busy !== null || alt.trim() === (asset.altText ?? '')}
              onClick={saveAlt}
            >
              Alt-Text speichern
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="type-body-sm font-semibold">Verwendung</h3>
        {detail ? (
          <UsageList detail={detail} />
        ) : detailError ? (
          <p className="type-body-sm text-error">{detailError}</p>
        ) : (
          <p role="status" className="type-body-sm text-fg-muted">
            Wird geladen …
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="type-body-sm">Endgültig löschen?</p>
            <Button variant="secondary" loading={busy === 'delete'} onClick={remove}>
              Ja, löschen
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>
              Abbrechen
            </Button>
          </div>
        ) : (
          <div>
            <Button
              variant="secondary"
              icon={<Trash2 />}
              disabled={busy !== null}
              onClick={() => setConfirming(true)}
            >
              Löschen
            </Button>
          </div>
        )}
        {inUse && (
          <p className="type-caption text-fg-subtle">
            Verwendete Medien können nicht gelöscht werden — zuerst in den Inhalten ersetzen.
          </p>
        )}
        <div role={message?.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
          {message && (
            <>
              <p
                className={
                  message.tone === 'error' ? 'type-body-sm text-error' : 'type-body-sm text-success'
                }
              >
                {message.text}
              </p>
              {message.items && message.items.length > 0 && (
                <ul className="type-caption mt-1 list-disc pl-5 text-fg-muted">
                  {message.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Media library: upload, filter, grid, details with alt text, usage and safe delete. */
export function MediaLibrary({ initialItems }: { initialItems: AdminMediaAsset[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(initialItems[0]?.id ?? null);
  const visible = items.filter((item) => filter === 'ALL' || item.kind === filter);
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const { limit, sentinel, more, hasMore } = useProgressive(visible.length, filter);

  const replace = (asset: AdminMediaAsset) =>
    setItems((current) =>
      current.map((item) => (item.id === asset.id ? { ...item, ...asset } : item)),
    );

  return (
    <div className="flex flex-col gap-8">
      <Card tone="sunken" padding="md">
        <h2 className="type-title mb-4">Hochladen</h2>
        <MediaUploadForm
          onUploaded={(asset) => {
            setItems((current) => [asset, ...current]);
            setSelectedId(asset.id);
            router.refresh();
          }}
        />
      </Card>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Nach Typ filtern">
        {(
          [
            ['ALL', 'Alle'],
            ['IMAGE', 'Bilder'],
            ['VIDEO', 'Videos'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={value}
            variant={filter === value ? 'primary' : 'secondary'}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {label} ({value === 'ALL' ? items.length : items.filter((i) => i.kind === value).length}
            )
          </Button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState title="Noch keine Medien">
          Lade das erste Bild oder Video hoch. Danach kann es in den Website-Inhalten ausgewählt
          werden.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {visible.length === 0 ? (
            <EmptyState title="Keine Medien dieses Typs" />
          ) : (
            <div className="flex flex-col gap-4">
              <ul className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3 xl:grid-cols-4">
                {visible.slice(0, limit).map((asset) => (
                  <li key={asset.id}>
                    <button
                      type="button"
                      aria-current={asset.id === selectedId ? 'true' : undefined}
                      onClick={() => setSelectedId(asset.id)}
                      className={cx(
                        'vt-chamfer vt-cut-xs vt-card vt-card--interactive vt-option flex w-full flex-col gap-2 p-2 text-left',
                      )}
                    >
                      <MediaThumb asset={asset} />
                      <span className="type-caption block truncate text-fg">{asset.fileName}</span>
                      <span className="type-caption block text-fg-subtle">
                        {describeMedia(asset)}
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {asset.usageCount > 0 ? (
                          <Badge tone="success">In Verwendung</Badge>
                        ) : (
                          <Badge>Unbenutzt</Badge>
                        )}
                        {asset.kind === 'IMAGE' && !asset.altText && (
                          <Badge tone="warning">Alt-Text fehlt</Badge>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div ref={sentinel} aria-hidden />
              {hasMore && (
                <Button variant="secondary" className="self-center" onClick={more}>
                  Weitere laden ({visible.length - limit})
                </Button>
              )}
            </div>
          )}
          <div>
            {selected ? (
              <MediaDetails
                key={selected.id}
                asset={selected}
                onChanged={replace}
                onDeleted={(id) => {
                  setItems((current) => current.filter((item) => item.id !== id));
                  setSelectedId(null);
                  router.refresh();
                }}
              />
            ) : (
              <EmptyState title="Kein Medium ausgewählt">
                Wähle ein Medium, um Details, Alt-Text und Verwendung zu sehen.
              </EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
