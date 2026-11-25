import type { ExerciseComparison, ExerciseProgress, ExerciseResultDto } from '@vitruv/contracts';

/**
 * Sprint 7 — coach view of recorded workout results (same wording as the iPhone app). Pure
 * formatting of what the API computed (`packages/shared/src/workout-history.ts`): nothing is
 * recalculated here, and a value that was never recorded is never shown as 0.
 */

const NOT_RECORDED = 'nicht erfasst';

/** "+3" / "−2" / "±0". */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `−${Math.abs(value)}`;
  return '±0';
}

const v = (value: number | null) => (value === null ? NOT_RECORDED : String(value));

/** The recorded result lines of one exercise. Warm-up/other types: none (status says it). */
export function resultLines(result: ExerciseResultDto, repsMax: boolean): string[] {
  switch (result.kind) {
    case 'REPS': {
      const lines = result.sets.map((set) => {
        if (!set.completed || set.actualReps === null)
          return `Satz ${set.setNumber}: nicht erledigt`;
        if (repsMax) return `Satz ${set.setNumber}: ${set.actualReps} Wdh. (MAX)`;
        return set.targetReps === null
          ? `Satz ${set.setNumber}: ${set.actualReps} Wdh.`
          : `Satz ${set.setNumber}: ${set.actualReps} von ${set.targetReps} Wdh.`;
      });
      if (result.totalReps !== null) lines.push(`Gesamt: ${result.totalReps} Wiederholungen`);
      return lines;
    }
    case 'TOTAL_REPS':
      return [
        ...(result.totalTarget !== null ? [`Gesamtziel: ${result.totalTarget} Wdh.`] : []),
        ...(result.totalReps !== null
          ? [`Geschafft: ${result.totalReps} Wdh.`, `Benötigte Sätze: ${result.setCount}`]
          : []),
        ...result.sets
          .filter((set) => set.actualReps !== null)
          .map((set) => `Satz ${set.setNumber}: ${set.actualReps} Wdh.`),
      ];
    case 'ROUNDS': {
      const config = result.interval;
      return [
        ...(config && config.rounds !== null
          ? [
              `${config.rounds} Runden · ${config.workSeconds ?? '–'} Sek. Belastung · ${config.restSeconds ?? '–'} Sek. Pause`,
            ]
          : []),
        ...(result.roundsCompleted !== null
          ? [
              config?.rounds != null
                ? `Runden geschafft: ${result.roundsCompleted} von ${config.rounds}`
                : `Runden geschafft: ${result.roundsCompleted}`,
            ]
          : []),
      ];
    }
    case 'NONE':
      return [];
  }
}

/** "Vorher → jetzt" lines; null = the exercise has no score (Warm-up …). */
export function comparisonLines(item: ExerciseComparison): string[] | null {
  const current = item.current.result;
  if (current.kind === 'NONE') return null;
  const previous = item.previous;
  if (!previous) return ['Noch keine Vergleichsdaten'];
  const before = previous.result;
  const lines: string[] = [];
  if (current.kind === 'REPS') {
    for (const set of item.setDifferences) {
      const line = `Satz ${set.setNumber}: ${v(set.previous)} → ${v(set.current)}`;
      lines.push(set.difference === null ? line : `${line} (${signed(set.difference)})`);
    }
  }
  if (current.kind === 'REPS' || current.kind === 'TOTAL_REPS')
    lines.push(`Gesamt: ${v(before.totalReps)} → ${v(current.totalReps)} Wdh.`);
  if (current.kind === 'TOTAL_REPS') lines.push(`Sätze: ${before.setCount} → ${current.setCount}`);
  if (current.kind === 'ROUNDS')
    lines.push(`Runden: ${v(before.roundsCompleted)} → ${v(current.roundsCompleted)}`);
  if (item.configChanged) lines.push('Andere Runden-Einstellung als beim letzten Mal');
  if (item.difference !== null) lines.push(`Differenz: ${signed(item.difference)}`);
  return lines;
}

/** The text alternative of the progress chart; null = fewer than two recorded points. */
export function progressSummary(progress: ExerciseProgress): string | null {
  const values = progress.points.map((p) => p.value);
  if (values.length < 2) return null;
  const unit = progress.kind === 'ROUNDS' ? 'Runden' : 'Wiederholungen';
  return `${values.length} Trainings. Erster Wert ${values[0]}, letzter Wert ${values.at(-1)}, bester Wert ${Math.max(...values)} ${unit}.`;
}

/** SVG polyline points (oldest → newest) in a [0,width]×[0,height] box; y grows downwards. */
export function chartPoints(values: readonly number[], width: number, height: number): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  return values
    .map((value, i) => {
      const x = values.length > 1 ? i * step : width / 2;
      const y = max === min ? height / 2 : height - ((value - min) / span) * height;
      return `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`;
    })
    .join(' ');
}
