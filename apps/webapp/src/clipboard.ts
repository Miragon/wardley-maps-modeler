/**
 * Clipboard writes that report whether they worked. `navigator.clipboard` is missing on insecure
 * origins (http://LAN-IP) and writes can be refused, so callers must never claim success blindly.
 */

/** Copies text; resolves false when the clipboard is unavailable or refuses the write. */
export async function copyText(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Copies text that is still being computed. Call it synchronously inside the click handler:
 * Safari only allows clipboard writes during the user gesture, and a ClipboardItem whose value
 * is a promise keeps that gesture while the text (e.g. a compressed share link) is produced.
 */
export async function copyTextWhenReady(text: Promise<string>): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (clipboard?.write && typeof ClipboardItem !== 'undefined') {
    try {
      const blob = text.then((value) => new Blob([value], { type: 'text/plain' }));
      await clipboard.write([new ClipboardItem({ 'text/plain': blob })]);
      return true;
    } catch {
      // Older engines reject promise values in ClipboardItem; fall back to a plain write.
    }
  }
  try {
    return await copyText(await text);
  } catch {
    return false;
  }
}
