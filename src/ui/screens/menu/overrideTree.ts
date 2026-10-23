import type { ChildOverride, Overrides } from '../../../adapters/render/symbols/SymbolLibrary.ts';

type Writable<T> = { -readonly [K in keyof T]: T[K] };

export type OverrideNode = Omit<Writable<ChildOverride>, 'children'> & { children?: Record<string, OverrideNode> };

export class OverrideTree {
  private readonly root: Record<string, OverrideNode> = {};

  at(path: readonly string[]): OverrideNode {
    let level = this.root;
    let node: OverrideNode = {};
    path.forEach((name, index) => {
      node = level[name] ??= {};
      if (index < path.length - 1) level = node.children ??= {};
    });
    return node;
  }

  set(path: readonly string[], override: ChildOverride): void {
    const { children, ...rest } = override;
    const node = Object.assign(this.at(path), rest);
    if (children) node.children = { ...node.children, ...(children as Record<string, OverrideNode>) };
  }

  get overrides(): Overrides {
    return this.root;
  }
}
