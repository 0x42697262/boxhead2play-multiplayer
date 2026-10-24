export interface ModifierState {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

const COMMAND_KEY_CODES: ReadonlySet<string> = new Set(['MetaLeft', 'MetaRight']);

export function isShortcut(event: ModifierState): boolean {
  return event.ctrlKey || event.metaKey || event.altKey;
}

export function releasesHeldKeys(code: string): boolean {
  return COMMAND_KEY_CODES.has(code);
}
