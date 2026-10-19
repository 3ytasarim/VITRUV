'use client';

import { newItemId, scopeErrors } from './editor-state';
import { FieldGroup, TextField } from './fields';
import { RepeatableList } from './repeatable-list';
import type { EditorProps } from './section-editor';

/** FAQ: question/answer pairs with stable IDs — add, edit, remove, reorder. */
export function FaqEditor({ value, onChange, errors }: EditorProps<'faq'>) {
  return (
    <div className="flex flex-col gap-6">
      <FieldGroup legend="Abschnitt">
        <TextField
          label="Eyebrow"
          maxLength={60}
          value={value.eyebrow}
          error={errors.eyebrow}
          onChange={(v) => onChange({ ...value, eyebrow: v })}
        />
        <TextField
          label="Titel"
          required
          maxLength={120}
          value={value.title}
          error={errors.title}
          onChange={(v) => onChange({ ...value, title: v ?? '' })}
        />
      </FieldGroup>

      <RepeatableList
        heading="Fragen"
        addLabel="Frage hinzufügen"
        items={value.items}
        min={1}
        max={40}
        error={errors.items}
        onChange={(items) => onChange({ ...value, items })}
        createItem={(existing) => ({ id: newItemId('frage', existing), question: '', answer: '' })}
        itemLabel={(_, index) => `Frage ${index + 1}`}
        renderItem={(item, index, update) => {
          const e = scopeErrors(errors, `items.${index}`);
          return (
            <>
              <TextField
                label="Frage"
                required
                maxLength={200}
                value={item.question}
                error={e.question}
                onChange={(v) => update({ question: v ?? '' })}
              />
              <TextField
                label="Antwort"
                required
                multiline
                maxLength={2000}
                value={item.answer}
                error={e.answer}
                onChange={(v) => update({ answer: v ?? '' })}
              />
            </>
          );
        }}
      />
    </div>
  );
}
