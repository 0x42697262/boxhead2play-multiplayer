import type { RoomIndex } from '../../adapters/assets/schemas.ts';
import { CompletionState } from '../../domain/world/CompletionState.ts';
import { GameMode } from '../../domain/world/GameMode.ts';
import { Difficulty, GameAmount, GameSpeed, PlayerCharacter } from '../../domain/world/SimulationSettings.ts';
import { KILLS_TO_WIN } from '../../domain/world/tuning.ts';
import type { SessionResult } from '../../services/GameSession.ts';
import { MENU_TICKS_PER_SECOND, type FlowControls, type Screen } from '../../services/ScreenFlow.ts';
import { levelIndexFor, withLevelIndex, type SettingsService, type UserSettings } from '../../services/SettingsService.ts';
import { t, type TextKey } from '../../text/i18n.ts';
import type { Shell } from '../shell/Shell.ts';

export const PICKER_CLASS = 'picker';

const MODE_TEXT: Readonly<Record<GameMode, TextKey>> = {
  [GameMode.Single]: 'picker.mode.single',
  [GameMode.Coop]: 'picker.mode.coop',
  [GameMode.DeathMatch]: 'picker.mode.deathMatch',
};

const CHARACTER_TEXT: Readonly<Record<PlayerCharacter, TextKey>> = {
  [PlayerCharacter.Swat]: 'character.swat',
  [PlayerCharacter.Bond]: 'character.bond',
  [PlayerCharacter.GiJoe]: 'character.giJoe',
  [PlayerCharacter.Bambo]: 'character.bambo',
};

const DIFFICULTY_TEXT: Readonly<Record<Difficulty, TextKey>> = {
  [Difficulty.Beginner]: 'difficulty.beginner',
  [Difficulty.Intermediate]: 'difficulty.intermediate',
  [Difficulty.Expert]: 'difficulty.expert',
  [Difficulty.Nightmare]: 'difficulty.nightmare',
};

const SPEED_TEXT: Readonly<Record<GameSpeed, TextKey>> = {
  [GameSpeed.Slow]: 'speed.slow',
  [GameSpeed.Normal]: 'speed.normal',
  [GameSpeed.Fast]: 'speed.fast',
};

export const RESULT_TEXT: Readonly<Record<CompletionState, TextKey>> = {
  [CompletionState.Error]: 'result.error',
  [CompletionState.Quit]: 'result.quit',
  [CompletionState.PlayerDead]: 'result.playerDead',
  [CompletionState.Player1Wins]: 'result.player1Wins',
  [CompletionState.Player2Wins]: 'result.player2Wins',
};

interface Choice<T> {
  readonly value: T;
  readonly text: string;
}

function textChoices<T extends string | number>(values: readonly T[], texts: Readonly<Record<T, TextKey>>): Choice<T>[] {
  return values.map((value) => ({ value, text: t(texts[value]) }));
}

const selectChoices = new WeakMap<HTMLSelectElement, readonly unknown[]>();

const ON_OFF: readonly Choice<boolean>[] = [
  { value: true, text: t('option.on') },
  { value: false, text: t('option.off') },
];

export interface PickerDependencies {
  readonly shell: Shell;
  readonly settings: SettingsService;
  readonly rooms: RoomIndex;
  readonly controls: FlowControls;
  readonly lastResult: SessionResult | undefined;
}

export class PickerScreen implements Screen {
  readonly name = 'picker';
  readonly ticksPerSecond = MENU_TICKS_PER_SECOND;
  private draft: UserSettings;
  private mode: GameMode = GameMode.Single;
  private roomSelect: HTMLSelectElement | undefined = undefined;

  constructor(private readonly deps: PickerDependencies) {
    this.draft = deps.settings.settings;
    deps.shell.clearStage();
    deps.shell.showContent(this.build());
  }

  tick(): void {}

  present(): void {}

  idle(): void {}

  pointer(): void {}

  suspend(): void {}

  dispose(): void {
    this.deps.shell.hideOverlay();
  }

