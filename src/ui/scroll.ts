/** Bring an element into view by scrolling only the panel it sits in (the
 * nearest container that scrolls by itself), never the page or the editor
 * around it. Element.scrollIntoView also scrolls every ancestor, including
 * containers whose overflow is hidden, such as the app shell, which would
 * slide the whole editor up and leave a gap below it. */
export function scrollWithin(target: Element, block: 'start' | 'nearest' = 'nearest') {
  let box = target.parentElement;
  while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement;
  if (!box) return;
  const t = target.getBoundingClientRect(), b = box.getBoundingClientRect(), margin = 8;
  if (block === 'start') box.scrollTop += t.top - b.top - margin;
  else if (t.top < b.top) box.scrollTop += t.top - b.top - margin;
  else if (t.bottom > b.bottom) box.scrollTop += Math.min(t.bottom - b.bottom + margin, t.top - b.top - margin);
}
