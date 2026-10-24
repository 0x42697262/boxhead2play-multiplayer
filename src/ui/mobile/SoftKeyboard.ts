import { TextEntryKind, type TextEntry } from '../../services/ScreenFlow.ts';
import { t } from '../../text/i18n.ts';
import { NameEntryKey } from '../screens/online/nameEntry.ts';
import { textEdit } from './textEdit.ts';

export interface SoftKeyboardDependencies {
  readonly document: Document;
  readonly entry: () => TextEntry | undefined;
  readonly key: (code: string, typed?: string) => boolean;
}

const INPUT_CLASS = 'soft-keyboard-input';
const NO_CODE = '';
const AUTOCAPITALIZE: Readonly<Record<TextEntryKind, string>> = {
  [TextEntryKind.Name]: 'words',
  [TextEntryKind.Code]: 'characters',
};
const LABEL = {
  [TextEntryKind.Name]: 'mobile.keyboard.name',
  [TextEntryKind.Code]: 'mobile.keyboard.code',
} as const;
const CONFIRM_KEYS: ReadonlySet<string> = new Set([NameEntryKey.Enter, NameEntryKey.NumpadEnter]);

export class SoftKeyboard {
  private readonly input: HTMLInputElement;
  private value = '';
  private closing = false;

  constructor(private readonly deps: SoftKeyboardDependencies) {
    const input = deps.document.createElement('input');
    input.className = INPUT_CLASS;
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.enterKeyHint = 'done';
    input.setAttribute('autocorrect', 'off');
    input.addEventListener('input', (event) => this.typed(event instanceof InputEvent && event.isComposing));
    input.addEventListener('keydown', (event) => this.keyDown(event));
    input.addEventListener('blur', () => {
      if (!this.closing && deps.entry()) deps.key(NameEntryKey.Enter);
    });
    deps.document.body.append(input);
    this.input = input;
  }

  open(): void {
    const entry = this.deps.entry();
    if (!entry || this.focused) return;
    this.input.setAttribute('autocapitalize', AUTOCAPITALIZE[entry.kind]);
    this.input.setAttribute('aria-label', t(LABEL[entry.kind]));
    this.input.maxLength = entry.maxLength;
    this.show(entry.draft);
    this.input.focus({ preventScroll: true });
    this.input.setSelectionRange(entry.draft.length, entry.draft.length);
  }

  sync(): void {
    if (this.focused && !this.deps.entry()) this.close();
  }

  private get focused(): boolean {
    return this.deps.document.activeElement === this.input;
  }

  private typed(composing: boolean): void {
    const edit = textEdit(this.value, this.input.value);
    for (let index = 0; index < edit.deletions; index++) this.deps.key(NameEntryKey.Backspace);
    for (const character of edit.insertion) if (character.length === 1) this.deps.key(NO_CODE, character);
    const draft = this.deps.entry()?.draft;
    if (draft === undefined) return;
    if (composing) this.value = draft;
    else this.show(draft);
  }

  private keyDown(event: KeyboardEvent): void {
    if (CONFIRM_KEYS.has(event.code) || event.key === NameEntryKey.Enter) {
      event.preventDefault();
      this.deps.key(NameEntryKey.Enter);
      this.close();
    } else if (event.key === NameEntryKey.Escape) {
      event.preventDefault();
      this.deps.key(NameEntryKey.Escape);
      this.close();
    }
  }

  private show(draft: string): void {
    this.value = draft;
    if (this.input.value !== draft) this.input.value = draft;
  }

  private close(): void {
    this.closing = true;
    this.input.blur();
    this.closing = false;
  }
}
