export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: XmlElement[];
  text: string;
}

export class XmlParseError extends Error {}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};
const ENTITY_PATTERN = /&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g;
const ATTRIBUTE_PATTERN = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
const HEX_RADIX = 16;
const DECIMAL_RADIX = 10;
const HEX_PREFIX_LENGTH = 2;
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const DECLARATION_CLOSE = '?>';

export function decodeEntities(value: string): string {
  if (!value.includes('&')) return value;
  return value.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith('#x')) return String.fromCodePoint(Number.parseInt(body.slice(HEX_PREFIX_LENGTH), HEX_RADIX));
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), DECIMAL_RADIX));
    return ENTITIES[body] ?? match;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match[1];
    if (name === undefined) continue;
    attributes[name] = decodeEntities(match[3] ?? match[4] ?? '');
  }
  return attributes;
}

function skipPast(text: string, from: number, terminator: string): number {
  const end = text.indexOf(terminator, from);
  if (end < 0) throw new XmlParseError(`Unterminated markup at offset ${from}`);
  return end + terminator.length;
}

function findTagEnd(text: string, from: number): number {
  let quote = '';
  for (let index = from; index < text.length; index++) {
    const character = text[index];
    if (quote !== '') {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  throw new XmlParseError(`Unterminated tag at offset ${from}`);
}

export function parseXml(text: string): XmlElement {
  const root: XmlElement = { name: '#document', attributes: {}, children: [], text: '' };
  const stack: XmlElement[] = [root];
  let position = 0;
  while (position < text.length) {
    const open = text.indexOf('<', position);
    const current = stack[stack.length - 1] ?? root;
    if (open < 0) {
      current.text += decodeEntities(text.slice(position));
      break;
    }
    if (open > position) current.text += decodeEntities(text.slice(position, open));
    if (text.startsWith(COMMENT_OPEN, open)) {
      position = skipPast(text, open, COMMENT_CLOSE);
      continue;
    }
    if (text.startsWith('<?', open) || text.startsWith('<!', open)) {
      position = skipPast(text, open, text.startsWith('<?', open) ? DECLARATION_CLOSE : '>');
      continue;
    }
    const close = findTagEnd(text, open);
    if (text[open + 1] === '/') {
      const name = text.slice(open + 2, close).trim();
      const finished = stack.pop();
      if (finished === undefined || finished.name !== name) {
        throw new XmlParseError(`Mismatched closing tag </${name}> at offset ${open}`);
      }
      position = close + 1;
      continue;
    }
    const selfClosing = text[close - 1] === '/';
    const body = text.slice(open + 1, selfClosing ? close - 1 : close);
    const nameEnd = body.search(/[\s]/);
    const name = nameEnd < 0 ? body : body.slice(0, nameEnd);
    const element: XmlElement = {
      name,
      attributes: nameEnd < 0 ? {} : parseAttributes(body.slice(nameEnd)),
      children: [],
      text: '',
    };
    current.children.push(element);
    if (!selfClosing) stack.push(element);
    position = close + 1;
  }
  if (stack.length !== 1) throw new XmlParseError(`Unclosed element <${stack[stack.length - 1]?.name ?? ''}>`);
  const documentElement = root.children[0];
  if (documentElement === undefined) throw new XmlParseError('Document has no root element');
  return documentElement;
}

export function child(element: XmlElement, name: string): XmlElement | undefined {
  return element.children.find((candidate) => candidate.name === name);
}

export function items(element: XmlElement | undefined): XmlElement[] {
  return element === undefined ? [] : element.children.filter((candidate) => candidate.name === 'item');
}
