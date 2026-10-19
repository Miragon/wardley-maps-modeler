/**
 * The map as text in a dialog of the chrome (guide §8). Three uses, one dialog each:
 *  - OWM-DSL: editable; Apply (Cmd/Ctrl+Enter) replaces the map, a debounced diagnostics list
 *    shows what would not be drawn ("Line N: message") and jumps to the line;
 *  - JSON: read-only, deterministic (serializeMap);
 *  - Share link: shown selected when the clipboard refused the copy.
 */
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import {
  EXPORT_LABELS,
  createMapDialog,
  dialogButton,
  type MapDialog,
} from '@miragon/wardley-renderer';
import type { ShellHandle } from '@miragon/modeler-shell';
import { copyText } from './clipboard.js';

export type TextDialogMode = 'dsl' | 'json' | 'share';

export interface TextDialogHost {
  /** Imports edited DSL text (through the undoable replace). */
  apply(text: string): Promise<void>;
  /** Downloads the text as a file of the mode's format. */
  download(text: string, mode: 'dsl' | 'json'): void;
  /** Key chip for Apply, e.g. "⌘↵". */
  readonly applyKeys: string;
  /** Key chip for copying the selected text, e.g. "⌘C". */
  readonly copyKeys: string;
}

export interface OpenOptions {
  /** Text typed earlier and not applied: shown instead of the map's text, Apply enabled. */
  readonly draft?: string | undefined;
}

export interface TextDialogs {
  open(mode: TextDialogMode, text: string, options?: OpenOptions): void;
  /** The text of the open DSL or JSON dialog, for Cmd/Ctrl+S inside it. */
  openDocument(): { text: string; mode: 'dsl' | 'json' } | undefined;
  isOpen(): boolean;
  destroy(): void;
}

const DIAGNOSTICS_DELAY_MS = 300;

const TITLES: Readonly<Record<TextDialogMode, string>> = {
  dsl: 'Edit as OWM-DSL',
  json: 'View as JSON',
  share: 'Share link',
};

/** Character offset of the start of a 1-based line. */
export function lineStartOffset(text: string, line: number): number {
  let offset = 0;
  for (let current = 1; current < line; current++) {
    const next = text.indexOf('\n', offset);
    if (next === -1) return text.length;
    offset = next + 1;
  }
  return offset;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.className = className;
  if (text !== undefined) created.textContent = text;
  return created;
}

/** Selects a 1-based line of the text and scrolls it into view, a little below the top. */
function selectLine(text: HTMLTextAreaElement, line: number): void {
  const start = lineStartOffset(text.value, line);
  const end = text.value.indexOf('\n', start);
  text.focus();
  text.setSelectionRange(start, end === -1 ? text.value.length : end);
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 20;
  text.scrollTop = Math.max(0, (line - 3) * lineHeight);
}

interface DiagnosticsList {
  readonly element: HTMLUListElement;
  /** Lists what the text would not draw now. */
  render(): void;
  /** Lists it once typing paused. */
  schedule(): void;
  clear(): void;
}

/** "Line N: message" rows under the OWM-DSL text; a row selects its line. */
function createDiagnosticsList(text: HTMLTextAreaElement): DiagnosticsList {
  const list = element('ul', 'text-dialog-diagnostics');
  list.setAttribute('aria-label', 'Problems');
  list.hidden = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const render = (): void => {
    timer = undefined;
    const found = parseDSLWithDiagnostics(text.value).diagnostics;
    list.replaceChildren(
      ...found.map((diagnostic) => {
        const item = element('li', 'text-dialog-diagnostic');
        const jump = element(
          'button',
          'text-dialog-diagnostic-button',
          `Line ${diagnostic.line}: ${diagnostic.message}`,
        );
        jump.type = 'button';
        jump.addEventListener('click', () => selectLine(text, diagnostic.line));
        item.append(jump);
        return item;
      }),
    );
    list.hidden = found.length === 0;
  };
  return {
    element: list,
    render,
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(render, DIAGNOSTICS_DELAY_MS);
    },
    clear() {
      clearTimeout(timer);
      timer = undefined;
      list.hidden = true;
      list.replaceChildren();
    },
  };
}

/** Copies the text; where the clipboard refuses, selects it and says which keys copy it. */
function copyOrSelect(shell: ShellHandle, text: HTMLTextAreaElement, copyKeys: string): void {
  void copyText(text.value).then((copied) => {
    if (copied) {
      shell.toast({ status: 'success', text: 'Copied to clipboard' });
      return;
    }
    text.focus();
    text.select();
    shell.toast({ status: 'info', text: `Press ${copyKeys} to copy the selected text` });
  });
}

let nextId = 0;

interface TextDialog {
  readonly dialog: MapDialog;
  open(text: string, options: OpenOptions): void;
  currentText(): string;
}

