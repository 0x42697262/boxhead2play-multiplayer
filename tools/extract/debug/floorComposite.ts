import type { DisplayItem, Graphic, PixelMatrix, Room, SymbolsCatalog } from '../../../src/adapters/assets/schemas.ts';

export type SvgSource = (libraryPath: string) => string;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const FFDEC_NAMESPACE = 'https://www.free-decompiler.com/flash';
const SVG_BODY = /<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/;
const ID_ATTRIBUTE = /\bid="([^"]+)"/g;
const LOCAL_REFERENCE = /(url\(#|href="#)([^)"]+)/g;

export function inlineSvgBody(svg: string, idPrefix: string): string {
  const body = SVG_BODY.exec(svg)?.[1] ?? '';
  return body
    .replace(ID_ATTRIBUTE, (_match, id: string) => `id="${idPrefix}${id}"`)
    .replace(LOCAL_REFERENCE, (_match, prefix: string, id: string) => `${prefix}${idPrefix}${id}`);
}
const MARKER_RADIUS_PX = 6;
const MARKER_FONT_PX = 8;
const MARKER_COLOR = '#ff00ff';
const SIZE_COLOR = '#ff0000';
const COVER_OPACITY = 0.5;
const BUTTON_UP_STATE = 'up';

function matrixAttribute(matrix: PixelMatrix): string {
  return `matrix(${matrix.join(' ')})`;
}

class CompositeWriter {
  private readonly definitions = new Map<string, string>();
  private readonly catalog: SymbolsCatalog;
  private readonly source: SvgSource;
  private readonly hidden: ReadonlySet<number>;

  constructor(catalog: SymbolsCatalog, source: SvgSource, hidden: ReadonlySet<number>) {
    this.catalog = catalog;
    this.source = source;
    this.hidden = hidden;
  }

  private graphic(key: string, entry: Graphic, bodyInCharacterSpace = false): string {
    if (!this.definitions.has(key)) {
      const { xMin, yMin } = entry.bounds;
      const body = inlineSvgBody(this.source(entry.svg), `${key}_`);
      const offset = bodyInCharacterSpace ? '' : ` transform="translate(${xMin} ${yMin})"`;
      this.definitions.set(key, `<g id="${key}"${offset}>${body}</g>`);
    }
    return `<use xlink:href="#${key}"/>`;
  }

  character(characterId: number, ratio = 0): string {
    const key = String(characterId);
    const shape = this.catalog.shapes[key];
    if (shape !== undefined) return this.graphic(`s${key}`, shape);
    const text = this.catalog.texts[key];
    if (text !== undefined) return this.graphic(`t${key}`, text);
    const morph = this.catalog.morphShapes[key]?.ratios[String(ratio)];
    if (morph !== undefined) return this.graphic(`m${key}_${ratio}`, morph, true);
    const button = this.catalog.buttons[key];
    if (button !== undefined) {
      return button.records
        .filter((record) => record.states.includes(BUTTON_UP_STATE))
        .map((record) => `<g transform="${matrixAttribute(record.matrix)}">${this.character(record.characterId)}</g>`)
        .join('');
    }
    const sprite = this.catalog.sprites[key];
    if (sprite === undefined) return '';
    return (sprite.frames[0] ?? []).map((item) => this.item(item)).join('');
  }

  item(item: DisplayItem): string {
    if (this.hidden.has(item.characterId) || item.visible === false || item.clipDepth !== undefined) return '';
    const opacity = item.colorTransform === undefined ? '' : ` opacity="${item.colorTransform.aMult}"`;
    return `<g transform="${matrixAttribute(item.matrix)}"${opacity}>${this.character(item.characterId, item.ratio ?? 0)}</g>`;
  }

  translated(x: number, y: number, body: string, extra = ''): string {
    return `<g transform="translate(${x} ${y})"${extra}>${body}</g>`;
  }

  defs(): string {
    return `<defs>${[...this.definitions.values()].join('')}</defs>`;
  }
}

export function composeFloorSvg(catalog: SymbolsCatalog, room: Room, source: SvgSource): string {
  const writer = new CompositeWriter(catalog, source, new Set(room.hiddenCharacterIds));
  const background = room.background.map((item) => writer.item(item)).join('');
  const pieces = room.pieces.map((piece) => writer.translated(piece.position.x, piece.position.y, writer.character(piece.characterId))).join('');
  const covers = room.pieces
    .map((piece) =>
      piece.coverPosition === null || piece.coverCharacterId === null
        ? ''
        : writer.translated(piece.coverPosition.x, piece.coverPosition.y, writer.character(piece.coverCharacterId), ` opacity="${COVER_OPACITY}"`),
    )
    .join('');
  const markers = room.initObjects
    .filter((init) => init.kind !== 'Piece' && init.kind !== 'CollisionSolid')
    .map(
      (init) =>
        `<g transform="translate(${init.position.x} ${init.position.y}) rotate(${init.rotationDegrees})"><circle r="${MARKER_RADIUS_PX}" fill="none" stroke="${MARKER_COLOR}"/><line x2="${MARKER_RADIUS_PX * 2}" stroke="${MARKER_COLOR}"/><text font-size="${MARKER_FONT_PX}" fill="${MARKER_COLOR}">${init.kind}</text></g>`,
    )
    .join('');
  const solids = room.initObjects
    .filter((init) => init.kind === 'CollisionSolid')
    .map(
      (init) =>
        `<rect x="${init.position.x}" y="${init.position.y}" width="${init.position2.x - init.position.x}" height="${init.position2.y - init.position.y}" fill="none" stroke="${MARKER_COLOR}" stroke-dasharray="2"/>`,
    )
    .join('');
  const { width, height } = room.size;
  const size = `<rect width="${width}" height="${height}" fill="none" stroke="${SIZE_COLOR}"/>`;
  return `<svg xmlns="${SVG_NAMESPACE}" xmlns:xlink="${XLINK_NAMESPACE}" xmlns:ffdec="${FFDEC_NAMESPACE}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${writer.defs()}${background}${pieces}${covers}${solids}${markers}${size}</svg>`;
}
