'use client';

import type { AdminMediaAsset, AdminWelcome, AdminWelcomeVideo } from '@vitruv/contracts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Pencil,
  Plus,
  Trash2,
  Video,
} from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import type { WelcomeResult } from '@/app/admin/welcome-actions';
import {
  createWelcomeCategoryAction,
  createWelcomeVideoAction,
  deleteWelcomeCategoryAction,
  deleteWelcomeVideoAction,
  orderWelcomeCategoriesAction,
  orderWelcomeVideosAction,
  renameWelcomeCategoryAction,
  updateWelcomeVideoAction,
} from '@/app/admin/welcome-actions';
import { ConfirmDialog } from '@/components/admin/management/confirm-dialog';
import { FormField } from '@/components/admin/management/form-field';
import { MediaPicker } from '@/components/admin/media/media-picker';
import { EmptyState } from '@/components/admin/states';
import { Button } from '@/components/ui';

const move = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
};

/**
 * "Willkommen" management (owner request 2026-11-18): categories = the tabs the clients see,
 * videos (from the training media library — upload happens in the picker) inside each category.
 * Every change is saved immediately through the API; the response is the new overview.
 */
export function WelcomeManager({ initial }: { initial: AdminWelcome }) {
  const [data, setData] = useState(initial);
  const [selectedId, setSelectedId] = useState(initial.categories[0]?.id ?? '');
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const statusRef = useRef<HTMLParagraphElement>(null);

  const selected = data.categories.find((c) => c.id === selectedId) ?? data.categories[0];

  const run = (
    action: () => Promise<WelcomeResult>,
    success: string,
    after?: (data: AdminWelcome) => void,
  ) =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await action();
        if (result.ok) {
          setData(result.data);
          setFieldErrors({});
          setMessage({ tone: 'success', text: success });
          after?.(result.data);
        } else {
          setFieldErrors(result.fieldErrors);
          setMessage({ tone: 'error', text: result.message });
        }
        statusRef.current?.focus();
        resolve(result.ok);
      });
    });

  // ---- categories
  const [newName, setNewName] = useState('');
  const [rename, setRename] = useState<string | null>(null);
  const [confirmCategory, setConfirmCategory] = useState(false);

  const addCategory = async () => {
    const name = newName;
    const ok = await run(
      () => createWelcomeCategoryAction(name),
      `Kategorie „${name.trim()}“ angelegt.`,
      (next) => {
        const created = next.categories.find(
          (c) => c.name.toLowerCase() === name.trim().toLowerCase(),
        );
        if (created) setSelectedId(created.id);
      },
    );
    if (ok) setNewName('');
  };

  const moveCategory = (direction: -1 | 1) => {
    if (!selected) return;
    const ids = data.categories.map((c) => c.id);
    const from = ids.indexOf(selected.id);
    const to = from + direction;
    if (to < 0 || to >= ids.length) return;
    void run(() => orderWelcomeCategoriesAction(move(ids, from, to)), 'Reihenfolge gespeichert.');
  };

  // ---- videos
  const [pickerFor, setPickerFor] = useState<'new' | string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [removeVideo, setRemoveVideo] = useState<AdminWelcomeVideo | null>(null);

  const addVideo = (categoryId: string, asset: AdminMediaAsset) => {
    const title = asset.fileName
      .replace(/\.[a-z0-9]+$/i, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    return run(
      () =>
        createWelcomeVideoAction({
          categoryId,
          mediaAssetId: asset.id,
          title: (title || 'Video').slice(0, 120),
          description: '',
        }),
      'Video hinzugefügt – Kund:innen sehen es sofort. Titel und Beschreibung änderst du über „Bearbeiten“.',
    );
  };

  const pick = (asset: AdminMediaAsset) => {
    if (pickerFor === 'new') {
      // owner feedback 2026-11-18: a chosen/uploaded video must not wait for a second click —
      // it is added right away (title from the file name, editable via "Bearbeiten").
      if (selected) void addVideo(selected.id, asset);
    } else if (pickerFor) {
      void run(
        () => updateWelcomeVideoAction(pickerFor, { mediaAssetId: asset.id }),
        'Video ersetzt.',
      );
    }
    setPickerFor(null);
  };

  const moveVideo = (index: number, direction: -1 | 1) => {
    if (!selected) return;
    const ids = selected.videos.map((v) => v.id);
    const to = index + direction;
    if (to < 0 || to >= ids.length) return;
    void run(
      () => orderWelcomeVideosAction(selected.id, move(ids, index, to)),
      'Reihenfolge gespeichert.',
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <p
        ref={statusRef}
        tabIndex={-1}
        role={message?.tone === 'error' ? 'alert' : 'status'}
        className={
          message
            ? `type-body-sm ${message.tone === 'error' ? 'text-error' : 'text-fg-muted'}`
            : 'sr-only'
        }
      >
        {message?.text ?? ''}
      </p>

      {/* ---------------------------------------------------------- categories */}
      <section aria-labelledby="wk-kategorien" className="vt-card flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 id="wk-kategorien" className="type-h3 text-fg">
            Kategorien
          </h2>
          <p className="type-body-sm text-fg-muted">
            Jede Kategorie erscheint bei den Kund:innen als Tab (z. B. „Start“, „Training“,
            „Ernährung“). Kategorien ohne Videos werden dort nicht angezeigt.
          </p>
        </div>

        {data.categories.length > 0 && (
          <div role="group" aria-label="Kategorie bearbeiten" className="vt-wk-pills">
            {data.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                className="vt-wk-pill"
                aria-pressed={category.id === selected?.id}
                onClick={() => {
                  setSelectedId(category.id);
                  setRename(null);
                  setEditing(null);
                }}
              >
                {category.name}
                <span className="vt-wk-pill__count">{category.videos.length}</span>
              </button>
            ))}
          </div>
        )}

        <form
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void addCategory();
          }}
        >
          <div className="min-w-0 flex-1">
            <FormField label="Neue Kategorie" error={fieldErrors.name}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="z. B. Start"
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  className="vt-input type-body"
                />
              )}
            </FormField>
          </div>
          <Button
            type="submit"
            variant="secondary"
            icon={<Plus />}
            loading={pending && newName !== ''}
            disabled={newName.trim() === ''}
          >
            Kategorie anlegen
          </Button>
        </form>
      </section>

      {/* ---------------------------------------------------------- selected category */}
      {!selected ? (
        <EmptyState title="Noch keine Kategorien">
          Lege oben die erste Kategorie an – danach kannst du Videos hinzufügen.
        </EmptyState>
      ) : (
        <section aria-labelledby="wk-auswahl" className="vt-card flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            {rename === null ? (
              <h2 id="wk-auswahl" className="type-title text-fg break-words">
                {selected.name}
              </h2>
            ) : (
              <form
                className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  void run(
                    () => renameWelcomeCategoryAction(selected.id, rename),
                    'Kategorie umbenannt.',
                    () => setRename(null),
                  );
                }}
              >
                <div className="min-w-0 flex-1">
                  <FormField label="Name der Kategorie" error={fieldErrors.name}>
                    {({ id, describedBy, invalid }) => (
                      <input
                        id={id}
                        value={rename}
                        onChange={(event) => setRename(event.target.value)}
                        maxLength={60}
                        autoComplete="off"
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        className="vt-input type-body"
                      />
                    )}
                  </FormField>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" variant="primary" loading={pending}>
                    Speichern
                  </Button>
                  <Button variant="ghost" onClick={() => setRename(null)}>
                    Abbrechen
                  </Button>
                </div>
              </form>
            )}
            <div className="flex flex-wrap gap-2">
              {rename === null && (
                <Button
                  variant="secondary"
                  icon={<Pencil />}
                  onClick={() => setRename(selected.name)}
                >
                  Name bearbeiten
                </Button>
              )}
              <Button
                variant="secondary"
                icon={<ArrowLeft />}
                aria-label="Kategorie nach vorne"
                disabled={pending || data.categories[0]?.id === selected.id}
                onClick={() => moveCategory(-1)}
              />
              <Button
                variant="secondary"
                icon={<ArrowRight />}
                aria-label="Kategorie nach hinten"
                disabled={pending || data.categories.at(-1)?.id === selected.id}
                onClick={() => moveCategory(1)}
              />
              <Button
                variant="ghost"
                icon={<Trash2 />}
                disabled={pending}
                onClick={() => setConfirmCategory(true)}
              >
                Kategorie löschen
              </Button>
            </div>
          </div>

          {/* videos of the category */}
          {selected.videos.length === 0 ? (
            <p className="type-body-sm text-fg-muted">
              In dieser Kategorie ist noch kein Video. Füge unten das erste hinzu.
            </p>
          ) : (
            <ol className="flex flex-col gap-4">
              {selected.videos.map((video, index) => (
                <li key={video.id} className="vt-wk-video">
                  <video
                    className="vt-wk-video__media"
                    src={video.video.url}
                    controls
                    playsInline
                    preload="metadata"
                    aria-label={`Video: ${video.title}`}
                  />
                  {editing === video.id ? (
                    <VideoEditForm
                      video={video}
                      categories={data.categories}
                      pending={pending}
                      errors={fieldErrors}
                      onCancel={() => setEditing(null)}
                      onReplace={() => setPickerFor(video.id)}
                      onSave={(patch) =>
                        void run(
                          () => updateWelcomeVideoAction(video.id, patch),
                          'Video gespeichert.',
                          () => {
                            setEditing(null);
                            if (patch.categoryId && patch.categoryId !== selected.id) {
                              setSelectedId(patch.categoryId);
                            }
                          },
                        )
                      }
                    />
                  ) : (
                    <div className="flex min-w-0 flex-1 flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <h3 className="type-body font-semibold text-fg break-words">
                          {index + 1}. {video.title}
                        </h3>
                        {video.description && (
                          <p className="type-body-sm whitespace-pre-line text-fg-muted">
                            {video.description}
                          </p>
                        )}
                        <p className="type-caption text-fg-subtle break-all">
                          {video.video.fileName}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          icon={<Pencil />}
                          onClick={() => setEditing(video.id)}
                        >
                          Bearbeiten
                        </Button>
                        <Button
                          variant="secondary"
                          icon={<ArrowUp />}
                          aria-label={`„${video.title}“ nach oben`}
                          disabled={pending || index === 0}
                          onClick={() => moveVideo(index, -1)}
                        />
                        <Button
                          variant="secondary"
                          icon={<ArrowDown />}
                          aria-label={`„${video.title}“ nach unten`}
                          disabled={pending || index === selected.videos.length - 1}
                          onClick={() => moveVideo(index, 1)}
                        />
                        <Button
                          variant="ghost"
                          icon={<Trash2 />}
                          onClick={() => setRemoveVideo(video)}
                        >
                          Entfernen
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          {/* add a video */}
          <div className="vt-wk-add flex flex-col gap-3">
            <h3 className="type-body font-semibold text-fg">
              Video zu „{selected.name}“ hinzufügen
            </h3>
            <p className="type-body-sm text-fg-muted">
              Wähle ein Video aus der Mediathek oder lade ein neues hoch – es wird sofort zu dieser
              Kategorie hinzugefügt.
            </p>
            <Button
              variant="primary"
              icon={<Plus />}
              loading={pending}
              className="self-start"
              onClick={() => setPickerFor('new')}
            >
              Video wählen oder hochladen
            </Button>
          </div>
        </section>
      )}

      <MediaPicker
        open={pickerFor !== null}
        title="Video aus der Trainings-Mediathek"
        kinds={['VIDEO']}
        library="TRAINING"
        onSelect={pick}
        onClose={() => setPickerFor(null)}
      />
      <ConfirmDialog
        open={confirmCategory}
        title="Kategorie löschen?"
        confirmLabel="Löschen"
        pending={pending}
        onCancel={() => setConfirmCategory(false)}
        onConfirm={() => {
          if (!selected) return;
          void run(
            () => deleteWelcomeCategoryAction(selected.id),
            'Kategorie gelöscht.',
            (next) => {
              setConfirmCategory(false);
              setSelectedId(next.categories[0]?.id ?? '');
            },
          );
        }}
      >
        {selected && selected.videos.length > 0 ? (
          <p>
            Die Kategorie „{selected.name}“ und{' '}
            {selected.videos.length === 1 ? 'ihr Video' : `ihre ${selected.videos.length} Videos`}{' '}
            werden aus „Willkommen“ entfernt. Die Videodateien bleiben in der Trainings-Mediathek.
          </p>
        ) : (
          <p>Die Kategorie „{selected?.name}“ wird gelöscht.</p>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={removeVideo !== null}
        title="Video entfernen?"
        confirmLabel="Entfernen"
        pending={pending}
        onCancel={() => setRemoveVideo(null)}
        onConfirm={() => {
          if (!removeVideo) return;
          void run(
            () => deleteWelcomeVideoAction(removeVideo.id),
            'Video entfernt.',
            () => setRemoveVideo(null),
          );
        }}
      >
        <p>
          „{removeVideo?.title}“ verschwindet aus „Willkommen“. Die Datei bleibt in der
          Trainings-Mediathek erhalten.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function VideoEditForm({
  video,
  categories,
  pending,
  errors,
  onSave,
  onCancel,
  onReplace,
}: {
  video: AdminWelcomeVideo;
  categories: AdminWelcome['categories'];
  pending: boolean;
  errors: Record<string, string>;
  onSave: (patch: { title: string; description: string; categoryId: string }) => void;
  onCancel: () => void;
  onReplace: () => void;
}) {
  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [categoryId, setCategoryId] = useState(video.categoryId);
  return (
    <form
      className="flex min-w-0 flex-1 flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSave({ title, description, categoryId });
      }}
    >
      <FormField label="Titel" required error={errors.title}>
        {({ id, describedBy, invalid }) => (
          <input
            id={id}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            autoComplete="off"
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          />
        )}
      </FormField>
      <FormField label="Beschreibung" hint="Optional, bis 500 Zeichen." error={errors.description}>
        {({ id, describedBy, invalid }) => (
          <textarea
            id={id}
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={500}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          />
        )}
      </FormField>
      <FormField label="Kategorie" error={errors.categoryId}>
        {({ id, describedBy, invalid }) => (
          <select
            id={id}
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="vt-input type-body"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        )}
      </FormField>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" loading={pending}>
          Speichern
        </Button>
        <Button variant="secondary" icon={<Video />} onClick={onReplace}>
          Video ersetzen
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
