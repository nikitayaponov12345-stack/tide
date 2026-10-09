import { defineConfig } from 'vitest/config';

// Замер темпа (`npm run sim`): долгий, в `npm run check` не входит. verbose — чтобы console.log прошедшей проверки печатался.
export default defineConfig({
  test: {
    include: ['sim/**/*.sim.ts'],
    environment: 'node',
    testTimeout: 600_000,
    reporters: ['verbose'],
  },
});
