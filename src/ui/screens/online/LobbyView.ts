import { PLAYER_NAME_MAX_LENGTH } from '../../../net/tuning.ts';
import type { PlayerCharacter } from '../../../domain/world/SimulationSettings.ts';
import { t, type TextKey } from '../../../text/i18n.ts';
import { CHARACTER_CHOICES, LobbyCommand, type LobbyViewModel } from './lobbyModel.ts';

export const LobbyClass = {
  Panel: 'lobby',
  Title: 'lobby-title',
  Status: 'lobby-status',
  Online: 'lobby-status-online',
  Field: 'lobby-field',
  Section: 'lobby-section',
  Heading: 'lobby-heading',
  List: 'lobby-list',
  Row: 'lobby-row',
  Muted: 'lobby-muted',
  Notice: 'lobby-notice',
  Commands: 'lobby-commands',
  Button: 'lobby-button',
} as const;

const COMMAND_LABELS: Readonly<Record<LobbyCommand, TextKey>> = {
  [LobbyCommand.Host]: 'online.host',
  [LobbyCommand.Back]: 'online.back',
  [LobbyCommand.Start]: 'online.start',
  [LobbyCommand.JoinGame]: 'online.joinGame',
  [LobbyCommand.ChangeLevel]: 'online.changeLevel',
  [LobbyCommand.Leave]: 'online.leave',
};

const NEEDS_CONNECTION: ReadonlySet<LobbyCommand> = new Set([LobbyCommand.Host, LobbyCommand.Start, LobbyCommand.JoinGame, LobbyCommand.ChangeLevel]);

export interface LobbyViewActions {
  command(command: LobbyCommand): void;
  join(lobbyId: string): void;
  rename(name: string): void;
  character(character: PlayerCharacter): void;
}

export class LobbyView {
  readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly status: HTMLElement;
  private readonly characterSelect: HTMLSelectElement;
  private readonly body: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly commands: HTMLElement;

  constructor(
    private readonly document: Document,
    name: string,
    private readonly actions: LobbyViewActions,
  ) {
    this.root = this.element('section', LobbyClass.Panel);
    this.title = this.element('h1', LobbyClass.Title);
    this.status = this.element('p', LobbyClass.Status);
    const nameInput = document.createElement('input');
    nameInput.maxLength = PLAYER_NAME_MAX_LENGTH;
    nameInput.value = name;
    nameInput.addEventListener('change', () => actions.rename(nameInput.value));
    this.characterSelect = document.createElement('select');
    for (const choice of CHARACTER_CHOICES) {
      const option = document.createElement('option');
      option.value = String(choice.value);
      option.textContent = choice.label;
      this.characterSelect.append(option);
    }
    this.characterSelect.addEventListener('change', () => {
      const choice = CHARACTER_CHOICES.find((candidate) => String(candidate.value) === this.characterSelect.value);
      if (choice) actions.character(choice.value);
    });
    const fields = this.element('div', LobbyClass.Section);
    fields.append(this.field(t('online.name'), nameInput), this.field(t('online.character'), this.characterSelect));
    this.body = this.element('div', LobbyClass.Section);
    this.notice = this.element('p', LobbyClass.Notice);
    this.commands = this.element('div', LobbyClass.Commands);
    this.root.append(this.title, this.status, fields, this.body, this.notice, this.commands);
  }

  update(model: LobbyViewModel): void {
    this.title.textContent = model.title;
    this.status.textContent = model.status;
    this.status.classList.toggle(LobbyClass.Online, model.online);
    this.characterSelect.value = String(model.character);
    this.notice.textContent = model.notice ?? '';
    this.notice.hidden = model.notice === undefined;
    this.body.replaceChildren(...this.bodyContent(model));
    this.commands.replaceChildren(...model.commands.map((command) => this.button(t(COMMAND_LABELS[command]), !model.online && NEEDS_CONNECTION.has(command), () => this.actions.command(command))));
  }

  private bodyContent(model: LobbyViewModel): HTMLElement[] {
    if (model.browser) {
      const list = this.element('ul', LobbyClass.List);
      for (const row of model.browser.rows) {
        const item = this.element('li', LobbyClass.Row);
        const label = this.element('span');
        label.textContent = row.text;
        item.append(label, this.button(t('online.join'), !row.joinable, () => this.actions.join(row.id)));
        list.append(item);
      }
      if (model.browser.rows.length === 0) list.append(this.text('li', model.browser.empty, LobbyClass.Muted));
      return [this.text('h2', t('online.games'), LobbyClass.Heading), list];
    }
    if (!model.room) return [];
    const { room } = model;
    const members = this.element('ul', LobbyClass.List);
    for (const member of room.members) members.append(this.text('li', member.text, member.offline ? LobbyClass.Muted : LobbyClass.Row));
    const content = [
      this.text('h2', room.name, LobbyClass.Heading),
      this.text('p', room.level),
      this.text('p', room.options, LobbyClass.Muted),
      this.text('h2', t('online.players'), LobbyClass.Heading),
      members,
    ];
    if (room.waitingText) content.push(this.text('p', room.waitingText, LobbyClass.Muted));
    return content;
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const wrapper = this.element('label', LobbyClass.Field);
    wrapper.append(this.text('span', label), control);
    return wrapper;
  }

  private button(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
    const button = this.document.createElement('button');
    button.type = 'button';
    button.className = LobbyClass.Button;
    button.textContent = label;
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  }

  private text(tag: string, content: string, className?: string): HTMLElement {
    const element = this.element(tag, className);
    element.textContent = content;
    return element;
  }

  private element(tag: string, className?: string): HTMLElement {
    const element = this.document.createElement(tag);
    if (className) element.className = className;
    return element;
  }
}
