/**
 * Journey route map — a faithful TypeScript port of the prototype's `initWeg()`
 * (assets-source/prototypes/Website Funktional*.dc.html, Journey section;
 * visual reference: the topographic route-map screenshot in assets-source/media).
 *
 * What it does (unchanged from the prototype):
 *  - measures the section and every stage (image + text box)
 *  - places "mountains" (contour-ring hills with shading, peaks, names, heights) that avoid the
 *    content, a jittered street grid around them, a river, contour dots, KM ticks, START/ZIEL,
 *    a compass and a scale bar — the whole map spans the full viewport width behind the content
 *  - routes the path through the street graph (Dijkstra) from the top, via every stage image
 *    (and over a mountain pass between stages 1→2 and 3→4) to the bottom; phones (< 700 px) get a
 *    simple vertical route with rounded corners
 *  - on scroll: draws the route up to the reading line, moves the progress dot with the live
 *    percentage, reveals map elements just ahead of the route and activates stage blocks
 *
 * Adaptations for production (documented in docs/DESIGN-SYSTEM.md §Journey):
 *  - colours/fonts are read from the design tokens on the section (`--color-fg`, `--color-bg`,
 *    `--color-route`, `--font-public-sans`) instead of literals — 'Greek Harmony' warm palette
 *  - SVG text halos use the `paint-order` attribute instead of an inline style attribute
 *  - returns a cleanup function (React effect); no global state
 *
 * The map is decorative (`aria-hidden`); the stage list is the server-rendered content.
 */
import { tokens } from '@vitruv/design-tokens';

/** Fallbacks if the surface variables are missing (tests / unstyled embed): public tokens. */
const FALLBACK_BG = tokens.colors.public.bg.hex;
const FALLBACK_ROUTE = tokens.decorativeColors.route.hex;

type Pt = [number, number];
type Box = [number, number, number, number];

interface Mountain {
  mx: number;
  my: number;
  MR: number;
  hh: number;
  sx: number;
  ph: number;
  rings: number;
  sig: number;
  cy: number;
  q: (th: number, k: number) => number;
  lv: (k: number) => number;
  rf: (k: number, th: number) => Pt;
  rho: (x: number, y: number) => number;
  leg: (th: number) => Pt[];
  ringIds: number[];
  pass?: { ia: number; ib: number; thA: number; poly: Pt[] };
  passSeg?: number;
}

interface Edge {
  to: number;
  c: number;
  poly: Pt[];
}

interface Street {
  a: Pt;
  b: Pt;
  av: boolean;
  h: boolean;
  j: number;
}

const NS = 'http://www.w3.org/2000/svg';

