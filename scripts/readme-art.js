#!/usr/bin/env node
/*
 * Builds the animated README drawings in assets/readme/ using the same
 * generator code as the site. Each SVG is a real epicycle machine: one nested
 * <g> per Fourier circle, every group spinning at its frequency relative to
 * its parent, while the traced line is revealed in step with the pen.
 *
 *   node scripts/readme-art.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const sandbox = { window: {}, Math, console };
vm.createContext(sandbox);
for (const f of ["fourier", "sikku", "floral"]) {
  vm.runInContext(fs.readFileSync(path.join(root, "js", f + ".js"), "utf8"), sandbox, { filename: f + ".js" });
}
const FEK = sandbox.window.FEK;
const F = FEK.fourier;

const FLOORS = {
  oxide: ["#94321f", "#842a1b", "#6f2316"],
  indigo: ["#1d56a8", "#174893", "#103575"],
  wood: ["#3d2622", "#30201b", "#231511"],
};
const PALETTE = ["#f7f1e8", "#f3c63d", "#8fd694", "#f5a3c7", "#8cc8f2", "#f6a15b", "#c9b2f5", "#7fe0d4"];
const n2 = (v) => (Math.round(v * 100) / 100).toString();

function liveSVG({ design, K, size = 640, seconds = 14, floor = "oxide", colour = false, circles = 60, title }) {
  const s = (size * 0.9) / (2 * design.half), c = size / 2;
  const X = (v) => n2(c + v * s);
  const loops = design.loops.map((l) => {
    const L = F.prepLoop(l.pts, design.density, design.mode === "floral" ? 2048 : 4096);
    F.computeApprox(L, K);
    L.group = l.group;
    return L;
  });
  const lw = Math.max(1.6, design.lineW * s);
  const fl = FLOORS[floor];
  const T = seconds + "s", T2 = seconds * 2 + "s";
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${title}">\n`;
  o += `<title>${title}</title>\n`;
  o += `<defs><linearGradient id="fl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fl[0]}"/><stop offset=".55" stop-color="${fl[1]}"/><stop offset="1" stop-color="${fl[2]}"/></linearGradient>`;
  o += `<radialGradient id="sh" cx=".32" cy=".2" r=".8"><stop offset="0" stop-color="#ffd2b4" stop-opacity=".16"/><stop offset="1" stop-color="#ffd2b4" stop-opacity="0"/></radialGradient></defs>\n`;
  o += `<rect width="${size}" height="${size}" rx="18" fill="url(#fl)"/><rect width="${size}" height="${size}" rx="18" fill="url(#sh)"/>\n`;
  o += `<g fill="#f7f1e8">`;
  for (const [x, y] of design.dots) o += `<circle cx="${X(x)}" cy="${X(y)}" r="${n2(Math.max(1.6, design.dotR * s))}"/>`;
  o += `</g>\n`;

  // traced lines, revealed in the first lap and held during the second
  o += `<g fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
  for (const L of loops) {
    const step = Math.max(1, Math.ceil(L.M / 1600));
    let d = `M${X(L.approx[0])} ${X(L.approx[1])}`;
    for (let i = step; i < L.M; i += step) d += `L${X(L.approx[2 * i])} ${X(L.approx[2 * i + 1])}`;
    d += `L${X(L.approx[0])} ${X(L.approx[1])}`;
    const col = colour ? PALETTE[L.group % PALETTE.length] : PALETTE[0];
    const anim = `<animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes="0;.5;1" dur="${T2}" repeatCount="indefinite"/>`;
    o += `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke="#ffffff" stroke-opacity=".12" stroke-width="${n2(lw * 2.6)}">${anim}</path>`;
    o += `<path d="${d}" pathLength="1" stroke-dasharray="1 1" stroke="${col}" stroke-width="${n2(lw)}">${anim}</path>\n`;
  }
  o += `</g>\n`;

  // epicycle chains
  const perLoop = Math.max(10, Math.floor(circles / loops.length));
  o += `<g fill="none" stroke-linecap="round">\n`;
  for (const L of loops) {
    const k = Math.min(K, L.terms.length);
    let chain = `<g transform="translate(${X(L.dc[0])} ${X(L.dc[1])})">`;
    let prevF = 0, prevA = 0, close = "</g>";
    for (let j = 0; j < k; j++) {
      const q = L.terms[j], r = q.a * s, ang = (Math.atan2(q.i, q.r) * 180) / Math.PI;
      const a0 = ang - prevA, df = q.f - prevF;
      chain += `<g transform="rotate(${n2(a0)})"><animateTransform attributeName="transform" type="rotate" from="${n2(a0)}" to="${n2(a0 + 360 * df)}" dur="${T}" repeatCount="indefinite"/>`;
      if (j < perLoop && r > 0.9) chain += `<circle r="${n2(r)}" stroke="#d6a84a" stroke-opacity=".32" stroke-width="1"/>`;
      if (r > 0.25) chain += `<line x2="${n2(r)}" stroke="#e7bf63" stroke-opacity=".85" stroke-width="1.2"/>`;
      chain += `<g transform="translate(${n2(r)} 0)">`;
      close += "</g></g>";
      prevF = q.f; prevA = ang;
    }
    chain += `<circle r="${n2(Math.max(3, lw * 0.75))}" fill="#ffe7a8" stroke="none"/>`;
    o += chain + close + "\n";
  }
  o += `</g>\n</svg>\n`;
  return o;
}

function make(mode, opts, seed) {
  const rnd = FEK.rng(FEK.hash(mode + "|" + seed + "|" + JSON.stringify(opts)));
  return mode === "sikku" ? FEK.sikku.design(opts, rnd) : FEK.floral.design(opts, rnd);
}

const out = path.join(root, "assets", "readme");
fs.mkdirSync(out, { recursive: true });

const sikku = make("sikku", { shape: "diamond", size: 3, rows: 8, sym: "C4", weave: "auto", loopStyle: "drop", single: true }, 2026);
fs.writeFileSync(path.join(out, "kolam-live.svg"),
  liveSVG({ design: sikku, K: 220, seconds: 16, floor: "oxide", circles: 70, title: "A single-line dot kolam drawn live by Fourier epicycles" }));

const floral = make("floral", { layout: "seven", flower: "spiro", petals: "6", lattice: true }, 108);
fs.writeFileSync(path.join(out, "floral-live.svg"),
  liveSVG({ design: floral, K: 16, seconds: 12, floor: "indigo", colour: true, circles: 120, title: "Seven spiral-loop flowers drawn live by Fourier epicycles" }));

console.log("Wrote assets/readme/kolam-live.svg and floral-live.svg");
