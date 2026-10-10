import type { CardRow } from './data/tables';
import type { Net, NetParams } from './net';
import type { Spear } from './spear';
import { SPEAR_TOWER, type SpearTowers } from './spear-towers';
import { NET_TOWER, type Towers } from './towers';

/** Показатель карточки моряка → поле параметров сети. */
const NET_STATS: Record<string, keyof NetParams> = { net_radius: 'radius', net_capacity: 'capacity', throw_range: 'range', pull: 'pull' };

/** Новое значение по карточке: add — += value, mul — × (1 + value), set — = value. Нет value или mode → throw. */
function changer(card: CardRow): (v: number) => number {
  if (card.value === null || card.mode === null) throw new Error(`takeCard: ${card.id} без value или mode`);
  const value = card.value;
  const mode = card.mode;
  return (v) => (mode === 'add' ? v + value : mode === 'mul' ? v * (1 + value) : value);
}

/** Карточка моряка. Расчёт сейчас, изменение — в возвращённой функции. */
export function sailorUpgrade(card: CardRow, net: Net, spear: Spear): () => void {
  const change = changer(card);
  if (card.stat === 'spear_damage') {
    const damage = change(spear.damage);
    return () => (spear.damage = damage);
  }
  const key = card.stat === null ? undefined : NET_STATS[card.stat];
  if (!key) throw new Error(`takeCard: ${card.id} не меняет ни сеть, ни копьё (stat ${card.stat ?? '—'})`);
  const p = { ...net.netParams };
  p[key] = change(p[key]);
  return () => {
    net.setParams(p);
    spear.range = p.range;
  };
}

/**
 * Улучшение постройки. Расчёт сейчас, изменение — в возвращённой функции. В игре — «Сетевая башня быстрее»
 * (отдых всех сетевых башен; сеть, которая уже отдыхает, доотдыхает прежний срок) и «Копейная башня сильнее»
 * (урон всех копейных башен). Прочие → throw.
 */
export function buildingUpgrade(card: CardRow, towers: Towers, spearTowers: SpearTowers): () => void {
  if (card.target === NET_TOWER && card.stat === 'pause_s') {
    const pauseMs = changer(card)(towers.pauseMs);
    return () => (towers.pauseMs = pauseMs);
  }
  if (card.target === SPEAR_TOWER && card.stat === 'damage') {
    const damage = changer(card)(spearTowers.damage);
    return () => (spearTowers.damage = damage);
  }
  throw new Error(`takeCard: улучшение ${card.id} (${card.target}, ${card.stat ?? '—'}) ещё не в игре`);
}
