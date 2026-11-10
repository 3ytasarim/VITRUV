import {
  CalendarDays,
  ClipboardCheck,
  Dumbbell,
  MessageCircle,
  MessagesSquare,
  PlayCircle,
  Salad,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

/**
 * UI icon (Lucide, open licence — never a brand icon) for a "Was drin ist" item. The CMS text
 * is free, so the icon is picked by keywords in the title; unknown titles fall back to a fixed
 * order so every card still gets a distinct icon.
 */
const BY_KEYWORD: [RegExp, LucideIcon][] = [
  [/kennenlern|gespräch|call/i, MessageCircle],
  [/plan|tag für tag|kalender/i, CalendarDays],
  [/check-?in|woche|fortschritt/i, ClipboardCheck],
  [/draht|nachricht|chat|frag/i, MessagesSquare],
  [/übung|video|gezeigt|technik/i, PlayCircle],
  [/ernährung|essen/i, Salad],
  [/leben|alltag|zuhause|studio|hotel/i, Dumbbell],
];
const FALLBACK: LucideIcon[] = [
  MessageCircle,
  CalendarDays,
  ClipboardCheck,
  MessagesSquare,
  PlayCircle,
  Dumbbell,
  Salad,
  Sparkles,
];

export function IncludedIcon({ title, index }: { title: string; index: number }) {
  const Icon =
    BY_KEYWORD.find(([re]) => re.test(title))?.[1] ?? FALLBACK[index % FALLBACK.length] ?? Sparkles;
  return <Icon aria-hidden size={22} strokeWidth={1.6} />;
}
