import { config } from 'zod';

// The webview CSP forbids eval. Zod probes for it with `new Function` when the map schemas are
// built, and the browser reports every probe as a CSP violation even though zod catches the
// error. Imported first by main.ts, so it runs before any schema module.
config({ jitless: true });
