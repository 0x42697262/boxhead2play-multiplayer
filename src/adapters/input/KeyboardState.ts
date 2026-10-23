export class KeyboardState {
  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly released = new Set<string>();

  keyDown(code: string): void {
    if (this.held.has(code)) return;
    this.held.add(code);
    this.pressed.add(code);
  }

  keyUp(code: string): void {
    if (!this.held.delete(code)) return;
    this.released.add(code);
  }

  releaseAll(): void {
    for (const code of [...this.held]) this.keyUp(code);
  }

  isDown(code: string): boolean {
    return this.held.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  wasReleased(code: string): boolean {
    return this.released.has(code);
  }

  clearEdges(): void {
    this.pressed.clear();
    this.released.clear();
  }
}
