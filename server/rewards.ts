import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** Coins for finishing things, earned once each. One table, so the amounts are easy to change. */
export const COINS = { lesson: 100, build: 30, unit: 30, capstone: 100, mastery: 20 } as const;

export interface Reward { coins: number; title: string }
/** Every award a learner can earn, by key: lesson:<id>, build:<id>, unit:<id> and mastery:<id>,
 * read from the lessons, guided builds and Academy units in the content folder. */
export function loadRewards(content: string) {
  const rewards = new Map<string, Reward>();
  const read = (dir: string) => readdirSync(dir).filter(file => file.endsWith('.json') && !file.endsWith('-game.json')).map(file => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { id: string; title: string; kind?: string; unit?: { capstone?: boolean } });
  for (const build of read(path.join(content, 'builds'))) {
    if (build.kind === 'lesson') rewards.set(`lesson:${build.id}`, { coins: COINS.lesson, title: `Lesson: ${build.title}` });
    else rewards.set(`build:${build.id}`, { coins: COINS.build, title: `Guided build: ${build.title}` });
  }
  for (const unit of read(path.join(content, 'academy', 'units'))) {
    if (unit.unit?.capstone) rewards.set(`unit:${unit.id}`, { coins: COINS.capstone, title: `Big project: ${unit.title}` });
    else {
      rewards.set(`unit:${unit.id}`, { coins: COINS.unit, title: `Unit: ${unit.title}` });
      rewards.set(`mastery:${unit.id}`, { coins: COINS.mastery, title: `Mastered: ${unit.title}` });
    }
  }
  return rewards;
}
