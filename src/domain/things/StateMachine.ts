export interface StateHandler {
  readonly enter?: () => void;
  readonly tick: () => void;
}

export type StateHandlers<S extends string> = Readonly<Record<S, StateHandler>>;

export class StateMachine<S extends string> {
  private currentState: S;
  private previousState: S | undefined = undefined;
  count = 0;

  constructor(
    private readonly handlers: StateHandlers<S>,
    initial: S,
  ) {
    this.currentState = initial;
  }

  get current(): S {
    return this.currentState;
  }

  get previous(): S | undefined {
    return this.previousState;
  }

  set previous(state: S | undefined) {
    this.previousState = state;
  }

  is(state: S): boolean {
    return this.currentState === state;
  }

  set(next: S): void {
    this.previousState = this.currentState;
    this.currentState = next;
    this.count = 0;
    this.handlers[next].enter?.();
  }

  tick(): void {
    this.handlers[this.currentState].tick();
  }
}
