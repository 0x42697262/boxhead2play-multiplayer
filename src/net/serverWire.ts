import { DrawListDecoder, DrawListEncoder } from './drawListWire.ts';
import { ServerMessageType, type ServerMessage } from './protocol.ts';
import { WireDecoder, WireEncoder } from './wire.ts';

export const WIRE_RESET_TYPES: ReadonlySet<string> = new Set([ServerMessageType.GameStarted]);

export class ServerWireEncoder {
  private readonly wire = new WireEncoder(WIRE_RESET_TYPES);
  private readonly drawList = new DrawListEncoder();

  get stringCount(): number {
    return this.wire.stringCount;
  }

  encode(message: ServerMessage): Uint8Array {
    if (WIRE_RESET_TYPES.has(message.type)) this.drawList.reset();
    if (message.type !== ServerMessageType.Frame) return this.wire.encode(message);
    const packed = { ...message, entries: this.drawList.encode(message.entries) };
    return this.wire.encode(packed);
  }
}

function messageType(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'type' in value ? value.type : undefined;
}

export class ServerWireDecoder {
  private readonly wire = new WireDecoder();
  private readonly drawList = new DrawListDecoder();

  decode(bytes: Uint8Array): unknown {
    const value = this.wire.decode(bytes);
    const type = messageType(value);
    if (typeof type === 'string' && WIRE_RESET_TYPES.has(type)) this.drawList.reset();
    if (type !== ServerMessageType.Frame || typeof value !== 'object' || value === null || !('entries' in value)) return value;
    if (!(value.entries instanceof Uint8Array)) return value;
    return { ...value, entries: this.drawList.decode(value.entries) };
  }
}
