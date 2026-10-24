import { lobbyCodeFromUrl, lobbyLinkUrl } from '../../net/lobbyCode.ts';
import type { LobbyLink } from '../../services/online/LobbyInvite.ts';

const COPY_COMMAND = 'copy';
const HIDDEN_FIELD_STYLE = 'position:fixed;opacity:0;pointer-events:none';

export class BrowserLobbyLink implements LobbyLink {
  readonly initialCode: string | undefined;

  constructor(private readonly view: Window) {
    this.initialCode = lobbyCodeFromUrl(view.location.href);
  }

  show(code: string | undefined): void {
    const { href } = this.view.location;
    const next = lobbyLinkUrl(href, code);
    if (next !== href) this.view.history.replaceState(this.view.history.state, '', next);
  }

  async copy(code: string): Promise<boolean> {
    const text = lobbyLinkUrl(this.view.location.href, code);
    try {
      await this.view.navigator.clipboard.writeText(text);
      return true;
    } catch {
      return this.copyWithField(text);
    }
  }

  private copyWithField(text: string): boolean {
    const { document } = this.view;
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('style', HIDDEN_FIELD_STYLE);
    document.body.append(field);
    field.select();
    const copied = document.execCommand(COPY_COMMAND);
    field.remove();
    return copied;
  }
}
