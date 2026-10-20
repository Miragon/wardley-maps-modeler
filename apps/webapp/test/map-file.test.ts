import { describe, expect, it } from 'vitest';
import {
  describeWarning,
  downloadFileName,
  fileBaseName,
  importErrorMessage,
  isDefaultTitle,
  MapFileError,
  slugify,
  sniffMapFormat,
} from '../src/map-file.js';

describe('slugify / fileBaseName', () => {
  it.each([
    ['Tea Shop', 'tea-shop'],
    ['  Payments   Platform v2 ', 'payments-platform-v2'],
    ['Straße & Café – Übersicht', 'strasse-cafe-ubersicht'],
    ['***', ''],
    ['A'.repeat(80), 'a'.repeat(60)],
  ])('slugifies %j to %j', (title, slug) => {
    expect(slugify(title)).toBe(slug);
  });

  it('never ends on a dash after capping', () => {
    expect(slugify(`${'a'.repeat(59)} b`)).toBe('a'.repeat(59));
  });

  it.each([[undefined], [''], ['Untitled Map'], ['New map'], ['***']])(
    'falls back to wardley-map for %j',
    (title) => {
      expect(fileBaseName(title)).toBe('wardley-map');
    },
  );

  it('recognises the default titles', () => {
    expect(isDefaultTitle('untitled map')).toBe(true);
    expect(isDefaultTitle('Tea Shop')).toBe(false);
  });
});

describe('downloadFileName', () => {
  it('names every download after the title, with distinct PNG names', () => {
    expect(downloadFileName('Tea Shop', 'wmap')).toBe('tea-shop.wmap');
    expect(downloadFileName('Tea Shop', 'json')).toBe('tea-shop.json');
    expect(downloadFileName('Tea Shop', 'svg')).toBe('tea-shop.svg');
    expect(downloadFileName('Tea Shop', 'png')).toBe('tea-shop.png');
    expect(downloadFileName('Tea Shop', 'png-transparent')).toBe('tea-shop-transparent@4x.png');
  });
});

describe('sniffMapFormat', () => {
  it.each([
    ['map.json', 'title X\ncomponent A [0.5, 0.5]', 'dsl'],
    ['map.wmap', '  {"config": {}}', 'json'],
    ['map.owm', 'title X', 'dsl'],
    ['export.png', '', 'image'],
    ['export.SVG', '', 'image'],
    ['picture.wmap', '<?xml version="1.0"?><svg/>', 'image'],
    ['picture', '\u0089PNG\r\n', 'image'],
  ])('%s with %j reads as %s', (name, text, format) => {
    expect(sniffMapFormat(name, text)).toBe(format);
  });
});

describe('importErrorMessage', () => {
  it('keeps messages written for users', () => {
    expect(importErrorMessage(new MapFileError('Pictures don’t contain the map source.'))).toBe(
      'Pictures don’t contain the map source.',
    );
  });

  it('never shows raw JSON or schema errors', () => {
    const zodLike = Object.assign(new Error('[{"code":"invalid_type","path":["config"]}]'), {
      issues: [{ code: 'invalid_type' }],
    });
    for (const error of [new SyntaxError('Unexpected token } in JSON'), zodLike]) {
      const message = importErrorMessage(error, 'map.json');
      expect(message).toBe(
        'Could not open “map.json”. Check that it contains a Wardley map (.wmap, .owm or .json).',
      );
      expect(message).not.toMatch(/token|invalid_type|\[/);
    }
  });
});

describe('describeWarning', () => {
  it('splits a DSL finding into line, message and source', () => {
    const row = describeWarning({
      message: 'Line 7: Unknown statement "compnent" — "compnent Search [0.5, 0.5]"',
      line: 7,
      source: 'compnent Search [0.5, 0.5]',
    });
    expect(row).toEqual({
      line: 7,
      message: 'Unknown statement "compnent"',
      source: 'compnent Search [0.5, 0.5]',
    });
  });

  it('keeps importer warnings without a line as they are', () => {
    expect(describeWarning({ message: 'Link: "Search" not found' })).toEqual({
      message: 'Link: "Search" not found',
    });
  });
});
