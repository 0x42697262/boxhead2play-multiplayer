import { encodeClientMessage, parseServerMessage, ServerMessageType, type ClientMessage, type ServerMessage } from '../../net/protocol.ts';
import { ServerWireDecoder } from '../../net/serverWire.ts';
import type { Rng } from '../../domain/math/Rng.ts';
import { SOCKET_PATH } from '../../net/tuning.ts';
import { RECONNECT_BACKOFF_FACTOR, RECONNECT_BASE_DELAY_MS, RECONNECT_JITTER_FRACTION, RECONNECT_MAX_DELAY_MS } from './tuning.ts';

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

const DESYNCED = Symbol('desynced');

function decodeWire(decoder: ServerWireDecoder, data: ArrayBuffer): ServerMessage | undefined | typeof DESYNCED {
  let value: unknown;
  try {
    value = decoder.decode(new Uint8Array(data));
  } catch {
    return DESYNCED;
  }
  return parseServerMessage(value);
}

export function reconnectDelayMs(attempt: number, jitter: number): number {
  const backoff = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * RECONNECT_BACKOFF_FACTOR ** attempt);
  return Math.round(backoff * (1 - RECONNECT_JITTER_FRACTION * jitter));
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
  private attempt = 0;

  constructor(
    private readonly url: string,
    private readonly listener: ConnectionListener,
    private readonly jitter: Rng,
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
    const decoder = new ServerWireDecoder();
    let desynced = false;
    socket.binaryType = ARRAY_BUFFER;
    this.socket = socket;
    socket.onopen = () => {
      if (this.socket === socket) this.listener.opened();
    };
    socket.onmessage = (event) => {
      if (this.socket !== socket || desynced || !(event.data instanceof ArrayBuffer)) return;
      const message = decodeWire(decoder, event.data);
      if (message === DESYNCED) {
        desynced = true;
        this.listener.rejected(event.data.byteLength);
        socket.close();
        return;
      }
      if (!message) {
        this.listener.rejected(event.data.byteLength);
        return;
      }
      if (message.type === ServerMessageType.Welcome) this.attempt = 0;
      this.listener.message(message);
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
    this.attempt = 0;
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
    const delayMs = reconnectDelayMs(this.attempt, this.jitter.next());
    this.attempt++;
    this.cancelRetry = this.timers.after(delayMs, () => {
      this.cancelRetry = undefined;
      if (this.wanted) this.connect();
    });
  }
}
