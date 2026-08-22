import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('./web-src', import.meta.url));
const outputDir = fileURLToPath(new URL('./www', import.meta.url));

export default defineConfig({
  root: mobileRoot,
  base: './',
  build: {
    outDir: outputDir,
    emptyOutDir: true,
  },
});
