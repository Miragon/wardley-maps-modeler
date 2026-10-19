import { beforeEach, describe, expect, it } from 'vitest';
import { ColorThemeKind, vscodeMock } from './__mocks__/vscode';
import { WardleyEditorProvider } from '../src/WardleyEditorProvider.js';
import { asTextDocument, fakeContext, fakeDocument, fakeToken, fakeWebviewPanel } from './fakes.js';

beforeEach(() => vscodeMock.reset());

async function open() {
  const { provider } = WardleyEditorProvider.register(fakeContext);
  const panel = fakeWebviewPanel();
  await provider.resolveCustomTextEditor(
    asTextDocument(fakeDocument('/a.wmap', 'title A\n')),
    panel.panel,
    fakeToken,
  );
  return { panel, html: (panel.panel.webview as { html: string }).html };
}

describe('the webview HTML (renderWebviewHtml of the modeler shell)', () => {
  it('writes the language, the mode before the first paint and the shell root', async () => {
    const { html } = await open();
    expect(html).toMatch(/<html lang="en" class="cd-shell-document" data-cd-theme="light"/);
    expect(html).toContain('<div id="app"></div>');
    expect(html).toContain('<title>Wardley Map</title>');
  });

  it('allows only its nonce script, and fonts and styles from the webview origin', async () => {
    const { html } = await open();
    const csp = /http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)![1]!;
    expect(csp).toContain("default-src 'none'");
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9]+'/);
    expect(csp).toContain('font-src vscode-webview://unit');
    expect(csp).not.toContain('unsafe-eval');
    expect(html).toContain('file:/ext/dist/webview.js');
    expect(html).toContain('file:/ext/dist/webview.css');
  });

  it('keeps the map light in a dark theme and passes high contrast', async () => {
    vscodeMock.setColorThemeKind(ColorThemeKind.Dark);
    expect((await open()).html).toMatch(/data-cd-theme="light"(?! data-cd-kontrast)/);
    vscodeMock.setColorThemeKind(ColorThemeKind.HighContrast);
    expect((await open()).html).toContain('data-cd-theme="light" data-cd-kontrast="hoch"');
  });

  it('follows a theme change while the panel lives, and stops with it', async () => {
    const { panel } = await open();
    vscodeMock.setColorThemeKind(ColorThemeKind.HighContrastLight);
    expect(panel.posted).toContainEqual({
      type: 'modelerShell.appearance',
      appearance: { theme: 'light', kontrast: 'hoch' },
    });
    panel.dispose();
    const posted = panel.posted.length;
    vscodeMock.setColorThemeKind(ColorThemeKind.Dark);
    expect(panel.posted).toHaveLength(posted);
  });

  it('never styles the webview with VS Code colours', async () => {
    expect((await open()).html).not.toMatch(/--vscode-/);
  });
});
