/** Local, deterministic matching of a child's wish to reviewed recipes. It runs
 * before any AI request and needs no key. Words are normalized (accents, case),
 * lightly stemmed, mapped through a small table of everyday synonyms, and scored
 * by how rare and how central each shared word is to a recipe. */
export interface Matchable { id: string; title: string; phrases: string[] }
export interface Match<T extends Matchable> { recipe: T; score: number }

const STOP = new Set(('a an the i im i\'m me my mine you your we us our it its it\'s he him his she her they them their this that these those to too of in on at by for from with into onto ' +
  'and or but so if then than when while what how do does did can could would should will want wanna like lets let make makes made please just some something ' +
  'thing things stuff be is are was were am been get gets got have has had there here one ones guy really very also want need way using use uses').split(' '));
/** Everyday words mapped to one canonical word. Keys and values are stems. */
const SYNONYMS: Record<string, string> = {
  // movement
  follow: 'chase', pursue: 'chase', hunt: 'chase', toward: 'chase', towards: 'chase', stalk: 'chase',
  keyboard: 'arrow', key: 'arrow', arrows: 'arrow', steer: 'control', drive: 'control', go: 'move', goe: 'move', travel: 'move', run: 'move', fly: 'move', swim: 'move', moving: 'move',
  slide: 'glide', float: 'glide', drift: 'glide', smooth: 'glide', smoothly: 'glide', slowly: 'glide', slow: 'glide',
  hop: 'jump', leap: 'jump', fall: 'gravity', land: 'gravity', drop: 'gravity', platform: 'gravity', mario: 'gravity',
  ricochet: 'bounce', rebound: 'bounce', pong: 'bounce',
  wander: 'random', roam: 'random', anywhere: 'random', randomly: 'random', place: 'random', spot: 'random', somewhere: 'random', teleport: 'random',
  escape: 'away', flee: 'away', avoid: 'away', dodge: 'away', scare: 'away', scared: 'away',
  mouse: 'pointer', cursor: 'pointer', finger: 'pointer',
  wall: 'edge', side: 'edge', border: 'edge', boundary: 'edge', sides: 'edge',
  // looks
  talk: 'say', speak: 'say', speech: 'say', bubble: 'say', word: 'say', hello: 'say', hi: 'say', greet: 'say', text: 'say', sentence: 'say', chat: 'say', tell: 'say',
  costume: 'costume', picture: 'costume', frame: 'costume', animate: 'animation', animation: 'animation', leg: 'animation', feet: 'animation', foot: 'animation', cycle: 'animation', step: 'animation',
  bigger: 'grow', big: 'grow', larger: 'grow', large: 'grow', huge: 'grow', giant: 'grow', taller: 'grow', tall: 'grow', smaller: 'shrink', small: 'shrink', tiny: 'shrink', shorter: 'shrink', size: 'grow', scale: 'grow', zoom: 'grow', pulse: 'grow',
  disappear: 'hide', vanish: 'hide', invisible: 'hide', blink: 'hide', poof: 'hide', background: 'backdrop', scenery: 'backdrop', scene: 'backdrop',
  // touching and input
  hit: 'touch', bump: 'touch', collide: 'touch', crash: 'touch', overlap: 'touch', contact: 'touch', touche: 'touch', touching: 'touch',
  monster: 'enemy', ghost: 'enemy', zombie: 'enemy', villain: 'enemy', bad: 'enemy',
  coin: 'coin', gem: 'coin', star: 'coin', treasure: 'coin', apple: 'coin', food: 'coin', item: 'coin', collectible: 'coin', crystal: 'coin', diamond: 'coin', jewel: 'coin', gold: 'coin', fruit: 'coin', cherry: 'coin', berry: 'coin', banana: 'coin', candy: 'coin', cookie: 'coin', prize: 'coin', loot: 'coin', collect: 'collect', gather: 'collect', grab: 'collect', pick: 'collect', eat: 'collect', take: 'collect',
  tap: 'click', press: 'click', clicking: 'click', clickable: 'click', poke: 'click', respond: 'click', react: 'click',
  // game
  point: 'score', scoreboard: 'score', heart: 'life', health: 'life', hp: 'life', tries: 'life', damage: 'life', die: 'life', live: 'life', lives: 'life',
  timer: 'time', clock: 'time', countdown: 'time', second: 'time', stopwatch: 'time', limit: 'time',
  victory: 'win', winner: 'win', winning: 'win', won: 'win', celebrate: 'win', celebration: 'win', complete: 'win', trophy: 'win', medal: 'win', beat: 'win', beaten: 'win',
  lose: 'gameover', lost: 'gameover', fail: 'gameover', clone: 'clone', copy: 'clone', duplicate: 'clone', spawn: 'clone', create: 'clone', many: 'clone', lot: 'clone', endless: 'clone',
  shoot: 'shoot', fire: 'shoot', laser: 'shoot', bullet: 'shoot', projectile: 'shoot', throw: 'shoot', launch: 'shoot',
  // sound and drawing
  noise: 'sound', beep: 'sound', ding: 'sound', sfx: 'sound', effect: 'sound', whoosh: 'sound', boom: 'sound', bang: 'sound', pop: 'sound', splash: 'sound', meow: 'sound', woof: 'sound', roar: 'sound', squeak: 'sound', music: 'music', song: 'music', tune: 'music', melody: 'music',
  quiet: 'stop', silence: 'stop', mute: 'stop', sketch: 'draw', paint: 'draw', trace: 'draw', pen: 'draw', line: 'draw', box: 'square', rectangle: 'square', swirl: 'spiral', colorful: 'rainbow', colour: 'color', footprint: 'stamp', trail: 'stamp',
  // data and fixes
  record: 'best', tally: 'count', counter: 'count', every: 'each', all: 'each', freeze: 'loop', froze: 'loop', frozen: 'loop', forever: 'loop', stuck: 'loop', quick: 'fast', speed: 'fast',
};
/** A light English stemmer: plural and -ing/-ed endings, restoring a final e
 * (chasing → chase, bouncing → bounce) and undoubling (running → run). */
