// Alert state-change detection. Returns the trigger ids that are fired NOW but were
// not fired in the previous scan — so email/issue alerts fire on a state change, not
// every run while a condition persists. Pure + testable.
export function newlyFired(current = {}, previous = {}) {
  const out = [];
  for (const [id, v] of Object.entries(current || {})) {
    if (v && v.fired && !(previous && previous[id] && previous[id].fired)) out.push(id);
  }
  return out;
}