function createTextDialog(
  shell: ShellHandle,
  mode: TextDialogMode,
  host: TextDialogHost,
  reopen: (text: string, draft: string) => void,
): TextDialog {
  const id = `text-dialog-${mode}-${(nextId += 1)}`;
  const hint = element('p', 'text-dialog-hint');
  hint.id = `${id}-hint`;
  const text = element('textarea', 'wardley-field-input text-dialog-text');
  text.spellcheck = false;
  text.autocomplete = 'off';
  text.readOnly = mode !== 'dsl';
  text.setAttribute('aria-label', TITLES[mode]);
  text.setAttribute('aria-describedby', hint.id);
  const diagnostics = createDiagnosticsList(text);
  const copy = dialogButton('Copy', mode === 'share' ? 'primary' : 'ghost');
  const download = dialogButton(
    mode === 'json' ? EXPORT_LABELS.json : EXPORT_LABELS.wmap,
    'secondary',
  );
  const apply = dialogButton('Apply', 'primary');
  apply.setAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter');

  let original = '';
  let applying = false;

  const hints: Readonly<Record<TextDialogMode, string>> = {
    dsl: `Edit the map as text, then Apply (${host.applyKeys}).`,
    json: 'Read-only. Export it or copy it to use the map elsewhere.',
    share: `Copying didn’t work here. The link is selected: press ${host.copyKeys} to copy it.`,
  };
  hint.textContent = hints[mode];

  const updateApply = (): void => {
    apply.disabled = applying || text.value === original;
  };

  const dialog = createMapDialog(shell, {
    className: `text-dialog text-dialog-${mode}`,
    title: TITLES[mode],
    beforeOpen() {
      diagnostics.clear();
      updateApply();
    },
    afterOpen() {
      text.focus();
      if (mode === 'share') {
        text.select();
      } else {
        text.setSelectionRange(0, 0);
        text.scrollTop = 0;
      }
      if (mode === 'dsl') diagnostics.render();
    },
    afterClose() {
      diagnostics.clear();
      if (mode !== 'dsl' || text.value === original) return;
      // A stray backdrop click or Escape must not cost the typed text.
      reopen(original, text.value);
    },
    content(close) {
      const body = element('div', 'wardley-dialog-body text-dialog-body');
      body.append(hint, text, diagnostics.element);
      const footer = element('div', 'wardley-dialog-footer');
      footer.append(copy);
      if (mode !== 'share') footer.append(download);
      if (mode === 'dsl') footer.append(apply);

      const doApply = async (): Promise<void> => {
        if (apply.disabled) return;
        applying = true;
        updateApply();
        try {
          await host.apply(text.value);
          original = text.value;
          close();
        } finally {
          applying = false;
          updateApply();
        }
      };
      text.addEventListener('input', () => {
        if (mode !== 'dsl') return;
        updateApply();
        diagnostics.schedule();
      });
      text.addEventListener('keydown', (event) => {
        if (mode === 'dsl' && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void doApply();
        }
      });
      apply.addEventListener('click', () => void doApply());
      download.addEventListener('click', () => {
        if (mode !== 'share') host.download(text.value, mode);
      });
      copy.addEventListener('click', () => copyOrSelect(shell, text, host.copyKeys));
      return [body, footer];
    },
  });

  return {
    dialog,
    open(value, options) {
      original = value;
      text.value = options.draft ?? value;
      dialog.open();
    },
    currentText: () => text.value,
  };
}

export function createTextDialogs(shell: ShellHandle, host: TextDialogHost): TextDialogs {
  const dialogs = {} as Record<TextDialogMode, TextDialog>;
  const keepEditing = (base: string, draft: string): void => {
    shell.toast({
      status: 'info',
      text: 'Text changes were not applied',
      action: { label: 'Keep editing', onSelect: () => dialogs.dsl.open(base, { draft }) },
    });
  };
  for (const mode of ['dsl', 'json', 'share'] as const) {
    dialogs[mode] = createTextDialog(shell, mode, host, keepEditing);
  }
  const openMode = (): TextDialogMode | undefined =>
    (['dsl', 'json', 'share'] as const).find((mode) => dialogs[mode].dialog.isOpen());

  return {
    open(mode, text, options = {}) {
      const current = openMode();
      if (current && current !== mode) dialogs[current].dialog.close();
      dialogs[mode].open(text, options);
    },
    openDocument() {
      const mode = openMode();
      if (!mode || mode === 'share') return undefined;
      return { text: dialogs[mode].currentText(), mode };
    },
    isOpen: () => openMode() !== undefined,
    destroy() {
      for (const mode of ['dsl', 'json', 'share'] as const) dialogs[mode].dialog.destroy();
    },
  };
}
