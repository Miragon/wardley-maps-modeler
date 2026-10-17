import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  encodeMap,
  decodeMap,
  encodeMapCompressed,
  decodeMapCompressed,
  readHashMap,
  readShareLink,
  shareUrl,
  shareUrlForPayload,
} from '../src/share.js';

/**
 * Characterization tests for the webapp share/URL codec (base64 + deflate-raw compression + the
 * `#mz=`/`#m=` hash round-trip). The golden values lock the exact wire format of share links.
 */

const TEA_SHOP = `title Tea Shop
component Cup of Tea [0.79, 0.61]
component Cup [0.73, 0.78]
anchor Business [0.95, 0.63]
Business -> Cup of Tea`;

function stubLocation(location: { hash?: string; origin?: string; pathname?: string }): void {
  vi.stubGlobal('location', {
    hash: location.hash ?? '',
    origin: location.origin ?? 'https://wardley.example',
    pathname: location.pathname ?? '/',
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('encodeMap / decodeMap (uncompressed, URL-safe base64)', () => {
  it('round-trips UTF-8', () => {
    expect(decodeMap(encodeMap(TEA_SHOP))).toBe(TEA_SHOP);
  });

  it.each([
    ['title Tea Shop', 'dGl0bGUgVGVhIFNob3A'],
    ['x', 'eA'],
    ['ÿÿÿ????>>>>', 'w7_Dv8O_Pz8_Pz4-Pj4'],
  ])('encodes %j to the exact golden %j', (text, golden) => {
    expect(encodeMap(text)).toBe(golden);
    expect(decodeMap(golden)).toBe(text);
  });
});

describe('encodeMapCompressed / decodeMapCompressed (deflate-raw)', () => {
  it('round-trips', async () => {
    const encoded = await encodeMapCompressed(TEA_SHOP);
    expect(await decodeMapCompressed(encoded)).toBe(TEA_SHOP);
  });

  it('shrinks a repetitive real-world map', async () => {
    const big = TEA_SHOP.repeat(20);
    const compressed = await encodeMapCompressed(big);
    const uncompressed = encodeMap(big);
    expect(compressed.length).toBeLessThan(uncompressed.length);
  });

  it('emits only URL-safe characters', async () => {
    expect(await encodeMapCompressed(TEA_SHOP)).not.toMatch(/[+/=]/);
  });
});

describe('readHashMap', () => {
  it('reads a compressed (#mz=) hash', async () => {
    const payload = await encodeMapCompressed(TEA_SHOP);
    stubLocation({ hash: `#mz=${payload}` });
    expect(await readHashMap()).toEqual({ kind: 'ok', dsl: TEA_SHOP });
  });

  it('reads a legacy uncompressed (#m=) hash', async () => {
    stubLocation({ hash: `#m=${encodeMap(TEA_SHOP)}` });
    expect(await readHashMap()).toEqual({ kind: 'ok', dsl: TEA_SHOP });
  });

  it('reads an explicitly passed hash instead of the location', async () => {
    stubLocation({ hash: '' });
    expect(await readHashMap(`#m=${encodeMap(TEA_SHOP)}`)).toEqual({ kind: 'ok', dsl: TEA_SHOP });
  });

  it.each([[''], ['#section-2'], ['#']])('reports no map for the hash %j', async (hash) => {
    stubLocation({ hash });
    expect(await readHashMap()).toEqual({ kind: 'none' });
  });

  it('reports a link truncated by a mail or chat client as corrupt', async () => {
    const payload = await encodeMapCompressed(TEA_SHOP);
    stubLocation({ hash: `#mz=${payload.slice(0, -10)}` });
    expect(await readHashMap()).toEqual({ kind: 'corrupt' });
  });

  it('reports a malformed compressed payload as corrupt', async () => {
    stubLocation({ hash: '#mz=not-valid-deflate-data' });
    expect(await readHashMap()).toEqual({ kind: 'corrupt' });
  });

  it('reports invalid base64 characters as corrupt', async () => {
    stubLocation({ hash: '#mz=%%%***' });
    expect(await readHashMap()).toEqual({ kind: 'corrupt' });
  });

  it('reports an empty payload as corrupt', async () => {
    stubLocation({ hash: '#mz=' });
    expect(await readHashMap()).toEqual({ kind: 'corrupt' });
  });
});

describe('readShareLink (pasted text)', () => {
  it('finds the map in a full pasted URL', async () => {
    const payload = await encodeMapCompressed(TEA_SHOP);
    const text = `  https://wardley.example/editor#mz=${payload}\n`;
    expect(await readShareLink(text)).toEqual({ kind: 'ok', dsl: TEA_SHOP });
  });

  it('reports a truncated pasted link as corrupt', async () => {
    const payload = await encodeMapCompressed(TEA_SHOP);
    expect(await readShareLink(`https://x.example/#mz=${payload.slice(0, 20)}`)).toEqual({
      kind: 'corrupt',
    });
  });

  it('ignores text without a map link', async () => {
    expect(await readShareLink('component Tea [0.5, 0.5]')).toEqual({ kind: 'none' });
  });
});

describe('shareUrl', () => {
  it('builds origin + pathname + #mz= + compressed payload', async () => {
    stubLocation({ origin: 'https://wardley.example', pathname: '/editor' });
    const url = await shareUrl(TEA_SHOP);
    expect(url.startsWith('https://wardley.example/editor#mz=')).toBe(true);
    // The payload must decode back to the original map.
    const payload = url.slice(url.indexOf('#mz=') + '#mz='.length);
    expect(await decodeMapCompressed(payload)).toBe(TEA_SHOP);
  });
});

describe('shareUrlForPayload', () => {
  it('reuses an already encoded payload (no second compression)', () => {
    stubLocation({ origin: 'https://wardley.example', pathname: '/' });
    expect(shareUrlForPayload('abc')).toBe('https://wardley.example/#mz=abc');
  });
});
