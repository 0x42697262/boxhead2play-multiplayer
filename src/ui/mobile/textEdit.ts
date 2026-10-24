export interface TextEdit {
  readonly deletions: number;
  readonly insertion: string;
}

export function textEdit(before: string, after: string): TextEdit {
  const old = [...before];
  const next = [...after];
  let common = 0;
  while (common < old.length && common < next.length && old[common] === next[common]) common++;
  return { deletions: old.length - common, insertion: next.slice(common).join('') };
}
