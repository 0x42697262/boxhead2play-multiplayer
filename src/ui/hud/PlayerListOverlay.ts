import { fontFamily } from '../../adapters/assets/FontLoader.ts';
import { pingColor } from '../../adapters/render/hud/HudRenderer.ts';
import { PlayerPresence, type PlayerListRow, type PlayerListView } from '../../services/online/playerList.ts';
import { t } from '../../text/i18n.ts';
import { HEX_COLOR_DIGITS, HEX_RADIX, PERCENT, PLAYER_LIST_DETAIL_FONT_ID, PLAYER_LIST_TITLE_FONT_ID } from './tuning.ts';

export const PlayerListClass = {
  Root: 'player-list',
  Header: 'player-list-header',
  Title: 'player-list-title',
  Count: 'player-list-count',
  Rows: 'player-list-rows',
  Row: 'player-row',
  Dot: 'player-dot',
  Name: 'player-name',
  NameText: 'player-name-text',
  Life: 'player-life',
  LifeFill: 'player-life-fill',
  Status: 'player-status',
  Latency: 'player-latency',
} as const;

const FALLBACK_FONTS = 'system-ui, sans-serif';

function cssColor(rgb: number): string {
  return `#${rgb.toString(HEX_RADIX).padStart(HEX_COLOR_DIGITS, '0')}`;
}

function statusText(row: PlayerListRow): string {
  switch (row.presence) {
    case PlayerPresence.Alive:
      return t('playerList.alive');
    case PlayerPresence.Offline:
      return t('playerList.offline');
    case PlayerPresence.Dead:
      return row.respawnSeconds === undefined ? t('playerList.dead') : t('playerList.respawning', { seconds: row.respawnSeconds });
  }
}

export class PlayerListOverlay {
  private readonly root: HTMLElement;
  private readonly count: HTMLElement;
  private readonly rows: HTMLOListElement;
  private shownKey: string | undefined = undefined;

  constructor(
    private readonly document: Document,
    host: HTMLElement,
  ) {
    this.root = this.element('section', PlayerListClass.Root);
    this.root.setAttribute('aria-label', t('playerList.title'));
    this.root.setAttribute('aria-live', 'polite');
    this.root.style.setProperty('--player-list-title-font', `'${fontFamily(PLAYER_LIST_TITLE_FONT_ID)}', ${FALLBACK_FONTS}`);
    this.root.style.setProperty('--player-list-detail-font', `'${fontFamily(PLAYER_LIST_DETAIL_FONT_ID)}', ${FALLBACK_FONTS}`);
    const header = this.element('header', PlayerListClass.Header);
    const title = this.element('span', PlayerListClass.Title);
    title.textContent = t('playerList.title');
    this.count = this.element('span', PlayerListClass.Count);
    header.append(title, this.count);
    this.rows = this.element('ol', PlayerListClass.Rows);
    this.root.append(header, this.rows);
    this.root.hidden = true;
    host.append(this.root);
  }

  show(view: PlayerListView | undefined): void {
    const key = view === undefined ? undefined : JSON.stringify(view);
    if (key === this.shownKey) return;
    this.shownKey = key;
    this.root.hidden = view === undefined;
    if (view === undefined) return;
    this.count.textContent = t('playerList.count', { count: view.count, capacity: view.capacity });
    this.rows.replaceChildren(...view.rows.map((row) => this.row(row)));
  }

  private row(row: PlayerListRow): HTMLLIElement {
    const item = this.element('li', PlayerListClass.Row);
    item.dataset['presence'] = row.presence;
    item.dataset['local'] = String(row.local);
    const name = this.element('span', PlayerListClass.Name);
    const nameText = this.element('span', PlayerListClass.NameText);
    nameText.textContent = row.name || t('hud.playerName');
    const life = this.element('span', PlayerListClass.Life);
    const fill = this.element('span', PlayerListClass.LifeFill);
    fill.style.width = `${row.lifeRatio * PERCENT}%`;
    life.append(fill);
    name.append(nameText, life);
    const status = this.element('span', PlayerListClass.Status);
    status.textContent = statusText(row);
    const latency = this.element('span', PlayerListClass.Latency);
    latency.textContent = row.latencyMs === undefined ? t('playerList.noLatency') : t('playerList.latency', { ms: row.latencyMs });
    if (row.latencyMs !== undefined) latency.style.color = cssColor(pingColor(row.latencyMs));
    item.append(this.element('span', PlayerListClass.Dot), name, status, latency);
    return item;
  }

  private element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
    const created = this.document.createElement(tag);
    created.className = className;
    return created;
  }
}
