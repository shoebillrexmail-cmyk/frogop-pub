/**
 * Test helper — encodes event fields to base64 exactly the same way
 * AssemblyScript's BytesWriter does (big-endian, fields packed with no padding).
 *
 * Use this to build realistic event.data payloads for decoder tests.
 */

export type EventField =
    | { type: 'u256'; value: bigint }
    | { type: 'u64';  value: bigint }
    | { type: 'u8';   value: number }
    | { type: 'address'; value: string };   // 0x + up to 64 hex chars (32 bytes)

function writeU256(buf: number[], v: bigint): void {
    for (let i = 31; i >= 0; i--) {
        buf.push(Number((v >> BigInt(i * 8)) & 0xffn));
    }
}

function writeU64(buf: number[], v: bigint): void {
    for (let i = 7; i >= 0; i--) {
        buf.push(Number((v >> BigInt(i * 8)) & 0xffn));
    }
}

function writeU8(buf: number[], v: number): void {
    buf.push(v & 0xff);
}

function writeAddress(buf: number[], hex: string): void {
    // Normalise: strip 0x, left-pad to 64 chars (32 bytes)
    const clean = hex.replace(/^0x/i, '').padStart(64, '0');
    for (let i = 0; i < 32; i++) {
        buf.push(parseInt(clean.slice(i * 2, i * 2 + 2), 16));
    }
}

/** Encode a list of typed fields to base64 (matches BytesWriter output). */
export function buildEventData(fields: EventField[]): string {
    const buf: number[] = [];
    for (const f of fields) {
        switch (f.type) {
            case 'u256':    writeU256(buf, f.value);    break;
            case 'u64':     writeU64(buf, f.value);     break;
            case 'u8':      writeU8(buf, f.value);      break;
            case 'address': writeAddress(buf, f.value); break;
        }
    }
    return btoa(String.fromCharCode(...buf));
}
