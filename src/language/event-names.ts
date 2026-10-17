import { backdrops, keys, type SceneState } from '../scene/model';
import type { Handler } from './functions';

const keyLabel = (key: string) => keys.find(([, value]) => value === key)?.[0] ?? key;
const ownEvents: Record<string, string> = {
  click: 'clicked', update: 'updates', overlap: 'overlaps a sprite', separate: 'stops overlapping', clone: 'clone starts',
  created: 'is created', collision: 'hits a wall or edge', 'tile:overlap': 'enters a tile', 'tile:hit': 'hits a solid tile',
};

/** Learner-facing words for a handler's event. The saved event name and the
 * generated registration are unchanged; this is presentation only. */
export function describeEvent(handler: Handler | undefined, scene: SceneState): string {
  if (!handler) return 'choose event';
  const event = handler.event, sprite = (id: string) => scene.sprites.find(s => s.id === id)?.name ?? 'unavailable sprite';
  const owner = handler.sprite ? `${sprite(handler.sprite)} & clones` : handler.kind ? `kind ${handler.kind}` : '';
  const [prefix, rest = ''] = event.split(/:(.*)/s);
  let text: string;
  if (owner && ownEvents[event]) return `${owner} ${ownEvents[event]}`;
  if (event === 'start') text = 'game starts';
  else if (prefix === 'key' && rest) text = `${keyLabel(rest)} key pressed`;
  else if (prefix === 'release' && rest) text = `${keyLabel(rest)} key released`;
  else if (prefix === 'click' && rest) text = `${sprite(rest)} clicked`;
  else if (event === 'game:countdown') text = 'countdown ends';
  else if (event === 'game:lives_zero') text = 'lives reach zero';
  else if (event === 'world:enter') text = 'a world starts';
  else if (prefix === 'world' && rest) text = `world becomes ${scene.worlds?.find(w => w.id === rest)?.name ?? 'unavailable world'}`;
  else if (event === 'stage:click') text = 'stage clicked';
  else if (event === 'stage:press') text = 'pointer pressed';
  else if (event === 'stage:release') text = 'pointer released';
  else if (event === 'backdrop:change') text = 'backdrop changes';
  else if (prefix === 'backdrop' && rest) text = `backdrop becomes ${backdrops(scene).find(a => a.id === rest)?.name ?? 'unavailable backdrop'}`;
  else text = `I receive “${event}”`;
  return owner ? `${text} · ${owner}` : text;
}