function stem(word: string) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 3 && /(ss|x|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) return w.slice(0, -1);
  const suffix = w.length > 5 && w.endsWith('ing') ? 3 : w.length > 4 && w.endsWith('ed') ? 2 : 0;
  if (!suffix) return w;
  w = w.slice(0, -suffix);
  if (/([^aeiouls])\1$/.test(w)) return w.slice(0, -1);
  if (/(^|[^aeiou])[aeiou][^aeiouwxy]$/.test(w) || /[^aeiou]c$/.test(w)) return w + 'e';
  return w;
}
/** Two-word expressions that mean one thing. */
const EXPRESSIONS: [RegExp, string][] = [
  [/\bcount(?:s|ing)? ?down\b/g, 'countdown'], [/\bgame over\b/g, 'gameover'], [/\bran away\b|\brun(?:s|ning)? away\b|\bget away\b/g, 'away'],
  [/\bhigh ?score\b/g, 'best'], [/\bbad guys?\b/g, 'enemy'], [/\b(?:go(?:es)?|come|comes|runs?|running|swim(?:s|ming)?|fl(?:y|ies|ying)|hunt(?:s|ing)?) after\b/g, 'chase'],
  [/\bspace ?bar\b/g, 'space'], [/\bup,? down,? left,? (?:and )?right\b|\bup and down and left and right\b/g, 'arrow'], [/\bon (?:its|his|her|their) own\b|\bby (?:it|him|her|them)sel(?:f|ves)\b/g, 'random'], [/\btry again\b|\bplay again\b/g, 'gameover'],
];
/** True when a and b differ by one insertion, deletion, substitution or swap of neighbours. */
function oneEdit(a: string, b: string) {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
export function terms(text: string): string[] {
  let normal = text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[’']/g, '');
  for (const [pattern, word] of EXPRESSIONS) normal = normal.replace(pattern, ` ${word} `);
  const words = normal.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out: string[] = [];
  for (const word of words) {
    if (STOP.has(word)) continue;
    const base = SYNONYMS[word] ?? stem(word);
    const canonical = SYNONYMS[base] ?? base;
    if (!STOP.has(canonical)) out.push(canonical);
  }
  return out;
}

/** Scoring weights. Chosen by a grid search that held out each recipe phrase in
 * turn and asked for its recipe (best leave-one-out accuracy, first in grid
 * order); the separate held-out wishes in the tests were not used to choose. */
export interface Weights { title: number; phrase: number; coverage: number }
export const WEIGHTS: Weights = { title: 0.5, phrase: 0.6, coverage: 0.25 };
interface Index<T extends Matchable> { recipe: T; title: Set<string>; phrases: Set<string>[]; counts: Map<string, number> }
/** Rank recipes for a wish. Scores below the threshold are dropped. */
export function rankRecipes<T extends Matchable>(wish: string, recipes: readonly T[], limit = 3, weights: Weights = WEIGHTS): Match<T>[] {
  let query = [...new Set(terms(wish))];
  if (!query.length) return [];
  const index: Index<T>[] = recipes.map(recipe => {
    const phrases = [...recipe.phrases, recipe.id.replace(/-/g, ' ')].map(p => new Set(terms(p)));
    const counts = new Map<string, number>();
    for (const set of [...phrases, new Set(terms(recipe.title))]) for (const t of set) counts.set(t, (counts.get(t) ?? 0) + 1);
    return { recipe, title: new Set(terms(recipe.title)), phrases, counts };
  });
  const df = new Map<string, number>();
  for (const entry of index) for (const t of entry.counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  // Children misspell: an unknown word one typo away from exactly one known word
  // (a recipe word, or an everyday synonym of one) counts as that word.
  const known = new Map<string, string>([...df.keys()].map(t => [t, t]));
  for (const [word, canonical] of Object.entries(SYNONYMS)) if (df.has(canonical)) known.set(word, canonical);
  for (const [i, t] of query.entries()) {
    if (df.has(t) || t.length < 4) continue;
    const near = new Set([...known].filter(([word]) => word.length >= 4 && oneEdit(t, word)).map(([, canonical]) => canonical));
    if (near.size === 1) query[i] = [...near][0];
  }
  query = [...new Set(query)];
  const idf = (t: string) => Math.log(1 + recipes.length / (df.get(t) ?? recipes.length * 4));
  const matches = index.map(({ recipe, title, phrases, counts }) => {
    let score = 0;
    for (const t of query) {
      const count = counts.get(t); if (!count) continue;
      score += idf(t) * (1 + Math.log(count) / 2 + (title.has(t) ? weights.title : 0));
    }
    // A wish that contains every word of one of the recipe's phrases is a strong signal.
    for (const phrase of phrases) if (phrase.size && [...phrase].every(t => query.includes(t))) score += weights.phrase * [...phrase].reduce((sum, t) => sum + idf(t), 0);
    // Prefer recipes that explain more of what the child asked for.
    const known = query.filter(t => df.has(t)), covered = known.filter(t => counts.has(t));
    const coverage = known.length ? covered.reduce((sum, t) => sum + idf(t), 0) / known.reduce((sum, t) => sum + idf(t), 0) : 0;
    return { recipe, score: score * (1 - weights.coverage + weights.coverage * coverage) };
  });
  return matches.filter(m => m.score >= 1).sort((a, b) => b.score - a.score || a.recipe.id.localeCompare(b.recipe.id)).slice(0, limit);
}
