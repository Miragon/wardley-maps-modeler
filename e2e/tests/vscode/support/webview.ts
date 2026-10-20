import type { Page } from '@playwright/test';
import type { CollaborativeWardleyModeler } from '@miragon/wardley-renderer';
import type { Appearance, ShellHandle } from '@miragon/modeler-shell';
import type { DiagramJsConnection } from '@miragon/modeler-shell/diagram-js';
import { vsCodeStubSearch } from '@miragon/modeler-shell/testing';
import type { VsCodeWebviewStub } from '@miragon/modeler-shell/testing/vscode-stub';

/*
 * The webview test page (e2e/webview/webview-test.html) runs apps/vscode/src/webview/main.ts inside
 * the shell's VS Code stub and publishes the webview's parts on window for the tests.
 */
declare global {
  interface Window {
    __modelerShellVsCodeStub?: VsCodeWebviewStub;
    /** True once the first `init` import has settled, valid or not. */
    webviewReady?: boolean;
    shell?: ShellHandle;
    modeler?: CollaborativeWardleyModeler;
    connection?: DiagramJsConnection;
  }
}

export const LIGHT: Appearance = { theme: 'light' };
export const WIDE = { width: 1280, height: 900 } as const;

export interface OpenOptions {
  size?: { width: number; height: number };
  requested?: Appearance;
  map?: 'example' | 'empty';
}

/** Opens the webview as VS Code would and resolves once the first `init` import has settled. */
export async function openWebview(page: Page, options: OpenOptions = {}): Promise<void> {
  await page.setViewportSize(options.size ?? WIDE);
  const search = new URLSearchParams(vsCodeStubSearch(options.requested ?? LIGHT));
  if (options.map === 'empty') search.set('map', 'empty');
  await page.goto(`/webview-test.html?${search.toString()}`);
  await page.waitForFunction(() => window.webviewReady === true);
}

export interface PostedMessage {
  type: string;
  [key: string]: unknown;
}

/** Everything the webview posted to the extension host so far. */
export function postedMessages(page: Page): Promise<PostedMessage[]> {
  return page.evaluate(
    () => [...(window.__modelerShellVsCodeStub?.posted ?? [])] as PostedMessage[],
  );
}

/** Waits until the webview posted a message of `type` and returns the last one. */
export async function waitForPosted(page: Page, type: string): Promise<PostedMessage> {
  await page.waitForFunction(
    (wanted) =>
      (window.__modelerShellVsCodeStub?.posted ?? []).some(
        (message) => (message as { type?: unknown }).type === wanted,
      ),
    type,
  );
  const messages = await postedMessages(page);
  return messages.filter((message) => message.type === type).at(-1)!;
}

/** Delivers a host message the way VS Code does: a `message` event on the webview's window. */
export async function postFromHost(page: Page, message: PostedMessage): Promise<void> {
  await page.evaluate((data) => window.postMessage(data, '*'), message);
}
