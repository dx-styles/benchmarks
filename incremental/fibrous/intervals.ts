export type Interval = {startedAt: number; finishedAt: number};

export function intervalMetrics(intervals: Interval[]) {
  let unionMs = 0;
  let end = -Infinity;
  let sumMs = 0;
  const events: [number, number][] = [];
  for (const interval of [...intervals].sort((a, b) => a.startedAt - b.startedAt)) {
    sumMs += interval.finishedAt - interval.startedAt;
    unionMs += Math.max(0, interval.finishedAt - Math.max(end, interval.startedAt));
    end = Math.max(end, interval.finishedAt);
    events.push([interval.startedAt, 1], [interval.finishedAt, -1]);
  }
  let active = 0;
  let peak = 0;
  for (const [, delta] of events.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    active += delta;
    peak = Math.max(peak, active);
  }
  return {count: intervals.length, sumMs, unionMs, peak};
}
