/** Offscreen registration size must not compress the visible climax into one frame. */
export function blastImpactTimes(visible: boolean[], hit: number, end: number) {
  const counts = [
    visible.filter((value) => !value).length,
    visible.filter(Boolean).length,
  ];
  const cursor = [0, 0];
  return visible.map((value) => {
    const group = Number(value);
    const fraction =
      counts[group] === 1 ? 1 : cursor[group] / Math.max(1, counts[group] - 1);
    cursor[group]++;
    return hit + (end - hit) * fraction;
  });
}
