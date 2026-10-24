export function sameFields<T extends object>(first: T, second: T): boolean {
  const keys = Object.keys(first) as (keyof T)[];
  return keys.length === Object.keys(second).length && keys.every((key) => first[key] === second[key]);
}