function hexToRgb(value: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(value.trim());
  if (!m?.[1]) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function mountJourneyMap(root: HTMLElement): () => void {
  const svg = root.querySelector<SVGSVGElement>('[data-weg-svg]');
  const ghost = root.querySelector<SVGPathElement>('[data-weg-ghost]');
  const line = root.querySelector<SVGPathElement>('[data-weg-line]');
  const dot = root.querySelector<HTMLElement>('[data-weg-dot]');
  const pct = root.querySelector<HTMLElement>('[data-weg-pct]');
  if (!svg || !ghost || !line || !dot || !pct) return () => undefined;
  const ms = Array.from(root.querySelectorAll<HTMLElement>('[data-weg-m]'));
  if (ms.length === 0) return () => undefined;

  const css = getComputedStyle(root);
  const ink = hexToRgb(css.getPropertyValue('--color-fg')) ?? '43,40,37';
  const bgc = css.getPropertyValue('--color-bg').trim() || FALLBACK_BG;
  const F = css.getPropertyValue('--font-public-sans').trim() || 'system-ui, sans-serif';
  line.setAttribute('stroke', css.getPropertyValue('--color-route').trim() || FALLBACK_ROUTE);

  let P: Pt[] = [];
  let C: number[] = [];
  let total = 1;
  let mL: number[] = [];
  let raf = 0;
  const at = (L: number): Pt => {
    for (let i = 1; i < P.length; i++)
      if ((C[i] ?? 0) >= L) {
        const a = P[i - 1] as Pt;
        const b = P[i] as Pt;
        const t = (L - (C[i - 1] ?? 0)) / ((C[i] ?? 0) - (C[i - 1] ?? 0) || 1);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    return P[P.length - 1] ?? [0, 0];
  };
  let NET: {
    XL: number;
    XR: number;
    mob: boolean;
    mts: Mountain[];
    streets: Street[];
    stubs: [Pt, Pt][];
    foot: (x: number, y: number) => number;
    footM: (x: number, y: number) => [number, Mountain | null];
    inT: (x: number, y: number) => boolean;
    gx: number;
  } | null = null;
  let REV: [number, Element][] = [];
  let revI = 0;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  let map = svg.querySelector<SVGGElement>('[data-weg-map]');
  if (!map) {
    map = document.createElementNS(NS, 'g') as SVGGElement;
    map.setAttribute('data-weg-map', '');
    svg.insertBefore(map, ghost);
  }
  const mapEl = map;

  const drawMap = (H: number) => {
    if (!NET) return;
    let r2 = 99;
    const R = () => {
      r2 = (r2 * 16807) % 2147483647;
      return (r2 - 1) / 2147483646;
    };
    const c = (a: number) => `rgba(${ink},${a})`;
    const { XL, XR, mob, mts, foot, footM, inT, gx } = NET;
    // Warm ink instead of the prototype's cool blue-grey so the relief shading sits on cream.
    const sh = c(0.075);
    const hl = 'rgba(255,255,255,0.85)';
    const f1 = (v: number) => v.toFixed(1);
    const pth = (a: Pt[]) => 'M' + a.map((q) => f1(q[0]) + ' ' + f1(q[1])).join(' L');
    const road = (d3: string, w: number) =>
      `<path d="${d3}" fill="none" stroke="${c(0.17)}" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d3}" fill="none" stroke="${bgc}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const txt = (x: number, y: number, s: string, sz: number, a: number, ex = '') =>
      `<text x="${f1(x)}" y="${f1(y)}" fill="${c(a)}" font-family="${F.replace(/"/g, "'")}" font-size="${sz}" letter-spacing="1"${ex}>${s}</text>`;
    const halo = ` paint-order="stroke" stroke="${bgc}" stroke-width="3"`;
    let h = `<defs><filter id="wblur" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="${mob ? 9 : 15}"/></filter></defs>`;
    const gs = gx * 3;
    for (let x = Math.ceil(XL / gs) * gs, n = 0; x < XR; x += gs, n++) {
      h += `<line x1="${f1(x)}" y1="0" x2="${f1(x)}" y2="${H}" stroke="${c(0.06)}" stroke-dasharray="1 6"/>`;
      h += txt(x + 4, 18, String(32 + n), 7, 0.16);
    }
    for (let y = gs, n = 0; y < H; y += gs, n++) {
      h += `<line x1="${f1(XL)}" y1="${y}" x2="${f1(XR)}" y2="${y}" stroke="${c(0.06)}" stroke-dasharray="1 6"/>`;
      h += txt(XL + 6, y - 4, String(51 + n), 7, 0.16);
    }
    const ncl = Math.round(H / (mob ? 300 : 210));
    for (let j = 0; j < ncl; j++) {
      const fx = XL + R() * (XR - XL),
        fy = R() * H,
        fr = 40 + R() * 60;
      for (let k = 0; k < 60; k++) {
        const a = R() * 6.283,
          dd = Math.sqrt(R()) * fr,
          x = fx + Math.cos(a) * dd * 1.4,
          y = fy + Math.sin(a) * dd;
        if (foot(x, y) < 1.2 || inT(x, y)) continue;
        h += `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(0.7 + R() * 0.9)}" fill="${c(0.12)}"/>`;
      }
    }
    if (!mob) {
      let rx = XL + (XR - XL) * 0.045;
      const rp: Pt[] = [];
      for (let y = -10; y <= H + 10; y += 18) {
        rx += Math.sin(y / 160) * 8 + (R() - 0.5) * 6;
        let px = rx,
          py = y;
        for (let it = 0; it < 3; it++) {
          const fm = footM(px, py);
          if (fm[1] && fm[0] < 1.3) {
            const s = 1.3 / fm[0];
            px = fm[1].mx + (px - fm[1].mx) * s;
            py = fm[1].cy + (py - fm[1].cy) * s;
          }
        }
        if (!inT(px, py)) rp.push([px, py]);
      }
      if (rp.length > 3) {
        const rd = pth(rp);
        h += `<path d="${rd}" fill="none" stroke="${c(0.15)}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/><path d="${rd}" fill="none" stroke="${bgc}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="${rd}" fill="none" stroke="${c(0.12)}" stroke-width="1" stroke-dasharray="8 5"/>`;
        const rl = rp[Math.floor(rp.length * 0.22)] as Pt;
        h += txt(rl[0] + 10, rl[1], 'RUHEBACH', 7, 0.22, ' font-style="italic"' + halo);
      }
    }
    const names = [
      'GRATHORN',
      'KRAFTSPITZE',
      'HOCHFIRST',
      'STEINKOGEL',
      'FOKUSGIPFEL',
      'WEISSKAR',
      'TEMPOHORN',
      'ADLERKOPF',
      'SONNKAR',
      'EISENSPITZE',
      'FELSKAMM',
      'WINDSCHARTE',
    ];
    mts
      .slice()
      .sort((a, b) => a.my - b.my)
      .forEach((m, j) => {
        const { mx, MR, hh, sx, rings } = m;
        const pk = m.lv(0);
        const ringPath = (k: number) => {
          const a: Pt[] = [];
          for (let s = 0; s <= 56; s++) a.push(m.rf(k, (s / 56) * Math.PI * 2));
          return pth(a) + 'Z';
        };
        h += `<ellipse cx="${f1(mx + MR * 0.22)}" cy="${f1(m.cy + MR * 0.12)}" rx="${f1(MR * sx)}" ry="${f1(MR * 0.64)}" fill="${sh}" filter="url(#wblur)"/>`;
        h += `<ellipse cx="${f1(mx - MR * 0.2)}" cy="${f1((m.cy + pk) / 2 - MR * 0.12)}" rx="${f1(MR * 0.5)}" ry="${f1(MR * 0.32)}" fill="${hl}" filter="url(#wblur)"/>`;
        for (let k = rings; k >= 1; k--) {
          const idx = k % 3 === 0;
          h += `<path d="${ringPath(k)}" fill="${k === rings ? 'none' : bgc}"${k === rings ? '' : ' fill-opacity="0.5"'} stroke="${c(idx ? 0.17 : 0.075)}" stroke-width="${idx ? 1.2 : 0.7}"/>`;
          if (idx && k < rings) {
            const lp = m.rf(k, 0.5);
            h += txt(
              lp[0],
              lp[1] + 2,
              String(Math.round((900 + hh * 900 * (1 - k / rings)) / 10) * 10),
              6.5,
              0.22,
              halo,
            );
          }
        }
        for (let k2 = 0; k2 < 5; k2++) {
          const a3 = m.ph + k2 * 1.26 + R() * 0.4,
            rp: Pt[] = [];
          for (let k = 1; k <= rings; k++) rp.push(m.rf(k, a3 + Math.sin(k * 0.9 + k2) * 0.06));
          h += `<path d="M${f1(mx)} ${f1(pk)} L${rp.map((q) => f1(q[0]) + ' ' + f1(q[1])).join(' L')}" fill="none" stroke="${c(0.1)}" stroke-width="0.8"/>`;
        }
        if (!mob)
          for (let k2 = 0; k2 < 34; k2++) {
            const a3 = 0.1 + (k2 / 34) * 2.6,
              k = 2 + Math.floor(R() * (rings - 3)),
              p1 = m.rf(k, a3),
              p2 = m.rf(k + 1, a3);
            h += `<line x1="${f1(p1[0])}" y1="${f1(p1[1])}" x2="${f1(p2[0])}" y2="${f1(p2[1])}" stroke="${c(0.11)}" stroke-width="0.7"/>`;
          }
        h += road(ringPath(rings - 1), 2.2);
        if (m.pass) h += road(pth(m.pass.poly), 2.6);
        else h += road(pth(m.leg(Math.PI / 2 + (j % 2 ? 0.35 : -0.35)).concat([[mx, pk]])), 1.8);
        const th1 = (m.pass ? m.pass.thA : Math.PI / 2) + Math.PI + 0.4,
          sp2: Pt[] = [];
        for (let k = rings - 1; k >= Math.ceil(rings * 0.35); k--)
          sp2.push(m.rf(k, th1 + Math.sin(k * 1.3) * 0.2));
        h += `<path d="${pth(sp2)}" fill="none" stroke="${c(0.22)}" stroke-width="1" stroke-dasharray="2 3" stroke-linecap="round"/>`;
        h += `<path d="M${f1(mx)} ${f1(pk - 6)} L${f1(mx + 5)} ${f1(pk + 3)} L${f1(mx - 5)} ${f1(pk + 3)} Z" fill="${bgc}" stroke="${c(0.36)}" stroke-width="1"/>`;
        h += txt(
          mx + 9,
          pk - 9,
          names[j % names.length] as string,
          8,
          0.32,
          ' letter-spacing="2"' + halo,
        );
        h += txt(
          mx + 9,
          pk + 2,
          `${1600 + Math.round(hh * 820) + j * 13} m${m.pass ? ' · PASS' : ''}`,
          7,
          0.22,
          halo,
        );
      });
    const rowsC: Record<string, string> = {},
      rowsA: Record<string, string> = {};
    const addTo = (o: Record<string, string>, k: string | number, s: string) => {
      o[k] = (o[k] ?? '') + s;
    };
    NET.streets.forEach((s) =>
      addTo(s.av ? rowsA : rowsC, s.j, `M${f1(s.a[0])} ${f1(s.a[1])}L${f1(s.b[0])} ${f1(s.b[1])}`),
    );
    NET.stubs.forEach((s) =>
      addTo(
        rowsC,
        's' + Math.round(s[0][1] / 160),
        `M${f1(s[0][0])} ${f1(s[0][1])}L${f1(s[1][0])} ${f1(s[1][1])}`,
      ),
    );
    const rp2 = (o: Record<string, string>, col: string, w: number, ex = '') =>
      Object.keys(o).forEach((k) => {
        h += `<path d="${o[k]}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${ex}/>`;
      });
    rp2(rowsC, c(0.13), 5);
    rp2(rowsA, c(0.17), 9);
    rp2(rowsC, bgc, 3);
    rp2(rowsA, bgc, 6.5);
    rp2(rowsA, c(0.1), 0.8, ' stroke-dasharray="6 6"');
    const sn = [
      'KRAFTWEG',
      'BALANCE-ALLEE',
      'MOBILITÄTSRING',
      'ENERGIESTRASSE',
      'AUSDAUERPFAD',
      'FOKUSGASSE',
      'TEMPOSTRASSE',
      'REGENERATIONSWEG',
    ];
    const rows: Record<string, Street[]> = {};
    NET.streets.forEach((s) => {
      if (s.h && !s.av && s.j % 4 === 0 && s.a[0] > XL + 40 && s.b[0] < XR - 40)
        (rows[s.j] = rows[s.j] ?? []).push(s);
    });
    Object.keys(rows).forEach((jk, n) => {
      if (n >= sn.length) return;
      const arr = rows[jk] as Street[],
        s = arr[(n * 5 + 2) % arr.length] as Street;
      const ang = (Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]) * 180) / Math.PI,
        tx = (s.a[0] + s.b[0]) / 2,
        ty = (s.a[1] + s.b[1]) / 2 - 5;
      h += `<text x="${f1(tx)}" y="${f1(ty)}" transform="rotate(${f1(ang)} ${f1(tx)} ${f1(ty)})" text-anchor="middle" fill="${c(0.26)}" font-family="${F.replace(/"/g, "'")}" font-size="6.5" letter-spacing="1.5">${sn[n]}</text>`;
    });
    const nk = Math.max(4, Math.round(total / (mob ? 440 : 560)));
    for (let k = 1; k < nk; k++) {
      const L = (total * k) / nk,
        p1 = at(L - 6),
        p2 = at(L + 6);
      const dxn = p2[0] - p1[0],
        dyn = p2[1] - p1[1],
        ln = Math.hypot(dxn, dyn) || 1,
        nxv = -dyn / ln,
        nyv = dxn / ln,
        px3 = (p1[0] + p2[0]) / 2,
        py3 = (p1[1] + p2[1]) / 2;
      h += `<line x1="${f1(px3 - nxv * 8)}" y1="${f1(py3 - nyv * 8)}" x2="${f1(px3 + nxv * 8)}" y2="${f1(py3 + nyv * 8)}" stroke="${c(0.3)}" stroke-width="1"/>`;
      h += txt(
        px3 + nxv * 17,
        py3 + nyv * 17 + 3,
        'KM ' + (k * 0.8).toFixed(1),
        7,
        0.26,
        ' text-anchor="middle"' + halo,
      );
    }
    const st = at(26),
      en = at(total - 22);
    h +=
      `<circle cx="${f1(st[0])}" cy="${f1(st[1])}" r="4" fill="none" stroke="${c(0.35)}"/>` +
      txt(st[0] + 10, st[1] + 4, 'START', 8, 0.32, ' letter-spacing="2"' + halo);
    h +=
      `<circle cx="${f1(en[0])}" cy="${f1(en[1])}" r="4" fill="none" stroke="${c(0.35)}"/>` +
      txt(en[0] + 10, en[1] + 4, 'ZIEL', 8, 0.32, ' letter-spacing="2"' + halo);
    const kx = XR - (mob ? 46 : 96),
      ky = mob ? 70 : 110,
      kr = mob ? 18 : 27;
    h += `<circle cx="${kx}" cy="${ky}" r="${kr}" fill="none" stroke="${c(0.16)}"/><circle cx="${kx}" cy="${ky}" r="${kr + 6}" fill="none" stroke="${c(0.08)}" stroke-dasharray="1 3"/>`;
    h += `<path d="M${kx} ${ky - kr - 10} L${kx + 6} ${ky} L${kx} ${ky + kr + 10} L${kx - 6} ${ky} Z" fill="none" stroke="${c(0.24)}"/><path d="M${kx} ${ky - kr - 10} L${kx + 6} ${ky} L${kx} ${ky} Z" fill="${c(0.2)}"/>`;
    h += txt(kx - 3, ky - kr - 16, 'N', 9, 0.3);
    const sy = H - 42,
      sx0 = XL + (mob ? 22 : 56);
    for (let k = 0; k < 4; k++)
      h += `<rect x="${sx0 + k * 30}" y="${sy}" width="30" height="4" fill="${k % 2 ? 'none' : c(0.2)}" stroke="${c(0.2)}" stroke-width="0.8"/>`;
    h += txt(sx0, sy - 6, '0', 8, 0.22) + txt(sx0 + 104, sy - 6, '2 KM', 8, 0.22);
    if (!mob)
      h += txt(sx0 + 140, sy + 5, 'VITRUV · ROUTE 01 · 1:25 000', 8, 0.18, ' letter-spacing="2"');
    mapEl.innerHTML = h;
    const list: [number, Element][] = [];
    mapEl.querySelectorAll('path,line,ellipse,circle,text,rect').forEach((el) => {
      if (el.closest('defs')) return;
      const tg = el.tagName,
        stroke = el.getAttribute('stroke');
      if (
        (tg === 'path' || tg === 'line') &&
        stroke &&
        stroke !== 'none' &&
        !el.getAttribute('stroke-dasharray')
      ) {
        el.setAttribute('pathLength', '1');
        el.setAttribute('data-dr', '');
        const fl = el.getAttribute('fill');
        if (fl && fl !== 'none') el.setAttribute('data-ring', '');
      } else el.setAttribute('data-fd', '');
      let y = 0;
      try {
        y = (el as SVGGraphicsElement).getBBox().y;
      } catch {
        /* not rendered (e.g. jsdom) */
      }
      list.push([y, el]);
    });
    list.sort((a, b) => a[0] - b[0]);
    REV = list;
    revI = 0;
    ghost.setAttribute('stroke-dasharray', '3 7');
    ghost.setAttribute('stroke-linecap', 'round');
  };

  const build = () => {
    seed = 7;
    const r = root.getBoundingClientRect(),
      W = r.width,
      H = r.height;
    if (!W || !H) return;
    const VW = document.documentElement.clientWidth || W,
      XL = -r.left,
      XR = VW - r.left;
    svg.style.left = XL + 'px';
    svg.style.right = 'auto';
    svg.style.width = VW + 'px';
    svg.setAttribute('viewBox', `${XL} 0 ${VW} ${H}`);
    const mob = W < 700,
      gx = mob ? 58 : 92,
      gy = mob ? 66 : 100;
    const rect = (el: Element): Box => {
      const b = el.getBoundingClientRect();
      return [b.left - r.left, b.top - r.top, b.right - r.left, b.bottom - r.top];
    };
    const imr = ms.map((m) => rect(m.querySelector('[data-weg-img]') ?? m)),
      txr = ms.map((m) => rect(m.querySelector('[data-weg-txt]') ?? m)),
      mrr = ms.map((m) => rect(m));
    const tgt: Pt[] = imr.map((b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]);
    const inT = (x: number, y: number) =>
      txr.some((t) => x > t[0] - 16 && x < t[2] + 16 && y > t[1] - 16 && y < t[3] + 16);
    const lift = (e: number) => Math.min(1.4, e) * 34;
    const mts: Mountain[] = [];
    const mkM = (mx: number, my: number, MR: number, hh: number, sx: number): Mountain => {
      const m = {
        mx,
        my,
        MR,
        hh,
        sx,
        ph: rnd() * 6,
        rings: Math.max(7, Math.min(20, Math.round(MR / 24))),
        sig: MR / 1.7,
        ringIds: [] as number[],
      } as Mountain;
      m.q = (th, k) => {
        const p2 = m.ph + k * 0.13;
        return 1 + 0.16 * Math.sin(th * 3 + p2) + 0.07 * Math.sin(th * 5 - p2 * 1.3);
      };
      m.lv = (k) => {
        const rr = (MR * k) / m.rings;
        return my - lift(hh * Math.exp((-rr * rr) / (2 * m.sig * m.sig))) * Math.max(1, MR / 150);
      };
      m.rf = (k, th) => {
        const rr = (MR * k) / m.rings,
          q = m.q(th, k);
        return [mx + Math.cos(th) * rr * q * sx, m.lv(k) + Math.sin(th) * rr * q * 0.8];
      };
      m.cy = m.lv(m.rings);
      m.rho = (x, y) => {
        const u = (x - mx) / sx,
          v = (y - m.cy) / 0.8;
        return Math.hypot(u, v) / (MR * m.q(Math.atan2(v, u), m.rings));
      };
      m.leg = (th) => {
        const pts: Pt[] = [];
        let dir = 1;
        const c0 = th + 0.1 + (0.3 * (m.rings - 1)) / m.rings;
        for (let k = m.rings - 1; k >= 2; k--) {
          const w = 0.1 + (0.3 * k) / m.rings;
          for (let s = 0; s <= 8; s++) pts.push(m.rf(k, c0 + dir * w * (s / 4 - 1)));
          dir = -dir;
        }
        return pts;
      };
      return m;
    };
    const footM = (x: number, y: number): [number, Mountain | null] => {
      let best = 9,
        bm: Mountain | null = null;
      for (const m of mts) {
        const v = m.rho(x, y);
        if (v < best) {
          best = v;
          bm = m;
        }
      }
      return [best, bm];
    };
    const foot = (x: number, y: number) => footM(x, y)[0];
    const anchors: number[] = [];
    let Pm: Pt[] | null = null;
    if (mob) {
      const first = tgt[0] as Pt;
      const raw: { p: Pt; a?: number }[] = [{ p: [first[0], 0] }];
      tgt.forEach((t, i) => {
        const prev = mrr[i - 1];
        const cur = mrr[i] as Box;
        const gy2 = i && prev ? (prev[3] + cur[1]) / 2 : Math.max(16, cur[1] - 30),
          px = (raw[raw.length - 1] as { p: Pt }).p[0];
        if (Math.abs(px - t[0]) > 2) {
          raw.push({ p: [px, gy2] });
          raw.push({ p: [t[0], gy2] });
        }
        raw.push({ p: t, a: 1 });
      });
      raw.push({ p: [(tgt[tgt.length - 1] as Pt)[0], H] });
      const pm: Pt[] = [];
      raw.forEach((q, k) => {
        const pv = raw[k - 1],
          nq = raw[k + 1];
        if (!pv || !nq || q.a) {
          pm.push(q.p);
          if (q.a) anchors.push(pm.length - 1);
          return;
        }
        const d1: Pt = [q.p[0] - pv.p[0], q.p[1] - pv.p[1]],
          d2: Pt = [nq.p[0] - q.p[0], nq.p[1] - q.p[1]];
        const l1 = Math.hypot(d1[0], d1[1]) || 1,
          l2 = Math.hypot(d2[0], d2[1]) || 1,
          rr = Math.min(24, l1 / 2, l2 / 2);
        const s: Pt = [q.p[0] - (d1[0] / l1) * rr, q.p[1] - (d1[1] / l1) * rr],
          e: Pt = [q.p[0] + (d2[0] / l2) * rr, q.p[1] + (d2[1] / l2) * rr];
        for (let t = 0; t <= 8; t++) {
          const u = t / 8;
          pm.push([
            (1 - u) * (1 - u) * s[0] + 2 * u * (1 - u) * q.p[0] + u * u * e[0],
            (1 - u) * (1 - u) * s[1] + 2 * u * (1 - u) * q.p[1] + u * u * e[1],
          ]);
        }
      });
      Pm = pm;
    }
    const dense: Pt[] = [];
    if (Pm)
      for (let i = 1; i < Pm.length; i++) {
        const a = Pm[i - 1] as Pt,
          b = Pm[i] as Pt,
          n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 14));
        for (let k = 0; k <= n; k++)
          dense.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
      }
    const fits = (x: number, y: number, MR: number, sx: number) => {
      const ex = MR * 1.3 * sx,
        ey = MR * 1.04 + 48 * Math.max(1, MR / 150);
      if (x < XL - ex * 0.45 || x > XR + ex * 0.45 || y < ey * 0.3 || y > H - ey * 0.3)
        return false;
      const inE = (px: number, py: number, k: number) =>
        Math.hypot((px - x) / (ex * k), (py - y) / (ey * k)) < 1;
      for (const t of tgt) if (inE(t[0], t[1], 1.12)) return false;
      for (const b of imr)
        if (
          [
            [b[0], b[1]],
            [b[2], b[1]],
            [b[0], b[3]],
            [b[2], b[3]],
          ].filter((q) => inE(q[0] as number, q[1] as number, 1)).length > 1
        )
          return false;
      for (const m of mts) {
        const ex2 = m.MR * 1.3 * m.sx,
          ey2 = m.MR * 1.04 + 48 * Math.max(1, m.MR / 150);
        if (Math.hypot((m.mx - x) / (ex + ex2 + 30), (m.my - y) / (ey + ey2 + 30)) < 1)
          return false;
      }
      for (const p of dense) if (inE(p[0], p[1], 1.06)) return false;
      return true;
    };
    const angTo = (m: Mountain, p: Pt) => {
      let th = Math.atan2((p[1] - m.cy) / 0.8, (p[0] - m.mx) / m.sx);
      if (th < 0) th += Math.PI * 2;
      return Math.round((th / (Math.PI * 2)) * 48) % 48;
    };
    const inImg = (x: number, y: number) =>
      imr.some((b) => x > b[0] - 12 && x < b[2] + 12 && y > b[1] - 12 && y < b[3] + 12);
    const mkPass = (m: Mountain, i: number) => {
      let ia = angTo(m, tgt[i] as Pt),
        ib = angTo(m, tgt[i + 1] as Pt);
      let df = (((ib - ia) % 48) + 48) % 48;
      if (df > 24) df -= 48;
      if (Math.abs(df) < 14) {
        const sg = df >= 0 ? 1 : -1,
          nd = Math.ceil((14 - Math.abs(df)) / 2);
        ia = (((ia - sg * nd) % 48) + 48) % 48;
        ib = (((ib + sg * nd) % 48) + 48) % 48;
      }
      const thA = (ia / 48) * Math.PI * 2,
        thB = (ib / 48) * Math.PI * 2,
        poly = m.leg(thA).concat([[m.mx, m.lv(0)]], m.leg(thB).reverse());
      if (
        poly.some(
          (q) =>
            inT(q[0], q[1]) ||
            inImg(q[0], q[1]) ||
            q[0] < XL + 12 ||
            q[0] > XR - 12 ||
            q[1] < 10 ||
            q[1] > H - 10,
        )
      )
        return null;
      return { ia, ib, thA, poly };
    };
    if (!mob)
      [0, 2].forEach((i) => {
        if (i + 1 >= tgt.length) return;
        const a = tgt[i] as Pt,
          b = tgt[i + 1] as Pt;
        const y0 = Math.min(a[1], b[1]),
          y1 = Math.max(a[1], b[1]);
        for (let k = 0; k < 1500; k++) {
          const MR = 480 - k * 0.25,
            sx = 1.05 + rnd() * 0.2,
            x = XL + rnd() * (XR - XL),
            y = y0 + rnd() * (y1 - y0);
          if (!fits(x, y, MR, sx)) continue;
          const m = mkM(x, y, MR, 0.9 + rnd() * 0.3, sx),
            ps = mkPass(m, i);
          if (!ps) continue;
          m.passSeg = i;
          m.pass = ps;
          mts.push(m);
          break;
        }
      });
    const want = Math.round(H / (mob ? 650 : 560));
    for (let a = 0; a < 3000 && mts.length < want; a++) {
      const MR = (mob ? 230 : 600) - (a / 3000) * (mob ? 110 : 320),
        sx = 1.05 + rnd() * 0.25,
        x = XL + (rnd() * 1.4 - 0.2) * (XR - XL),
        y = rnd() * H;
      if (fits(x, y, MR, sx)) mts.push(mkM(x, y, MR, 0.6 + rnd() * 0.55, sx));
    }
    const G: { pts: Pt[]; adj: Edge[][] } = { pts: [], adj: [] };
    const addN = (p: Pt) => {
      G.pts.push(p);
      G.adj.push([]);
      return G.pts.length - 1;
    };
    const addE = (u: number, v: number, poly: Pt[], cst: number) => {
      (G.adj[u] as Edge[]).push({ to: v, c: cst, poly });
      (G.adj[v] as Edge[]).push({ to: u, c: cst, poly: poly.slice().reverse() });
    };
    const segOk = (a: Pt, b: Pt, skipM?: Mountain): [boolean, Mountain | null] => {
      const n = Math.max(4, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 9));
      for (let k = 1; k < n; k++) {
        const x = a[0] + ((b[0] - a[0]) * k) / n,
          y = a[1] + ((b[1] - a[1]) * k) / n;
        if (inT(x, y)) return [false, null];
        for (const m of mts) if (m !== skipM && m.rho(x, y) < 1.08) return [false, m];
      }
      return [true, null];
    };
    const nx = Math.floor((XR - XL) / gx) + 1,
      ny = Math.ceil(H / gy) + 1,
      x0 = XL + (XR - XL - (nx - 1) * gx) / 2;
    const gid: number[][] = [],
      gp: Pt[][] = [];
    for (let i = 0; i < nx; i++) {
      gid.push([]);
      gp.push([]);
      for (let j = 0; j < ny; j++) {
        const x = x0 + i * gx + (i && i < nx - 1 ? (rnd() - 0.5) * gx * 0.3 : 0),
          y = Math.min(H, j * gy + (j ? (rnd() - 0.5) * gy * 0.26 : 0));
        (gp[i] as Pt[]).push([x, y]);
        (gid[i] as number[]).push(foot(x, y) > 1.1 && !inT(x, y) ? addN([x, y]) : -1);
      }
    }
    const streets: Street[] = [],
      stubs: [Pt, Pt][] = [],
      near = new Map<string, [number, Mountain]>();
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        (
          [
            [1, 0],
            [0, 1],
          ] as const
        ).forEach((dv) => {
          const a2 = i + dv[0],
            b2 = j + dv[1];
          if (a2 >= nx || b2 >= ny) return;
          const u = (gid[i] as number[])[j] as number,
            v = (gid[a2] as number[])[b2] as number,
            A = (gp[i] as Pt[])[j] as Pt,
            Bp = (gp[a2] as Pt[])[b2] as Pt,
            ok = segOk(A, Bp);
          if (!ok[0]) {
            const hit = ok[1];
            if (hit)
              [u, v].forEach((q) => {
                if (q >= 0) near.set(q + '|' + mts.indexOf(hit), [q, hit]);
              });
            return;
          }
          if (u < 0 || v < 0) return;
          const hz = dv[0] === 1,
            av = hz ? j % 4 === 2 : i % 3 === 1;
          // Deterministic gaps in the minor street grid (prototype: hash % 100 < 16).
          if (
            !av &&
            (((i * 73856093) ^ (j * 19349663) ^ (hz ? 83492791 : 29712151)) >>> 0) % 100 < 16
          )
            return;
          streets.push({ a: A, b: Bp, av, h: hz, j });
          addE(
            u,
            v,
            [A, Bp],
            Math.hypot(Bp[0] - A[0], Bp[1] - A[1]) * (av ? 0.85 : 1) * (1 + rnd() * 0.9),
          );
        });
    mts.forEach((m) => {
      m.ringIds = [];
      for (let s = 0; s < 48; s++) m.ringIds.push(addN(m.rf(m.rings - 1, (s / 48) * Math.PI * 2)));
      for (let s = 0; s < 48; s++) {
        const u = m.ringIds[s] as number,
          v = m.ringIds[(s + 1) % 48] as number;
        const pu = G.pts[u] as Pt,
          pv = G.pts[v] as Pt;
        if (inT(pu[0], pu[1]) || inT(pv[0], pv[1])) continue;
        addE(u, v, [pu, pv], Math.hypot(pv[0] - pu[0], pv[1] - pu[1]) * 1.25);
      }
    });
    near.forEach((q) => {
      const u = q[0],
        m = q[1],
        p = G.pts[u] as Pt;
      let bs = 0,
        bd = 1e9;
      m.ringIds.forEach((id, s) => {
        const pt = G.pts[id] as Pt;
        const dd = Math.hypot(pt[0] - p[0], pt[1] - p[1]);
        if (dd < bd) {
          bd = dd;
          bs = s;
        }
      });
      if (bd > gx * 1.7) return;
      const tp = G.pts[m.ringIds[bs] as number] as Pt;
      if (!segOk(p, tp, m)[0]) return;
      stubs.push([p, tp]);
      addE(u, m.ringIds[bs] as number, [p, tp], bd * 1.1);
    });
    const nearest = (x: number, y: number) => {
      let bi = -1,
        bd = 1e18;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) {
          const id = (gid[i] as number[])[j] as number;
          if (id < 0 || !(G.adj[id] as Edge[]).length) continue;
          const p = G.pts[id] as Pt,
            dd = (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y);
          if (dd < bd) {
            bd = dd;
            bi = id;
          }
        }
      return bi;
    };
    const dij = (s: number, t: number): Edge[] | null => {
      if (s === t) return [];
      const n = G.pts.length,
        dist = new Float64Array(n).fill(Infinity),
        via: ([number, Edge] | undefined)[] = new Array(n),
        done = new Uint8Array(n),
        hp: [number, number][] = [];
      dist[s] = 0;
      const push = (d0: number, u: number) => {
        hp.push([d0, u]);
        let i = hp.length - 1;
        while (i) {
          const p = (i - 1) >> 1;
          if ((hp[p] as [number, number])[0] <= (hp[i] as [number, number])[0]) break;
          const tt = hp[p] as [number, number];
          hp[p] = hp[i] as [number, number];
          hp[i] = tt;
          i = p;
        }
      };
      const pop = () => {
        const top = hp[0] as [number, number],
          last = hp.pop() as [number, number];
        if (hp.length) {
          hp[0] = last;
          let i = 0;
          for (;;) {
            const l = 2 * i + 1,
              rr = l + 1;
            let mm = i;
            if (l < hp.length && (hp[l] as [number, number])[0] < (hp[mm] as [number, number])[0])
              mm = l;
            if (rr < hp.length && (hp[rr] as [number, number])[0] < (hp[mm] as [number, number])[0])
              mm = rr;
            if (mm === i) break;
            const tt = hp[mm] as [number, number];
            hp[mm] = hp[i] as [number, number];
            hp[i] = tt;
            i = mm;
          }
        }
        return top;
      };
      push(0, s);
      while (hp.length) {
        const u = pop()[1];
        if (done[u]) continue;
        done[u] = 1;
        if (u === t) break;
        for (const e of G.adj[u] as Edge[]) {
          const nd = (dist[u] as number) + e.c;
          if (nd < (dist[e.to] as number)) {
            dist[e.to] = nd;
            via[e.to] = [u, e];
            push(nd, e.to);
          }
        }
      }
      if (!via[t]) return null;
      const out: Edge[] = [];
      let x = t;
      while (x !== s) {
        const v = via[x] as [number, Edge];
        out.unshift(v[1]);
        x = v[0];
      }
      return out;
    };
    if (mob && Pm) P = Pm;
    else {
      let cur = nearest(W * 0.5, 0);
      if (cur < 0) return;
      P = [[(G.pts[cur] as Pt)[0], 0], G.pts[cur] as Pt];
      const walk = (t: number) => {
        const ed = dij(cur, t);
        if (!ed) P.push(G.pts[t] as Pt);
        else
          ed.forEach((e) => {
            for (let k = 1; k < e.poly.length; k++) P.push(e.poly[k] as Pt);
          });
        cur = t;
      };
      tgt.forEach((tp, i) => {
        walk(nearest(tp[0], tp[1]));
        anchors.push(P.length - 1);
        const m = mts.find((q) => q.passSeg === i && q.pass);
        if (m?.pass) {
          walk(m.ringIds[m.pass.ia] as number);
          for (let k = 1; k < m.pass.poly.length; k++) P.push(m.pass.poly[k] as Pt);
          cur = m.ringIds[m.pass.ib] as number;
        }
      });
      const e = nearest(W * 0.5, H);
      walk(e);
      P.push([(G.pts[e] as Pt)[0], H]);
    }
    NET = { XL, XR, mob, mts, streets, stubs, foot, footM, inT, gx };
    C = [0];
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1] as Pt,
        b = P[i] as Pt;
      C.push((C[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    total = C[C.length - 1] || 1;
    mL = anchors.map((a) => C[a] as number);
    const d = 'M' + P.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
    ghost.setAttribute('d', d);
    line.setAttribute('d', d);
    drawMap(H);
    line.style.strokeDasharray = String(total);
    update();
  };

  const update = () => {
    raf = 0;
    const r = root.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (window.innerHeight * 0.62 - r.top) / (r.height || 1)));
    const L = p * total;
    line.style.strokeDashoffset = String(total - L);
    const pt = at(L);
    const ry = Math.max(pt[1], window.innerHeight * 0.62 - r.top) + 220;
    while (revI < REV.length && (REV[revI] as [number, Element])[0] < ry) {
      (REV[revI] as [number, Element])[1].setAttribute('data-on', '');
      revI++;
    }
    while (revI > 0 && (REV[revI - 1] as [number, Element])[0] >= ry) {
      revI--;
      (REV[revI] as [number, Element])[1].removeAttribute('data-on');
    }
    dot.style.transform = `translate(${pt[0]}px,${pt[1]}px)`;
    pct.textContent = Math.round(p * 100) + '%';
    ms.forEach((m, i) => {
      const on = L >= (mL[i] ?? 0) - 60;
      if (m.dataset.on === String(on)) return;
      m.dataset.on = String(on);
    });
  };

  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', build);
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(build);
  ro?.observe(root);
  root.setAttribute('data-weg-ready', '');
  build();
  const late = window.setTimeout(build, 800);
  return () => {
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', build);
    ro?.disconnect();
    window.clearTimeout(late);
    if (raf) cancelAnimationFrame(raf);
    root.removeAttribute('data-weg-ready');
  };
}
