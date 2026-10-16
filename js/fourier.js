/*
 * FourierEpiKolam — curve maths: smoothing, arc-length resampling, FFT and
 * Fourier-series (epicycle) reconstruction. The idea:
 * treat a closed curve as complex samples z_n, take the DFT, and redraw it as
 * a chain of rotating circles c_k · e^{2πi f_k t}, largest first.
 */
(function (FEK) {
  "use strict";

  // Chaikin corner cutting on a closed polygon. sharp[i] = keep vertex i as a point.
  function chaikin(pts, iters, sharp) {
    let p = pts, s = sharp || null;
    for (let it = 0; it < iters; it++) {
      const q = [], qs = [], n = p.length;
      for (let i = 0; i < n; i++) {
        const v = p[i], a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
        q.push([v[0] * 0.75 + a[0] * 0.25, v[1] * 0.75 + a[1] * 0.25]); qs.push(false);
        if (s && s[i]) { q.push([v[0], v[1]]); qs.push(true); }
        q.push([v[0] * 0.75 + b[0] * 0.25, v[1] * 0.75 + b[1] * 0.25]); qs.push(false);
      }
      p = q; s = s ? qs : null;
    }
    return p;
  }

  function resample(pts, M) {
    const n = pts.length, cum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      cum[i + 1] = cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    const L = cum[n], re = new Float64Array(M), im = new Float64Array(M);
    let j = 0;
    for (let k = 0; k < M; k++) {
      const d = (L * k) / M;
      while (j < n - 1 && cum[j + 1] < d) j++;
      const a = pts[j], b = pts[(j + 1) % n], seg = cum[j + 1] - cum[j], t = seg > 0 ? (d - cum[j]) / seg : 0;
      re[k] = a[0] + (b[0] - a[0]) * t;
      im[k] = a[1] + (b[1] - a[1]) * t;
    }
    return { re, im, length: L };
  }

  // In-place radix-2 FFT (forward).
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < half; k++) {
          const a = i + k, b = a + half;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }

  const nextPow2 = (v) => { let p = 1; while (p < v) p <<= 1; return p; };

  function curveLength(pts) {
    let L = 0;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); }
    return L;
  }

  // Closed curve -> Fourier series sorted by circle size.
  function prepLoop(pts, density, maxM) {
    const len = curveLength(pts);
    const M = nextPow2(Math.min(maxM || 8192, Math.max(128, len * density)));
    const { re, im, length } = resample(pts, M);
    const exact = new Float32Array(2 * M);
    for (let i = 0; i < M; i++) { exact[2 * i] = re[i]; exact[2 * i + 1] = im[i]; }
    fft(re, im);
    const terms = [];
    for (let k = 1; k < M; k++) {
      const r = re[k] / M, i = im[k] / M;
      terms.push({ f: k < M / 2 ? k : k - M, r, i, a: Math.hypot(r, i) });
    }
    terms.sort((p, q) => q.a - p.a);
    return { M, dc: [re[0] / M, im[0] / M], terms, exact, approx: exact, length };
  }

  // Rebuild the curve from only the K largest circles.
  function computeApprox(L, K) {
    if (K >= L.terms.length) { L.approx = L.exact; return; }
    const M = L.M, out = new Float32Array(2 * M), T = L.terms;
    const fs = new Float64Array(K), rs = new Float64Array(K), is = new Float64Array(K);
    for (let j = 0; j < K; j++) { fs[j] = T[j].f; rs[j] = T[j].r; is[j] = T[j].i; }
    for (let n = 0; n < M; n++) {
      const t = (2 * Math.PI * n) / M;
      let x = L.dc[0], y = L.dc[1];
      for (let j = 0; j < K; j++) {
        const ang = fs[j] * t, c = Math.cos(ang), s = Math.sin(ang);
        x += rs[j] * c - is[j] * s; y += rs[j] * s + is[j] * c;
      }
      out[2 * n] = x; out[2 * n + 1] = y;
    }
    L.approx = out;
  }

  // Seeded random numbers so a design number always rebuilds the same kolam.
  FEK.rng = function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  FEK.hash = function (s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  };

  FEK.fourier = { chaikin, resample, fft, nextPow2, prepLoop, computeApprox, curveLength };
})(window.FEK = window.FEK || {});
