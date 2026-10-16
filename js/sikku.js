/*
 * FourierEpiKolam — dot-grid (sikku / pulli) kolam generator.
 *
 * Model: the kolam line runs diagonally between the dots and passes through the
 * midpoint of every gap between neighbouring dots. At each gap it either
 *   0 = crosses the other strand,
 *   1 = bounces back (a mirror lying along the gap), or
 *   2 = slips through to the next dot (a mirror across the gap).
 * The outer border always bounces.
 *
 * Key fact: with no crossings, the drawing is ONE closed line exactly when the
 * "slip through" gaps form a spanning tree of the dots. We grow a random tree
 * that respects the chosen symmetry, then add crossings only where the line
 * stays unbroken.
 *
 * Coordinates are doubled integers: dot (i, j) sits at (2i, 2j); gap midpoints
 * have exactly one odd coordinate.
 */
(function (FEK) {
  "use strict";

  const SHAPES = {
    square:  { label: "Square",    min: 2, max: 15, def: 7 },
    diamond: { label: "Diamond",   min: 1, max: 9,  def: 4 },
    rect:    { label: "Rectangle", min: 2, max: 15, def: 5 },
    star:    { label: "Star",      min: 2, max: 7,  def: 4 },
    octagon: { label: "Octagon",   min: 2, max: 7,  def: 4 },
    cross:   { label: "Cross",     min: 2, max: 7,  def: 4 },
    ring:    { label: "Ring",      min: 3, max: 7,  def: 4 },
  };

  function centeredCells(kind, a, b) {
    const out = [];
    const box = (s, test) => { for (let j = -s; j <= s; j++) for (let i = -s; i <= s; i++) if (test(i, j)) out.push([i, j]); };
    const A = Math.abs;
    switch (kind) {
      case "square": for (let j = 0; j < a; j++) for (let i = 0; i < a; i++) out.push([i, j]); break;
      case "rect": for (let j = 0; j < b; j++) for (let i = 0; i < a; i++) out.push([i, j]); break;
      case "diamond": box(a, (i, j) => A(i) + A(j) <= a); break;
      case "star": { const R = Math.round(a * 1.5); box(R, (i, j) => (A(i) <= a && A(j) <= a) || A(i) + A(j) <= R); break; }
      case "octagon": { const R = Math.round(a * 1.5); box(a, (i, j) => A(i) + A(j) <= R); break; }
      case "cross": { const w = Math.max(1, Math.round(a / 3)); box(a, (i, j) => (A(i) <= a && A(j) <= w) || (A(j) <= a && A(i) <= w)); break; }
      case "ring": { const h = Math.max(1, Math.round(a / 3)); box(a, (i, j) => !(A(i) <= h && A(j) <= h)); break; }
    }
    return out;
  }

  function shapeWidth(kind, a, b) {
    switch (kind) {
      case "square": return a;
      case "rect": return a;
      case "diamond": return 2 * a + 1;
      case "star": return 2 * Math.round(a * 1.5) + 1;
      default: return 2 * a + 1;
    }
  }

  function shapeLabel(kind, a, b) {
    switch (kind) {
      case "square": return `${a} × ${a}`;
      case "rect": return `${a} × ${b}`;
      case "diamond": return `◇ ${2 * a + 1}–1`;
      default: return `${SHAPES[kind].label} ${shapeWidth(kind, a, b)}`;
    }
  }

  function makeShape(kind, a, b) {
    let cells = centeredCells(kind, a, b);
    let mi = Infinity, mj = Infinity;
    for (const [i, j] of cells) { mi = Math.min(mi, i); mj = Math.min(mj, j); }
    cells = cells.map(([i, j]) => [i - mi, j - mj]);
    let W = 0, H = 0;
    for (const [i, j] of cells) { W = Math.max(W, i + 1); H = Math.max(H, j + 1); }
    const grid = new Uint8Array(W * H);
    for (const [i, j] of cells) grid[j * W + i] = 1;
    const S = { kind, a, b, cells, W, H, grid, cx: W - 1, cy: H - 1, square: W === H };
    S.has = (i, j) => i >= 0 && j >= 0 && i < W && j < H && grid[j * W + i] === 1;
    S.MW = 2 * W + 1;
    S.mid = (x, y) => (y + 1) * S.MW + (x + 1);
    S.edges = [];
    for (const [i, j] of cells) {
      if (S.has(i + 1, j)) S.edges.push([2 * i + 1, 2 * j, i, j, i + 1, j]);
      if (S.has(i, j + 1)) S.edges.push([2 * i, 2 * j + 1, i, j, i, j + 1]);
    }
    S.edgeIdx = new Int32Array(S.MW * (2 * H + 1)).fill(-1);
    S.edges.forEach((e, k) => { S.edgeIdx[S.mid(e[0], e[1])] = k; });
    return S;
  }

  const GROUPS = {
    D4: [(x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x], (x, y) => [-x, y], (x, y) => [x, -y], (x, y) => [y, x], (x, y) => [-y, -x]],
    C4: [(x, y) => [x, y], (x, y) => [-y, x], (x, y) => [-x, -y], (x, y) => [y, -x]],
    D2: [(x, y) => [x, y], (x, y) => [-x, -y], (x, y) => [-x, y], (x, y) => [x, -y]],
    C2: [(x, y) => [x, y], (x, y) => [-x, -y]],
    MV: [(x, y) => [x, y], (x, y) => [-x, y]],
    NONE: [(x, y) => [x, y]],
  };
  const SYM_NAME = { D4: "4-fold + mirrors", C4: "4-fold turn", D2: "two mirrors", C2: "half turn", MV: "one mirror", NONE: "none" };

  function fitSym(S, sym) {
    if (!S.square) { if (sym === "D4") return "D2"; if (sym === "C4") return "C2"; }
    return sym;
  }

  function orbits(S, sym) {
    const G = GROUPS[sym], seen = new Uint8Array(S.edges.length), orbs = [];
    S.edges.forEach((e, k) => {
      if (seen[k]) return;
      const X = e[0] - S.cx, Y = e[1] - S.cy, orb = [];
      for (const g of G) {
        const [u, v] = g(X, Y);
        const x = u + S.cx, y = v + S.cy;
        if (x < -1 || y < -1 || x > 2 * S.W - 1 || y > 2 * S.H - 1) continue;
        const kk = S.edgeIdx[S.mid(x, y)];
        if (kk >= 0 && !seen[kk]) { seen[kk] = 1; orb.push(kk); }
      }
      orbs.push(orb);
    });
    return orbs;
  }

  // Follow every strand. Returns loop count, or the loops as midpoint lists.
  function trace(S, state, full) {
    const QW = 4 * S.W + 4, seg = new Int32Array(QW * (4 * S.H + 4)).fill(-1);
    const sk = (x, y, dx, dy) => (2 * y + dy + 2) * QW + (2 * x + dx + 2);
    const loops = [];
    let count = 0;
    for (const [i, j] of S.cells) {
      const cx = 2 * i, cy = 2 * j;
      const starts = [[cx + 1, cy, -1, 1], [cx, cy + 1, -1, -1], [cx - 1, cy, 1, -1], [cx, cy - 1, 1, 1]];
      for (const [sx, sy, sdx, sdy] of starts) {
        if (seg[sk(sx, sy, sdx, sdy)] >= 0) continue;
        const id = count++, pts = full ? [] : null;
        let x = sx, y = sy, dx = sdx, dy = sdy;
        do {
          if (full) pts.push([x, y]);
          seg[sk(x, y, dx, dy)] = id;
          x += dx; y += dy;
          if (x & 1) {
            if (!S.has((x + dx) >> 1, y >> 1)) dx = -dx;
            else { const s = state[S.edgeIdx[S.mid(x, y)]]; if (s === 1) dx = -dx; else if (s === 2) dy = -dy; }
          } else {
            if (!S.has(x >> 1, (y + dy) >> 1)) dy = -dy;
            else { const s = state[S.edgeIdx[S.mid(x, y)]]; if (s === 1) dy = -dy; else if (s === 2) dx = -dx; }
          }
        } while (!(x === sx && y === sy && dx === sdx && dy === sdy));
        if (full) loops.push(pts);
      }
    }
    return full ? loops : count;
  }

  function shuffle(arr, rnd) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  // Random spanning forest built orbit by orbit, so it keeps the symmetry.
  function symForest(S, orbs, rnd) {
    const n = S.W * S.H, parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (p, a) => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
    const inTree = new Uint8Array(S.edges.length);
    for (const oi of shuffle(orbs.map((_, i) => i), rnd)) {
      const p2 = parent.slice();
      let ok = true;
      for (const k of orbs[oi]) {
        const e = S.edges[k];
        const a = find(p2, e[3] * S.W + e[2]), b = find(p2, e[5] * S.W + e[4]);
        if (a === b) { ok = false; break; }
        p2[a] = b;
      }
      if (ok) { parent.set(p2); for (const k of orbs[oi]) inTree[k] = 1; }
    }
    return inTree;
  }

  const WEAVE = { auto: [0.45, 0.9], open: [0.12, 0.32], dense: [0.88, 1.0] };

  function generateWith(S, sym, single, weave, rnd) {
    const orbs = orbits(S, sym);
    const [w0, w1] = WEAVE[weave] || WEAVE.auto;
    let best = null;
    for (let t = 0; t < (single ? 6 : 1); t++) {
      const inTree = symForest(S, orbs, rnd);
      const state = new Int8Array(S.edges.length);
      for (let k = 0; k < state.length; k++) state[k] = inTree[k] ? 2 : 1;
      if (!single) {
        const pIso = 0.08 + rnd() * 0.14;
        for (const o of orbs) if (state[o[0]] === 2 && rnd() < pIso) for (const k of o) state[k] = 1;
      }
      let loops = trace(S, state, false);
      const pCross = w0 + rnd() * (w1 - w0);
      const order = shuffle(orbs.map((_, i) => i), rnd);
      for (let pass = 0; pass < 3; pass++) {
        for (const oi of order) {
          if (rnd() > pCross) continue;
          const o = orbs[oi], old = state[o[0]];
          if (old === 0) continue;
          for (const k of o) state[k] = 0;
          const L = trace(S, state, false);
          if (!single || L <= loops) loops = L;
          else for (const k of o) state[k] = old;
        }
      }
      if (!best || loops < best.loops) best = { loops, state: state.slice() };
      if (best.loops === 1) break;
    }
    return best;
  }

  function weightedOrder(list, rnd) {
    const items = list.slice(), out = [];
    while (items.length) {
      const tot = items.reduce((s, it) => s + it[1], 0);
      let r = rnd() * tot, k = 0;
      while (k < items.length - 1 && (r -= items[k][1]) > 0) k++;
      out.push(items.splice(k, 1)[0][0]);
    }
    return out;
  }

  function generate(S, opts, rnd) {
    const { single, weave } = opts;
    let syms;
    if (opts.sym === "auto") {
      const prefs = single
        ? (S.square ? [["C4", 5], ["D2", 3], ["MV", 2]] : [["D2", 6], ["MV", 4]])
        : (S.square ? [["D4", 4.5], ["C4", 3.5], ["D2", 2]] : [["D2", 7], ["C2", 3]]);
      syms = weightedOrder(prefs, rnd);
      if (single) for (const f of ["MV", "NONE"]) if (!syms.includes(f)) syms.push(f);
    } else {
      syms = [fitSym(S, opts.sym)];
    }
    let pick = null;
    for (const sym of syms) {
      const r = generateWith(S, sym, single, weave, rnd);
      if (!pick || r.loops < pick.loops) pick = { ...r, sym };
      if (!single || r.loops === 1) break;
    }
    return { sym: pick.sym, state: pick.state, loops: trace(S, pick.state, true) };
  }

  /* ---------- turn midpoint loops into smooth curves ---------- */
  // style: "smooth" | "petal" (rounder outer loops) | "drop" (pointed teardrops on the border)
  // At the outer border the line bounces around an edge dot. "petal" swaps that
  // corner for a round arc around the dot; "drop" for a teardrop with a pointed tip.
  function shapeCurve(S, pts, style) {
    const n = pts.length;
    const plain = () => FEK.fourier.chaikin(pts.map(([x, y]) => [x - S.cx, y - S.cy]), 3);
    if (style === "smooth") return plain();
    // Which vertices are border bounces, and which dot each one wraps.
    const wrap = pts.map(([x, y], k) => {
      const p = pts[(k - 1 + n) % n], q = pts[(k + 1) % n];
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      if (mx % 2 !== 0 || my % 2 !== 0 || (mx === x && my === y)) return null;
      const ox = 2 * x - mx, oy = 2 * y - my; // cell on the far side of this gap
      return ox < 0 || oy < 0 || !S.has(ox >> 1, oy >> 1) ? mx + "," + my : null;
    });
    let start = wrap.findIndex((w) => w === null);
    if (start < 0) return plain();
    const out = [], sharp = [];
    for (let c = 0; c < n; ) {
      const k = (start + c) % n;
      if (wrap[k] === null) { out.push([pts[k][0] - S.cx, pts[k][1] - S.cy]); sharp.push(false); c++; continue; }
      // A run of border bounces around the same dot (2 at a corner, 3 at a tip).
      let run = 0;
      while (c + run < n && wrap[(start + c + run) % n] === wrap[k]) run++;
      const [mx, my] = wrap[k].split(",").map(Number);
      const p = pts[(k - 1 + n) % n], first = pts[k];
      const a0 = Math.atan2(p[1] - my, p[0] - mx);
      const turn = Math.sign((p[0] - mx) * (first[1] - my) - (p[1] - my) * (first[0] - mx)) || 1;
      const sweep = turn * (Math.PI / 2) * (run + 1), N = 8 * (run + 1);
      for (let s = 1; s < N; s++) {
        const ph = sweep * (s / N - 0.5); // 0 at the middle of the arc
        const u = Math.max(0, 1 - Math.abs(ph) / (Math.PI / 2));
        const r = style === "drop" ? 1 + 0.95 * Math.pow(u, 2.4) : 1 + 0.3 * u * u * (3 - 2 * u);
        const ang = a0 + sweep / 2 + ph;
        out.push([mx + r * Math.cos(ang) - S.cx, my + r * Math.sin(ang) - S.cy]);
        sharp.push(style === "drop" && 2 * s === N);
      }
      c += run;
    }
    return FEK.fourier.chaikin(out, 3, sharp);
  }

  function design(opts, rnd) {
    const S = makeShape(opts.shape, opts.size, opts.rows);
    const res = generate(S, opts, rnd);
    const loops = res.loops.map((pts, i) => ({ pts: shapeCurve(S, pts, opts.loopStyle), group: i }));
    const dots = S.cells.map(([i, j]) => [2 * i - S.cx, 2 * j - S.cy]);
    const pad = opts.loopStyle === "drop" ? 1.05 : opts.loopStyle === "petal" ? 0.45 : 0.15;
    const half = Math.max(S.W, S.H) + pad;
    const crossings = res.state.reduce((c, s) => c + (s === 0), 0);
    let note = "";
    if (opts.single && loops.length > 1) {
      note = `This grid with ${SYM_NAME[res.sym]} symmetry can't be drawn as one line, so it uses ${loops.length}. Choose Auto or One mirror symmetry for a single line.`;
    }
    return {
      mode: "sikku", loops, dots, half, lineW: 0.2, dotR: 0.13, density: 6,
      groups: loops.length,
      stats: [
        ["Grid", shapeLabel(opts.shape, opts.size, opts.rows)],
        ["Pulli", String(S.cells.length)],
        ["Lines", String(loops.length)],
        ["Symmetry", SYM_NAME[res.sym]],
        ["Crossings", String(crossings)],
      ],
      label: `${shapeLabel(opts.shape, opts.size, opts.rows)} dot kolam, ${loops.length} line${loops.length > 1 ? "s" : ""}, ${SYM_NAME[res.sym]} symmetry`,
      note,
    };
  }

  FEK.sikku = { SHAPES, makeShape, shapeLabel, shapeWidth, generate, trace, design, SYM_NAME };
})(window.FEK = window.FEK || {});
