import { defineConfig } from 'vite';

// Konsumiert die gebauten Lib-Pakete (dist) ueber die pnpm-Workspace-Symlinks.
// Verifiziert damit den echten Library-Build, nicht nur die Quellen.
export default defineConfig({
  server: {
    port: 5180,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
