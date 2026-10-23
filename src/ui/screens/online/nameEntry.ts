export const NameEntryKey = {
  Backspace: 'Backspace',
  Enter: 'Enter',
  NumpadEnter: 'NumpadEnter',
  Escape: 'Escape',
} as const;

export const NameEntryOutcome = {
  Editing: 'editing',
  Confirmed: 'confirmed',
  Cancelled: 'cancelled',
} as const;

export type NameEntryOutcome = (typeof NameEntryOutcome)[keyof typeof NameEntryOutcome];

export interface NameEntryStep {
  readonly draft: string;
  readonly outcome: NameEntryOutcome;
}

export function editName(draft: string, code: string, typed: string | undefined, maxLength: number): NameEntryStep {
  switch (code) {
    case NameEntryKey.Enter:
    case NameEntryKey.NumpadEnter:
      return { draft: draft.trim(), outcome: NameEntryOutcome.Confirmed };
    case NameEntryKey.Escape:
      return { draft, outcome: NameEntryOutcome.Cancelled };
    case NameEntryKey.Backspace:
      return { draft: draft.slice(0, -1), outcome: NameEntryOutcome.Editing };
  }
  if (typed === undefined || draft.length >= maxLength) return { draft, outcome: NameEntryOutcome.Editing };
  return { draft: draft + typed, outcome: NameEntryOutcome.Editing };
}
