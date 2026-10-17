/**
 * The map as text in a dialog. Three uses share it:
 *  - OWM-DSL: editable; Apply (Cmd/Ctrl+Enter) replaces the map, a debounced diagnostics list
 *    shows what would not be drawn ("Line N: message");
 *  - JSON: read-only, deterministic (serializeMap);
 *  - Share link: shown pre-selected when the clipboard refused the copy.
 */
import { parseDSLWithDiagnostics } from '@miragon/wardley-dsl';
import type { AppDialog } from './dialog.js';
import { copyText } from './clipboard.js';
import { showToast } from './toast.js';

export type TextPanelMode = 'dsl' | 'json' | 'share';

export interface TextPanelHost {
  /** Imports edited DSL text (through the undoable replace). */
  apply(text: string): Promise<void>;
  /** Downloads the text as a file of the mode's format. */
  download(text: string, mode: 'dsl' | 'json'): void;
  /** Formatted key hint for Apply, e.g. "⌘↵". */
  applyKeys: string;
  copyKeys: string;
}

interface TextPanelElements {
  dialog: AppDialog;
  title: HTMLElement;
  hint: HTMLElement;
  text: HTMLTextAreaElement;
  diagnostics: HTMLUListElement;
  copy: HTMLButtonElement;
  download: HTMLButtonElement;
  apply: HTMLButtonElement;
  close: HTMLButtonElement;
}

export interface TextPanel {
  open(mode: TextPanelMode, text: string, options?: OpenOptions): void;
  /** The text shown in the open DSL/JSON panel, for Cmd/Ctrl+S inside it. */
  openDocument(): { text: string; mode: 'dsl' | 'json' } | undefined;
}

interface OpenOptions {
  returnFocusTo?: HTMLElement | null | undefined;
  /** Put the caret on this 1-based line (e.g. the first import issue). */
  line?: number | undefined;
}

const DIAGNOSTICS_DELAY_MS = 300;

const TITLES: Record<TextPanelMode, string> = {
  dsl: 'OWM-DSL',
  json: 'JSON',
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

export function setupTextPanel(elements: TextPanelElements, host: TextPanelHost): TextPanel {
  const { dialog, text, diagnostics, apply } = elements;
  let mode: TextPanelMode = 'dsl';
  let original = '';
  let diagnosticsTimer: ReturnType<typeof setTimeout> | undefined;
  let applying = false;
  let returnFocusTo: HTMLElement | null | undefined;
  apply.title = `Apply (${host.applyKeys})`;

  const goToLine = (line: number): void => {
    const start = lineStartOffset(text.value, line);
    const end = text.value.indexOf('\n', start);
    text.focus();
    text.setSelectionRange(start, end === -1 ? text.value.length : end);
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 18;
    text.scrollTop = Math.max(0, (line - 3) * lineHeight);
  };

  const renderDiagnostics = (): void => {
    diagnosticsTimer = undefined;
    const found = parseDSLWithDiagnostics(text.value).diagnostics;
    diagnostics.replaceChildren(
      ...found.map((diagnostic) => {
        const item = document.createElement('li');
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'diagnostic';
        jump.textContent = `Line ${diagnostic.line}: ${diagnostic.message}`;
        jump.addEventListener('click', () => goToLine(diagnostic.line));
        item.append(jump);
        return item;
      }),
    );
    diagnostics.hidden = found.length === 0;
  };

  const updateApply = (): void => {
    apply.disabled = applying || text.value === original;
  };

  const doApply = async (): Promise<void> => {
    if (mode !== 'dsl' || apply.disabled) return;
    applying = true;
    updateApply();
    try {
      await host.apply(text.value);
      original = text.value;
      dialog.close();
    } finally {
      applying = false;
      updateApply();
    }
  };

  text.addEventListener('input', () => {
    if (mode !== 'dsl') return;
    updateApply();
    clearTimeout(diagnosticsTimer);
    diagnosticsTimer = setTimeout(renderDiagnostics, DIAGNOSTICS_DELAY_MS);
  });
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void doApply();
    }
  });
  apply.addEventListener('click', () => void doApply());
  elements.close.addEventListener('click', () => dialog.close());
  elements.download.addEventListener('click', () => {
    if (mode !== 'share') host.download(text.value, mode);
  });
  elements.copy.addEventListener('click', () => {
    void copyText(text.value).then((copied) => {
      if (copied) {
        showToast('Copied to clipboard', 'success');
        return;
      }
      text.focus();
      text.select();
      showToast(`Press ${host.copyKeys} to copy the selected text`, 'info');
    });
  });
  dialog.element.addEventListener('close', () => {
    clearTimeout(diagnosticsTimer);
    if (mode !== 'dsl' || text.value === original) return;
    // A stray backdrop click or Escape must not cost the typed text.
    const draft = text.value;
    const base = original;
    const reopenFocus = returnFocusTo;
    showToast('Text changes were not applied', 'info', {
      action: {
        label: 'Keep editing',
        onClick: () => {
          panel.open('dsl', base, { returnFocusTo: reopenFocus });
          text.value = draft;
          updateApply();
          renderDiagnostics();
        },
      },
    });
  });

  const hints: Record<TextPanelMode, string> = {
    dsl: `Edit the map as text, then Apply (${host.applyKeys}).`,
    json: 'Read-only. Download it or copy it to use the map elsewhere.',
    share: `Copying didn’t work here. The link is selected — press ${host.copyKeys} to copy it.`,
  };

  const panel: TextPanel = {
    open(nextMode, value, options = {}) {
      mode = nextMode;
      original = value;
      returnFocusTo = options.returnFocusTo;
      elements.title.textContent = TITLES[mode];
      elements.hint.textContent = hints[mode];
      elements.hint.hidden = false;
      text.value = value;
      text.readOnly = mode !== 'dsl';
      text.classList.toggle('is-link', mode === 'share');
      dialog.element.classList.toggle('text-dialog--link', mode === 'share');
      apply.hidden = mode !== 'dsl';
      elements.download.hidden = mode === 'share';
      elements.download.textContent = mode === 'json' ? 'Download .json' : 'Download .wmap';
      diagnostics.hidden = true;
      diagnostics.replaceChildren();
      updateApply();
      dialog.open({ returnFocusTo: options.returnFocusTo, focus: text });
      if (mode === 'share') {
        text.select();
      } else if (options.line) {
        goToLine(options.line);
      } else {
        text.setSelectionRange(0, 0);
        text.scrollTop = 0;
      }
      if (mode === 'dsl') renderDiagnostics();
    },
    openDocument() {
      if (!dialog.isOpen() || mode === 'share') return undefined;
      return { text: text.value, mode };
    },
  };
  return panel;
}
