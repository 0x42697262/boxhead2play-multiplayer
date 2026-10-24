import type { LobbyDto } from '../../net/protocol.ts';

export interface LobbyLink {
  readonly initialCode: string | undefined;
  show(code: string | undefined): void;
  copy(code: string): Promise<boolean>;
}

export interface LobbySource {
  readonly lobby: LobbyDto | undefined;
  subscribe(listener: () => void): () => void;
}

export interface InviteView {
  readonly code: string | undefined;
  readonly copied: boolean;
  copy(): void;
  forget(): void;
}

export class LobbyInvite implements InviteView {
  private copiedCode: string | undefined = undefined;
  private shownCode: string | undefined = undefined;

  constructor(
    private readonly client: LobbySource,
    private readonly link: LobbyLink,
  ) {}

  get code(): string | undefined {
    return this.client.lobby?.code;
  }

  get copied(): boolean {
    return this.code !== undefined && this.copiedCode === this.code;
  }

  copy(): void {
    const code = this.code;
    if (code === undefined) return;
    void this.link.copy(code).then((copied) => {
      if (copied) this.copiedCode = code;
    });
  }

  forget(): void {
    this.copiedCode = undefined;
  }

  syncAddress(): () => void {
    return this.client.subscribe(() => this.showCurrent());
  }

  private showCurrent(): void {
    const code = this.code;
    if (code === this.shownCode) return;
    this.shownCode = code;
    this.link.show(code);
  }
}
