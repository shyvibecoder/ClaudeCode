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

// Two-consecutive-scans confirmation: a trigger is only "fired" when its raw
// condition (`met`) holds NOW and held in the previous scan — avoids single-scan
// false fires. The first time the condition is met it is "pending" (met && !fired).
export function confirmFired(metNow, metPrev) {
  return !!metNow && !!metPrev;
}
