/*
 * FourierEpiKolam — floral kolam generator.
 * Every flower is built from closed mathematical curves:
 *   lotus   r(θ) = b + (1-b)·tri(nθ/2π)^q        (pointed petals, two layers)
 *   rose    r(θ) = b + (1-b)·|cos(nθ/2)|^q        (rounded petals)
 *   spiro   z(θ) = e^{iθ} − B·e^{i(n+1)θ}         (epitrochoid: outward loops around a ring of dots)
 *   star    z(θ) = e^{iθ} + B·e^{−i(n−1)θ}        (hypotrochoid: looping star)
 *   leaves  separate lens-shaped leaves around a rounded centre, with a swirl
 * Flowers are laid out singly, as seven, as a 3×3 garden, or as a ring, with
 * pulli dots filling the gaps.
 */
(function (FEK) {
  "use strict";
  const TAU = Math.PI * 2;
  const tri = (u) => { u -= Math.floor(u); return 1 - Math.abs(2 * u - 1); };

  function polar(fn, N) {
    const pts = [];
    for (let k = 0; k < N; k++) { const th = (TAU * k) / N, r = fn(th); pts.push([r * Math.cos(th), r * Math.sin(th)]); }
    return pts;
  }
  function param(fn, N) {
    const pts = [];
    for (let k = 0; k < N; k++) pts.push(fn((TAU * k) / N));
    return pts;
  }
  const ringDots = (n, r, phase) => Array.from({ length: n }, (_, j) => [r * Math.cos(phase + (TAU * j) / n), r * Math.sin(phase + (TAU * j) / n)]);

  /* ---- motifs at unit radius, centred on the origin ---- */
  const MOTIFS = {
    lotus(n, rnd) {
      const b1 = 0.36 + 0.14 * rnd(), q1 = 0.45 + 0.35 * rnd();
      const R2 = 0.52 + 0.1 * rnd(), b2 = 0.3 + 0.2 * rnd(), q2 = 0.5 + 0.4 * rnd();
      const loops = [
        polar((t) => b1 + (1 - b1) * Math.pow(tri((n * t) / TAU), q1), 1440),
        polar((t) => R2 * (b2 + (1 - b2) * Math.pow(tri((n * t) / TAU + 0.5), q2)), 1080),
      ];
      if (rnd() < 0.6) loops.push(polar((t) => 0.17 * (0.55 + 0.45 * Math.abs(Math.cos((n * t) / 2))), 480));
      else loops.push(polar(() => 0.14, 240));
      const dots = [[0, 0], ...ringDots(n, (R2 + 1) / 2, (TAU * 0.5) / n)];
      if (rnd() < 0.5) dots.push(...ringDots(n, R2 * 0.66, 0));
      return { loops, dots };
    },
    rose(n, rnd) {
      const b = 0.12 + 0.2 * rnd(), q = 0.55 + 1.0 * rnd();
      const loops = [polar((t) => b + (1 - b) * Math.pow(Math.abs(Math.cos((n * t) / 2)), q), 1440)];
      if (rnd() < 0.55) loops.push(polar((t) => 0.2 + 0.05 * Math.cos(n * t + Math.PI), 480));
      return { loops, dots: [[0, 0], ...ringDots(n, 0.6, 0)] };
    },
    spiro(n, rnd) {
      const B = Math.min(0.6, Math.max(0.12, (1.35 + 1.7 * rnd()) / (n + 1))), s = 1 / (1 + B);
      const loops = [param((t) => [s * (Math.cos(t) - B * Math.cos((n + 1) * t)), s * (Math.sin(t) - B * Math.sin((n + 1) * t))], 2400)];
      if (rnd() < 0.5) loops.push(polar((t) => 0.22 + 0.06 * Math.cos(n * t), 480));
      return { loops, dots: [[0, 0], ...ringDots(n, s, Math.PI / n)] };
    },
    star(n, rnd) {
      n = Math.max(3, n);
      const B = Math.min(0.7, Math.max(0.15, (1.25 + 1.5 * rnd()) / (n - 1))), s = 1 / (1 + B);
      const loops = [param((t) => [s * (Math.cos(t) + B * Math.cos((n - 1) * t)), s * (Math.sin(t) - B * Math.sin((n - 1) * t))], 2400)];
      return { loops, dots: [[0, 0], ...ringDots(n, s, 0)] };
    },
    leaves(n, rnd) {
      const rc = 0.3;
      const poly = Array.from({ length: n }, (_, j) => [rc * Math.cos((TAU * (j + 0.5)) / n), rc * Math.sin((TAU * (j + 0.5)) / n)]);
      const loops = [FEK.fourier.chaikin(poly, 4)];
      const tilt = (rnd() - 0.5) * 0.7, Lf = 0.68, rb = 0.33;
      const w = (0.17 + 0.12 * rnd()) * Math.min(1, 6 / n);
      const asym = (rnd() - 0.5) * 0.6, curl = (rnd() - 0.5) * 0.25;
      for (let j = 0; j < n; j++) {
        const al = (TAU * j) / n, ang = al + tilt, ca = Math.cos(ang), sa = Math.sin(ang);
        const bx = rb * Math.cos(al), by = rb * Math.sin(al), K = 70, leaf = [];
        const up = (t) => w * Math.pow(Math.sin(Math.PI * t), 0.75) * (1 + asym * (t - 0.5));
        const lo = (t) => w * Math.pow(Math.sin(Math.PI * t), 0.9) * (1 - asym * (t - 0.5));
        const c = (t) => curl * t * t;
        for (let k = 0; k <= K; k++) { const t = k / K; leaf.push([t, c(t) + up(t)]); }
        for (let k = K - 1; k > 0; k--) { const t = k / K; leaf.push([t, c(t) - lo(t)]); }
        loops.push(leaf.map(([x, y]) => [bx + Lf * (x * ca - y * sa), by + Lf * (x * sa + y * ca)]));
      }
      return { loops, dots: [[0, 0]] };
    },
  };
  const MOTIF_NAMES = { lotus: "Lotus", rose: "Rose", spiro: "Spiral loops", star: "Star loops", leaves: "Leaf petals" };
  const MOTIF_KEYS = Object.keys(MOTIFS);
  const LAYOUT_NAMES = { mandala: "Single mandala", seven: "Seven flowers", garden: "3×3 garden", ring: "Ring of flowers" };

  function place(m, scale, rot, tx, ty) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const tf = ([x, y]) => [tx + scale * (x * c - y * s), ty + scale * (x * s + y * c)];
    return { loops: m.loops.map((l) => l.map(tf)), dots: m.dots.map(tf) };
  }

  function design(opts, rnd) {
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const layout = opts.layout === "auto" ? pick(["mandala", "seven", "garden", "ring", "seven", "mandala"]) : opts.layout;
    const typeA = opts.flower === "mixed" ? pick(MOTIF_KEYS) : opts.flower;
    let typeB = opts.flower === "mixed" ? pick(MOTIF_KEYS.filter((k) => k !== typeA)) : opts.flower;
    const petals = (lo, hi) => (opts.petals === "auto" ? lo + Math.floor(rnd() * (hi - lo + 1)) : +opts.petals);
    const flowers = []; // {center, R, parts}
    const up = -Math.PI / 2;

    if (layout === "mandala") {
      const n = petals(6, 12);
      const outer = place(MOTIFS[typeA](n, rnd), 1, up + Math.PI / n, 0, 0);
      const innerType = typeA === typeB ? pick(["rose", "spiro", "star", "lotus"]) : typeB;
      const n2 = innerType === "leaves" ? Math.max(5, Math.round(n / 2)) : n;
      const inner = place(MOTIFS[innerType](n2, rnd), 0.44, up, 0, 0);
      flowers.push({ c: [0, 0], R: 1, parts: [outer] }, { c: [0, 0], R: 0.44, parts: [inner], inner: true });
      const ringN = 2 * n;
      flowers[0].parts[0].dots.push(...ringDots(ringN, 1.12, up));
      typeB = innerType;
    } else if (layout === "seven") {
      const n = petals(5, 8), D = 2.2, rot = up + (rnd() < 0.5 ? 0 : Math.PI / n);
      const centerType = rnd() < 0.5 ? typeA : typeB;
      flowers.push({ c: [0, 0], R: 1, parts: [place(MOTIFS[centerType](n, rnd), 1, rot, 0, 0)] });
      const proto = rnd(); // shared seed so all six petals match
      for (let j = 0; j < 6; j++) {
        const a = up + (TAU * j) / 6 + Math.PI / 6, cx = D * Math.cos(a), cy = D * Math.sin(a);
        const r2 = FEK.rng(Math.floor(proto * 1e9));
        flowers.push({ c: [cx, cy], R: 1, parts: [place(MOTIFS[typeA](n, r2), 1, rot, cx, cy)] });
      }
    } else if (layout === "garden") {
      const n = petals(5, 8), D = 2.25, pa = rnd(), pb = rnd();
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const even = (i + j) % 2 === 0, t = even ? typeA : typeB;
        const r2 = FEK.rng(Math.floor((even ? pa : pb) * 1e9));
        flowers.push({ c: [i * D, j * D], R: 1, parts: [place(MOTIFS[t](n, r2), 1, up + (even ? 0 : Math.PI / n), i * D, j * D)] });
      }
    } else {
      const n = petals(6, 10), k = 8, D = 2.15, sc = 0.62, pb = rnd();
      flowers.push({ c: [0, 0], R: 1.15, parts: [place(MOTIFS[typeA](n, rnd), 1.15, up, 0, 0)] });
      const nb = Math.max(4, Math.min(8, n - 1));
      for (let j = 0; j < k; j++) {
        const a = up + (TAU * j) / k, cx = D * Math.cos(a), cy = D * Math.sin(a);
        const r2 = FEK.rng(Math.floor(pb * 1e9));
        flowers.push({ c: [cx, cy], R: sc, parts: [place(MOTIFS[typeB](nb, r2), sc, a, cx, cy)] });
      }
    }

    const loops = [], dots = [];
    flowers.forEach((f, gi) => f.parts.forEach((p) => { p.loops.forEach((l) => loops.push({ pts: l, group: gi })); dots.push(...p.dots); }));

    let half = 0;
    for (const l of loops) for (const [x, y] of l.pts) half = Math.max(half, Math.abs(x), Math.abs(y));
    for (const [x, y] of dots) half = Math.max(half, Math.abs(x), Math.abs(y));
    half += 0.22;

    if (opts.lattice) {
      const g = layout === "mandala" ? 0.36 : 0.55, lim = half - 0.12;
      for (let y = -Math.floor(lim / g) * g; y <= lim + 1e-9; y += g)
        for (let x = -Math.floor(lim / g) * g; x <= lim + 1e-9; x += g) {
          let ok = true;
          for (const f of flowers) if (!f.inner && Math.hypot(x - f.c[0], y - f.c[1]) < f.R * 1.13) { ok = false; break; }
          if (ok) dots.push([x, y]);
        }
    }

    const nFlowers = flowers.filter((f) => !f.inner).length;
    const typeLabel = typeA === typeB ? MOTIF_NAMES[typeA] : `${MOTIF_NAMES[typeA]} + ${MOTIF_NAMES[typeB]}`;
    return {
      mode: "floral", loops, dots, half, lineW: 0.018 * half, dotR: 0.012 * half, density: 140,
      groups: flowers.length,
      stats: [
        ["Layout", LAYOUT_NAMES[layout]],
        ["Flowers", typeLabel],
        ["Count", String(nFlowers)],
        ["Lines", String(loops.length)],
      ],
      label: `${LAYOUT_NAMES[layout]} floral kolam with ${typeLabel.toLowerCase()} flowers`,
      note: "",
    };
  }

  FEK.floral = { design, MOTIF_NAMES, LAYOUT_NAMES };
})(window.FEK = window.FEK || {});
