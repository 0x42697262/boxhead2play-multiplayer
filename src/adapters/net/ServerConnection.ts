import { encodeClientMessage, parseServerMessage, type ClientMessage, type ServerMessage } from '../../net/protocol.ts';
import { WireDecoder, WireError } from '../../net/wire.ts';
import { SOCKET_PATH } from '../../net/tuning.ts';

export const RECONNECT_DELAY_MS = 1500;

export interface SocketLike {
  readonly readyState: number;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  binaryType: BinaryType;
  send(text: string): void;
  close(): void;
}

export type SocketFactory = (url: string) => SocketLike;

export interface ConnectionTimers {
  after(delayMs: number, callback: () => void): () => void;
}

export interface ConnectionListener {
  opened(): void;
  closed(): void;
  message(message: ServerMessage): void;
  rejected(byteLength: number): void;
}

const OPEN = 1;
const ARRAY_BUFFER: BinaryType = 'arraybuffer';

function decodeWire(decoder: WireDecoder, data: ArrayBuffer): ServerMessage | undefined {
  try {
    return parseServerMessage(decoder.decode(new Uint8Array(data)));
  } catch (error) {
    if (error instanceof WireError) return undefined;
    throw error;
  }
}
const SECURE_PAGE_PROTOCOL = 'https:';
const SECURE_SOCKET_PROTOCOL = 'wss:';
const PLAIN_SOCKET_PROTOCOL = 'ws:';

export function defaultServerUrl(location: { readonly protocol: string; readonly host: string }): string {
  const protocol = location.protocol === SECURE_PAGE_PROTOCOL ? SECURE_SOCKET_PROTOCOL : PLAIN_SOCKET_PROTOCOL;
  return `${protocol}//${location.host}${SOCKET_PATH}`;
}

export const browserSocketFactory: SocketFactory = (url) => new WebSocket(url);

export const browserTimers: ConnectionTimers = {
  after(delayMs, callback) {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  },
};

export class ServerConnection {
  private socket: SocketLike | undefined = undefined;
  private cancelRetry: (() => void) | undefined = undefined;
  private wanted = false;

  constructor(
    private readonly url: string,
    private readonly listener: ConnectionListener,
    private readonly createSocket: SocketFactory = browserSocketFactory,
    private readonly timers: ConnectionTimers = browserTimers,
  ) {}

  get open(): boolean {
    return this.socket?.readyState === OPEN;
  }

  get active(): boolean {
    return this.wanted;
  }

  connect(): void {
    this.wanted = true;
    if (this.socket || this.cancelRetry) return;
    const socket = this.createSocket(this.url);
    const decoder = new WireDecoder();
    socket.binaryType = ARRAY_BUFFER;
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket === socket) this.listener.opened();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || !(event.data instanceof ArrayBuffer)) return;
      const message = decodeWire(decoder, event.data);
      if (message) this.listener.message(message);
      else this.listener.rejected(event.data.byteLength);
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.listener.closed();
      if (this.wanted) this.scheduleRetry();
    };
  }

  disconnect(): void {
    this.wanted = false;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
  }

  send(message: ClientMessage): boolean {
    if (!this.socket || !this.open) return false;
    this.socket.send(encodeClientMessage(message));
    return true;
  }

  private scheduleRetry(): void {
    this.cancelRetry = this.timers.after(RECONNECT_DELAY_MS, () => {
      this.cancelRetry = undefined;
      if (this.wanted) this.connect();
    });
  }
}
