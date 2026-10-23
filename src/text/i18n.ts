import en from './locales/en.json';

export type TextKey = keyof typeof en;
type Params = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;
const catalog: Readonly<Record<TextKey, string>> = en;

export function t(key: TextKey, params: Params = {}): string {
  return catalog[key].replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function isTextKey(key: string): key is TextKey {
  return Object.hasOwn(catalog, key);
}
