import { defineConfig } from 'vitest/config';

// base './' — относительные пути: сборка открывается из любой папки площадки (Яндекс, CrazyGames, Playgama, Poki).
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
