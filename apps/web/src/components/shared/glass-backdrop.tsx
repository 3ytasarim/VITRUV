/**
 * Backdrop of the glass panels (admin + client area): a dark, faceted low-poly surface with a
 * few bright edges — drawn as SVG, no image file (owner decision 2026-10-19; replaces the
 * template's stock texture of unknown licence). Deterministic geometry (seeded), so server and
 * client render the same markup. Decorative only.
 */
const W = 1600;
const H = 1000;
const COLS = 9;
const ROWS = 6;

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function buildFacets() {
  const rand = rng(20261019);
  const points: [number, number][][] = [];
  for (let r = 0; r <= ROWS; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c <= COLS; c++) {
      const edge = r === 0 || r === ROWS || c === 0 || c === COLS;
      const jx = edge ? 0 : (rand() - 0.5) * (W / COLS) * 0.8;
      const jy = edge ? 0 : (rand() - 0.5) * (H / ROWS) * 0.8;
      row.push([(c * W) / COLS + jx, (r * H) / ROWS + jy]);
    }
    points.push(row);
  }
  const facets: { d: string; o: number }[] = [];
  const edges: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const a = points[r]![c]!;
      const b = points[r]![c + 1]!;
      const d = points[r + 1]![c + 1]!;
      const e = points[r + 1]![c]!;
      const flip = rand() > 0.5;
      const tris = flip
        ? [
            [a, b, d],
            [a, d, e],
          ]
        : [
            [a, b, e],
            [b, d, e],
          ];
      for (const tri of tris) {
        // light comes from the top-left: facets there are slightly brighter
        const cx = (tri[0]![0] + tri[1]![0] + tri[2]![0]) / 3;
        const cy = (tri[0]![1] + tri[1]![1] + tri[2]![1]) / 3;
        const light = 1 - (cx / W) * 0.55 - (cy / H) * 0.45;
        facets.push({
          d: `M${tri.map((p) => `${p[0].toFixed(0)} ${p[1].toFixed(0)}`).join(' L')}Z`,
          o: Math.max(0.004, 0.008 + light * 0.05 + (rand() - 0.5) * 0.045),
        });
      }
      if (rand() > 0.9) {
        const [p, q] = flip ? [a, d] : [b, e];
        edges.push(`M${p[0].toFixed(0)} ${p[1].toFixed(0)} L${q[0].toFixed(0)} ${q[1].toFixed(0)}`);
      }
    }
  }
  return { facets, edges };
}

const { facets, edges } = buildFacets();

export function GlassBackdrop() {
  return (
    <div aria-hidden className="vt-glass-backdrop">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
        <g className="vt-glass-backdrop__facets">
          {facets.map((f, i) => (
            <path key={i} d={f.d} style={{ fillOpacity: f.o }} />
          ))}
        </g>
        <g className="vt-glass-backdrop__edges">
          {edges.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </div>
  );
}
