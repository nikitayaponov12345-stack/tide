import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DATA } from '../src/data';
import { GATE_L2_MS, gate, toMarkdown } from '../src/sim/report';
import { DEFAULT_SIM, runSim } from '../src/sim/run';

/** Ворота: сиды 1–200 до 2-го уровня, не дальше 120 с игры. Кривая: сиды 1–20 до 40-го уровня или 40 минут игры. */
const GATE_SEEDS = 200;
const GATE_MAX_GAME_MS = 120_000;
const CURVE_SEEDS = 20;

const seeds = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

it('темп бота «человек»: ворота M0 и кривая уровней', () => {
  const gateRuns = seeds(GATE_SEEDS).map((seed) => runSim(DATA, seed, { ...DEFAULT_SIM, maxGameMs: GATE_MAX_GAME_MS, untilLevel: 2 }));
  const g = gate(gateRuns.map((r) => r.levelGameMs[2] ?? null));
  const curve = seeds(CURVE_SEEDS).map((seed) => runSim(DATA, seed));
  const md = toMarkdown(g, curve);
  // Отчёт пишется до проверки: при проваленных воротах он тоже нужен.
  mkdirSync('build/sim', { recursive: true });
  writeFileSync('build/sim/tempo.md', md);
  writeFileSync('build/sim/tempo.json', `${JSON.stringify({ gate: g, gateL2Ms: gateRuns.map((r) => r.levelGameMs[2]), curve }, null, 2)}\n`);
  console.log(md);
  expect(g.medianMs).toBeLessThanOrEqual(GATE_L2_MS);
});