  private build(): HTMLElement {
    const document = this.deps.shell.root.ownerDocument;
    const form = document.createElement('form');
    form.className = PICKER_CLASS;
    const title = document.createElement('h1');
    title.textContent = t('picker.title');
    form.append(title);
    const result = this.deps.lastResult;
    if (result) form.append(this.paragraph(t('picker.lastResult', { result: t(RESULT_TEXT[result.state]), score: result.score })));
    this.field(form, 'picker.mode', textChoices(Object.values(GameMode), MODE_TEXT), this.mode, (mode) => {
      this.mode = mode;
      this.refreshRooms();
    });
    this.roomSelect = this.field(form, 'picker.room', [], 0, (index) => {
      this.draft = withLevelIndex(this.draft, this.mode, index);
    });
    this.refreshRooms();
    this.field(form, 'picker.player1', textChoices(Object.values(PlayerCharacter), CHARACTER_TEXT), this.draft.characters[0], (character) => {
      this.draft = { ...this.draft, characters: [character, this.draft.characters[1]] };
    });
    this.field(form, 'picker.player2', textChoices(Object.values(PlayerCharacter), CHARACTER_TEXT), this.draft.characters[1], (character) => {
      this.draft = { ...this.draft, characters: [this.draft.characters[0], character] };
    });
    this.field(form, 'picker.difficulty', textChoices(Object.values(Difficulty), DIFFICULTY_TEXT), this.draft.difficulty, (difficulty) => (this.draft = { ...this.draft, difficulty }));
    this.field(form, 'picker.speed', textChoices(Object.values(GameSpeed), SPEED_TEXT), this.draft.gameSpeed, (gameSpeed) => (this.draft = { ...this.draft, gameSpeed }));
    const kills = Object.values(GameAmount).map((amount) => ({ value: amount, text: String(KILLS_TO_WIN[amount]) }));
    this.field(form, 'picker.kills', kills, this.draft.gameAmount, (gameAmount) => (this.draft = { ...this.draft, gameAmount }));
    this.field(form, 'picker.devils', ON_OFF, this.draft.devilsActive, (devilsActive) => (this.draft = { ...this.draft, devilsActive }));
    this.field(form, 'picker.damage', ON_OFF, this.draft.damageActive, (damageActive) => (this.draft = { ...this.draft, damageActive }));
    this.field(form, 'picker.collisions', ON_OFF, this.draft.collisionsActive, (collisionsActive) => (this.draft = { ...this.draft, collisionsActive }));
    this.field(form, 'picker.sound', ON_OFF, this.draft.soundActive, (soundActive) => (this.draft = { ...this.draft, soundActive }));
    this.field(form, 'picker.detail', ON_OFF, this.draft.detail, (detail) => (this.draft = { ...this.draft, detail }));
    const start = document.createElement('button');
    start.type = 'submit';
    start.textContent = t('picker.start');
    form.append(start, this.paragraph(t('picker.controls')));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      this.start();
    });
    return form;
  }

  private start(): void {
    const settings = this.deps.settings.update(() => this.draft);
    const room = this.deps.rooms.rooms[levelIndexFor(settings, this.mode)] ?? this.deps.rooms.rooms[0];
    if (room) this.deps.controls.startGame({ mode: this.mode, roomId: room.id });
  }

  private refreshRooms(): void {
    const select = this.roomSelect;
    if (!select) return;
    const exclusiveFor = (exclusive: RoomIndex['rooms'][number]['exclusive']): boolean =>
      this.mode === GameMode.Single ? exclusive.single : this.mode === GameMode.Coop ? exclusive.coop : exclusive.deathMatch;
    const choices = this.deps.rooms.rooms.map((room) => ({
      value: room.index,
      text: exclusiveFor(room.exclusive) ? t('picker.roomExclusive', { name: room.name }) : room.name,
    }));
    this.fill(select, choices, levelIndexFor(this.draft, this.mode));
  }

  private paragraph(text: string): HTMLElement {
    const paragraph = this.deps.shell.root.ownerDocument.createElement('p');
    paragraph.textContent = text;
    return paragraph;
  }

  private field<T>(form: HTMLElement, label: TextKey, choices: readonly Choice<T>[], value: T, onChange: (value: T) => void): HTMLSelectElement {
    const document = form.ownerDocument;
    const caption = document.createElement('label');
    caption.textContent = t(label);
    const select = document.createElement('select');
    caption.htmlFor = select.id = `picker-${label}`;
    this.fill(select, choices, value);
    select.addEventListener('change', () => {
      const chosen = selectChoices.get(select)?.[select.selectedIndex];
      if (chosen !== undefined) onChange(chosen as T);
    });
    form.append(caption, select);
    return select;
  }

  private fill<T>(select: HTMLSelectElement, choices: readonly Choice<T>[], value: T): void {
    const document = select.ownerDocument;
    selectChoices.set(
      select,
      choices.map((choice) => choice.value),
    );
    select.replaceChildren(
      ...choices.map((choice, index) => {
        const option = document.createElement('option');
        option.value = String(index);
        option.textContent = choice.text;
        option.selected = choice.value === value;
        return option;
      }),
    );
  }
}
