'use client';

import { FileUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';
import { setNutritionStatusAction } from '@/app/admin/nutrition-actions';
import { Button } from '@/components/ui';

const MAX_MB = 25;

/**
 * Upload a meal-plan PDF for one client (multipart → same-origin proxy → API, which validates
 * type, real PDF content and size). "Sofort freigeben" activates it right away; otherwise it
 * stays a draft that the client does not see.
 */
export function NutritionUploadForm({
  clientId,
  canActivate,
}: {
  clientId: string;
  canActivate: boolean;
}) {
  const id = useId();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    const fieldErrors: Record<string, string> = {};
    if (!String(form.get('title') ?? '').trim()) fieldErrors.title = 'Bitte einen Titel angeben.';
    if (!(file instanceof File) || file.size === 0)
      fieldErrors.file = 'Bitte eine PDF-Datei wählen.';
    else if (file.type && file.type !== 'application/pdf') fieldErrors.file = 'Nur PDF-Dateien.';
    else if (file.size > MAX_MB * 1024 * 1024) fieldErrors.file = `Höchstens ${MAX_MB} MB.`;
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) return;
    const activate = form.get('activate') === 'on';
    form.delete('activate');
    setPending(true);
    setMessage(null);
    try {
      const res = await fetch(`/admin/api/nutrition/${clientId}`, { method: 'POST', body: form });
      const body = (await res.json().catch(() => null)) as {
        id?: string;
        error?: { message?: string; details?: { path: string; message: string }[] };
      } | null;
      if (!res.ok || !body?.id) {
        const details = Object.fromEntries(
          (body?.error?.details ?? []).map((d) => [d.path.split('.')[0] ?? d.path, d.message]),
        );
        setErrors(details);
        setMessage({ tone: 'error', text: body?.error?.message ?? 'Upload fehlgeschlagen.' });
        return;
      }
      if (activate) {
        const result = await setNutritionStatusAction(clientId, body.id, 'activate');
        if (!result.ok) {
          setMessage({
            tone: 'error',
            text: `Hochgeladen, aber nicht freigegeben: ${result.message}`,
          });
          router.refresh();
          return;
        }
      }
      formRef.current?.reset();
      setMessage({
        tone: 'success',
        text: activate
          ? 'Ernährungsplan hochgeladen und freigegeben – die Kund:in sieht ihn jetzt.'
          : 'Ernährungsplan als Entwurf hochgeladen.',
      });
      router.refresh();
    } catch {
      setMessage({
        tone: 'error',
        text: 'Die Verbindung ist fehlgeschlagen. Bitte erneut versuchen.',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div
        role={message?.tone === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className={
          message
            ? `type-body-sm rounded-xs border px-4 py-3 ${message.tone === 'error' ? 'border-error' : 'border-success'}`
            : 'sr-only'
        }
      >
        {message?.text}
      </div>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Field id={`${id}-title`} label="Titel" error={errors.title}>
          <input
            id={`${id}-title`}
            name="title"
            required
            maxLength={160}
            placeholder="z. B. Ernährungsplan Oktober"
            aria-invalid={errors.title ? true : undefined}
            className="vt-input type-body"
          />
        </Field>
        <Field id={`${id}-version`} label="Version (optional)" error={errors.versionLabel}>
          <input
            id={`${id}-version`}
            name="versionLabel"
            maxLength={60}
            placeholder="z. B. Woche 1–4"
            className="vt-input type-body"
          />
        </Field>
        <Field id={`${id}-from`} label="Gültig ab (optional)" error={errors.effectiveFrom}>
          <input
            id={`${id}-from`}
            name="effectiveFrom"
            type="date"
            className="vt-input type-body"
          />
        </Field>
      </div>
      <Field id={`${id}-file`} label={`PDF-Datei (max. ${MAX_MB} MB)`} error={errors.file}>
        <input
          id={`${id}-file`}
          name="file"
          type="file"
          accept="application/pdf,.pdf"
          required
          aria-invalid={errors.file ? true : undefined}
          className="vt-input type-body-sm"
        />
      </Field>
      {canActivate && (
        <label className="type-body-sm flex min-h-12 items-center gap-2">
          <input type="checkbox" name="activate" defaultChecked className="vt-check" />
          Sofort freigeben (ersetzt den bisher freigegebenen Plan)
        </label>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={pending}
        icon={<FileUp aria-hidden />}
        className="self-start"
      >
        Ernährungsplan hochladen
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="type-body-sm font-semibold">
        {label}
      </label>
      {children}
      {error && <p className="type-body-sm text-error">{error}</p>}
    </div>
  );
}
