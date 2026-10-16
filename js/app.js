/* FourierEpiKolam — UI, Fourier epicycle animation, export and sharing. */
(function (FEK) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const F = FEK.fourier;

  const TERM_STEPS = [4, 8, 16, 32, 64, 128, 256, 512, 1024, Infinity];
  const SPEED_MULT = [0.25, 0.4, 0.6, 0.8, 1, 1.4, 2, 3, 5, 8];
  const BASE_SECONDS = 12;
  const PALETTE = ["#f7f1e8", "#f3c63d", "#8fd694", "#f5a3c7", "#8cc8f2", "#f6a15b", "#c9b2f5", "#7fe0d4"];
  const FLOORS = {
    oxide:  { name: "Red oxide", stops: ["#94321f", "#842a1b", "#6f2316"], sheen: "rgba(255,190,150,.16)" },
    indigo: { name: "Indigo",    stops: ["#1d56a8", "#174893", "#103575"], sheen: "rgba(170,200,255,.16)" },
    wood:   { name: "Dark wood", stops: ["#3d2622", "#30201b", "#231511"], sheen: "rgba(255,220,190,.07)", grain: true },
    slate:  { name: "Slate",     stops: ["#36403f", "#2b3433", "#1f2625"], sheen: "rgba(220,240,240,.08)" },
  };
  const SHAPES = FEK.sikku.SHAPES;
  const PRESETS = [
    { k: "square", a: 5, t: "5×5" }, { k: "square", a: 6, t: "6×6" }, { k: "square", a: 8, t: "8×8" }, { k: "square", a: 11, t: "11×11" },
    { k: "diamond", a: 4, t: "◇ 9–1" }, { k: "diamond", a: 7, t: "◇ 15–1" }, { k: "rect", a: 8, b: 15, t: "8×15" },
  ];
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const st = {
    mode: "sikku",
    shape: "diamond",
    sizes: Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.def])),
    rows: 8,
    floor: "oxide",
    seed: 0,
    design: null,
    loops: [],
    anim: { stage: 0, t: 0, playing: false, stages: [] },
  };

  /* ---------------- controls ---------------- */
  function buildStaticControls() {
    const sh = $("shapes");
    for (const [k, v] of Object.entries(SHAPES)) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.shape = k; b.textContent = v.label;
      b.addEventListener("click", () => { st.shape = k; syncControls(); newDesign(); });
      sh.appendChild(b);
    }
    PRESETS.forEach((p, i) => {
      const c = document.createElement("button");
      c.type = "button"; c.className = "chip"; c.dataset.i = i; c.textContent = p.t;
      c.addEventListener("click", () => { st.shape = p.k; st.sizes[p.k] = p.a; if (p.b) st.rows = p.b; syncControls(); newDesign(); });
      $("presets").appendChild(c);
    });
    for (const [k, v] of Object.entries(FLOORS)) {
      const c = document.createElement("button");
      c.type = "button"; c.className = "chip"; c.dataset.floor = k;
      c.innerHTML = `<i style="background:${v.stops[1]}"></i>${v.name}`;
      c.addEventListener("click", () => { st.floor = k; syncControls(); drawFloor(); render(); updateURL(); });
      $("floors").appendChild(c);
    }
  }

  function sizeText() {
    const a = st.sizes[st.shape];
    if (st.shape === "square") return `${a} × ${a}`;
    if (st.shape === "rect") return String(a);
    return `${FEK.sikku.shapeWidth(st.shape, a)} across`;
  }

  function syncControls() {
    $("m-sikku").setAttribute("aria-pressed", String(st.mode === "sikku"));
    $("m-floral").setAttribute("aria-pressed", String(st.mode === "floral"));
    $("sikkuPanel").hidden = st.mode !== "sikku";
    $("floralPanel").hidden = st.mode !== "floral";
    document.querySelectorAll("#shapes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.shape === st.shape)));
    const S = SHAPES[st.shape], sA = $("sizeA");
    sA.min = S.min; sA.max = S.max; sA.value = st.sizes[st.shape];
    $("sizeALabel").textContent = st.shape === "rect" ? "Columns" : st.shape === "square" ? "Dots per side" : "Size";
    $("sizeAOut").textContent = sizeText();
    $("sizeBField").hidden = st.shape !== "rect";
    $("sizeB").value = st.rows; $("sizeBOut").textContent = String(st.rows);
    document.querySelectorAll("#presets .chip").forEach((ch) => {
      const p = PRESETS[+ch.dataset.i];
      ch.setAttribute("aria-pressed", String(p.k === st.shape && p.a === st.sizes[p.k] && (p.k !== "rect" || p.b === st.rows)));
    });
    document.querySelectorAll("#floors .chip").forEach((ch) => ch.setAttribute("aria-pressed", String(ch.dataset.floor === st.floor)));
    document.documentElement.style.setProperty("--floor-bg", FLOORS[st.floor].stops[1]);
    const K = TERM_STEPS[+$("terms").value];
    $("termsOut").textContent = K === Infinity ? "all" : String(K);
    $("speedOut").textContent = `${+$("speed").value + 1} / 10`;
  }

  /* ---------------- build a design ---------------- */
  function currentOpts() {
    if (st.mode === "sikku") {
      return { shape: st.shape, size: st.sizes[st.shape], rows: st.rows, sym: $("sym").value, weave: $("weave").value, loopStyle: $("loopStyle").value, single: $("single").checked };
    }
    return { layout: $("layout").value, flower: $("flower").value, petals: $("petals").value, lattice: $("lattice").checked };
  }

  function build() {
    const opts = currentOpts();
    const rnd = FEK.rng(FEK.hash(st.mode + "|" + st.seed + "|" + JSON.stringify(opts)));
    const d = st.mode === "sikku" ? FEK.sikku.design(opts, rnd) : FEK.floral.design(opts, rnd);
    st.design = d;
    const maxM = d.mode === "floral" ? 4096 : 8192;
    st.loops = d.loops
      .map((l) => Object.assign(F.prepLoop(l.pts, d.density, maxM), { group: l.group }))
      .sort((p, q) => q.length - p.length);
    applyTerms();
    cancelAnimationFrame(raf);
    st.anim = { stage: 0, t: 0, playing: false, stages: makeStages() };
    $("seedInput").value = String(st.seed);
    updateReadout();
    layout();
    startAnim();
    updateURL();
  }

  function applyTerms() {
    const K = TERM_STEPS[+$("terms").value];
    for (const L of st.loops) F.computeApprox(L, K);
  }

  function updateReadout() {
    const d = st.design, K = TERM_STEPS[+$("terms").value];
    const maxT = Math.max(...st.loops.map((l) => l.terms.length));
    const parts = [`<span>Design <b>№${st.seed}</b></span>`];
    for (const [k, v] of d.stats) parts.push(`<span>${k} <b>${v}</b></span>`);
    parts.push(`<span>Circles <b>${K === Infinity ? maxT : Math.min(K, maxT)}</b>${st.loops.length > 1 ? " per line" : ` of ${maxT}`}</span>`);
    $("readout").innerHTML = parts.join("");
    $("note").textContent = d.note || "";
    $("dotCount").textContent = d.mode === "sikku" ? `${d.dots.length} pulli` : "";
    $("cv").setAttribute("aria-label", d.label);
  }

  /* ---------------- drawing ---------------- */
  const cv = $("cv"), ctx = cv.getContext("2d");
  const floorLayer = document.createElement("canvas"), doneLayer = document.createElement("canvas");
  let px = 0, dpr = 1, scale = 1, ox = 0, oy = 0;

  function layout() {
    const host = $("floor").getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const side = Math.max(10, Math.floor(Math.min(host.width, host.height)));
    cv.style.width = side + "px"; cv.style.height = side + "px";
    px = Math.round(side * dpr);
    for (const c of [cv, floorLayer, doneLayer]) { c.width = px; c.height = px; }
    if (!st.design) return;
    scale = (px * 0.92) / (2 * st.design.half);
    ox = px / 2; oy = px / 2;
    drawFloor(); redrawDone(); render();
  }

  function paintFloor(g, w, d, sc, cx, cy, withDots) {
    const fl = FLOORS[st.floor];
    const lg = g.createLinearGradient(0, 0, w, w);
    lg.addColorStop(0, fl.stops[0]); lg.addColorStop(0.55, fl.stops[1]); lg.addColorStop(1, fl.stops[2]);
    g.fillStyle = lg; g.fillRect(0, 0, w, w);
    if (fl.grain) {
      const r = FEK.rng(7);
      for (let i = 0; i < w / 3; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,230,210"},${0.02 + r() * 0.04})`;
        g.fillRect(r() * w, 0, 0.5 + r() * 2.5 * (w / 900), w);
      }
    }
    const rg = g.createRadialGradient(w * 0.35, w * 0.22, 0, w * 0.35, w * 0.22, w * 0.75);
    rg.addColorStop(0, fl.sheen); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(0, 0, w, w);
    const vg = g.createRadialGradient(w / 2, w / 2, w * 0.45, w / 2, w / 2, w * 0.78);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(10,4,3,.38)");
    g.fillStyle = vg; g.fillRect(0, 0, w, w);
    if (withDots && d) {
      g.fillStyle = "rgba(247,241,232,.95)";
      const r = Math.max(1.4, d.dotR * sc);
      for (const [x, y] of d.dots) { g.beginPath(); g.arc(cx + x * sc, cy + y * sc, r, 0, 7); g.fill(); }
    }
  }
  function drawFloor() { paintFloor(floorLayer.getContext("2d"), px, st.design, scale, ox, oy, $("showDots").checked); }

  function colorOf(L) {
    return $("colorLines").checked && st.design.groups > 1 ? PALETTE[L.group % PALETTE.length] : PALETTE[0];
  }
  function strokePts(g, pts, count, color, closed, sc, cx, cy, lineW) {
    if (count < 2) return;
    const lw = Math.max(1.3 * dpr, lineW * sc);
    g.lineJoin = "round"; g.lineCap = "round";
    g.beginPath(); g.moveTo(cx + pts[0] * sc, cy + pts[1] * sc);
    for (let i = 1; i < count; i++) g.lineTo(cx + pts[2 * i] * sc, cy + pts[2 * i + 1] * sc);
    if (closed) g.closePath();
    g.strokeStyle = "rgba(255,255,255,.10)"; g.lineWidth = lw * 2.6; g.stroke();
    g.strokeStyle = color; g.lineWidth = lw; g.stroke();
  }
  const strokeLoop = (g, L, count, closed) => strokePts(g, L.approx, count, colorOf(L), closed, scale, ox, oy, st.design.lineW);

  function redrawDone() {
    const g = doneLayer.getContext("2d"); g.clearRect(0, 0, px, px);
    const A = st.anim;
    A.stages.forEach((stage, si) => { if (si < A.stage || !A.playing) for (const li of stage) strokeLoop(g, st.loops[li], st.loops[li].M, true); });
  }

  function render() {
    if (!px) return;
    ctx.clearRect(0, 0, px, px);
    ctx.drawImage(floorLayer, 0, 0); ctx.drawImage(doneLayer, 0, 0);
    const A = st.anim;
    if (!A.playing || A.stage >= A.stages.length) return;
    const stage = A.stages[A.stage];
    for (const li of stage) { const L = st.loops[li]; strokeLoop(ctx, L, Math.min(L.M, Math.floor(A.t * L.M) + 1), false); }
    if ($("showCircles").checked) {
      const budget = Math.max(24, Math.floor(700 / stage.length));
      for (const li of stage) drawEpicycles(st.loops[li], A.t, budget);
    }
  }

  function drawEpicycles(L, t, maxCircles) {
    const K = Math.min(TERM_STEPS[+$("terms").value], L.terms.length), T = L.terms, tau = 2 * Math.PI * t;
    let x = L.dc[0], y = L.dc[1];
    ctx.lineWidth = Math.max(1, dpr * 0.9);
    const arms = [[x, y]];
    ctx.strokeStyle = "rgba(214,168,74,.28)";
    ctx.beginPath();
    for (let j = 0; j < K; j++) {
      const q = T[j], ang = q.f * tau, c = Math.cos(ang), s = Math.sin(ang), rr = q.a * scale;
      if (j < maxCircles && rr > 1.2) { ctx.moveTo(ox + x * scale + rr, oy + y * scale); ctx.arc(ox + x * scale, oy + y * scale, rr, 0, 2 * Math.PI); }
      x += q.r * c - q.i * s; y += q.r * s + q.i * c;
      if (j < maxCircles * 2) arms.push([x, y]);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(231,191,99,.85)";
    ctx.beginPath(); ctx.moveTo(ox + arms[0][0] * scale, oy + arms[0][1] * scale);
    for (const [a, b] of arms) ctx.lineTo(ox + a * scale, oy + b * scale);
    ctx.lineTo(ox + x * scale, oy + y * scale);
    ctx.stroke();
    ctx.fillStyle = "#ffe7a8"; ctx.beginPath(); ctx.arc(ox + x * scale, oy + y * scale, Math.max(2.5 * dpr, st.design.lineW * scale * 0.7), 0, 7); ctx.fill();
  }

  /* ---------------- animation ---------------- */
  let raf = 0;
  function makeStages() {
    const idx = st.loops.map((_, i) => i);
    return $("together").checked ? [idx] : idx.map((i) => [i]);
  }
  function startAnim(forcePlay) {
    cancelAnimationFrame(raf);
    st.anim = { stage: 0, t: 0, playing: forcePlay || !reduceMotion, stages: makeStages() };
    redrawDone(); render();
    if (st.anim.playing) { lastTs = 0; raf = requestAnimationFrame(tick); }
  }
  let lastTs = 0;
  function tick(ts) {
    const A = st.anim;
    if (!A.playing) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 1 / 60;
    lastTs = ts;
    const totalM = st.loops.reduce((s, l) => s + l.M, 0);
    const stage = A.stages[A.stage];
    const weight = A.stages.length === 1 ? 1 : stage.reduce((s, li) => s + st.loops[li].M, 0) / totalM;
    A.t += (dt * SPEED_MULT[+$("speed").value]) / (BASE_SECONDS * weight);
    if (A.t >= 1) {
      const g = doneLayer.getContext("2d");
      for (const li of stage) strokeLoop(g, st.loops[li], st.loops[li].M, true);
      A.stage++; A.t = 0;
      if (A.stage >= A.stages.length) { A.playing = false; render(); return; }
    }
    render();
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    cancelAnimationFrame(raf);
    st.anim = { stage: st.anim.stages.length, t: 0, playing: false, stages: st.anim.stages };
    redrawDone(); render();
  }

  /* ---------------- export ---------------- */
  function download(url, name) {
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  function fileBase() { return `FourierEpiKolam-${st.mode}-${st.seed}`; }

  function savePNG() {
    const w = 2400, c = document.createElement("canvas"); c.width = w; c.height = w;
    const g = c.getContext("2d"), sc = (w * 0.92) / (2 * st.design.half), saveDpr = dpr;
    paintFloor(g, w, st.design, sc, w / 2, w / 2, $("showDots").checked);
    dpr = 2;
    for (const L of st.loops) strokePts(g, L.approx, L.M, colorOf(L), true, sc, w / 2, w / 2, st.design.lineW);
    dpr = saveDpr;
    c.toBlob((b) => { if (b) download(URL.createObjectURL(b), fileBase() + ".png"); }, "image/png");
  }

  function saveSVG() {
    const w = 1200, sc = (w * 0.92) / (2 * st.design.half), c = w / 2, d = st.design, fl = FLOORS[st.floor];
    const lw = Math.max(1.2, d.lineW * sc), f = (v) => (c + v * sc).toFixed(1);
    let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${w}" height="${w}">\n`;
    out += `<defs><linearGradient id="fl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${fl.stops[0]}"/><stop offset=".55" stop-color="${fl.stops[1]}"/><stop offset="1" stop-color="${fl.stops[2]}"/></linearGradient></defs>\n`;
    out += `<rect width="${w}" height="${w}" fill="url(#fl)"/>\n`;
    if ($("showDots").checked) {
      out += `<g fill="#f7f1e8">`;
      for (const [x, y] of d.dots) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${Math.max(1.4, d.dotR * sc).toFixed(2)}"/>`;
      out += `</g>\n`;
    }
    out += `<g fill="none" stroke-linecap="round" stroke-linejoin="round">\n`;
    for (const L of st.loops) {
      const step = Math.max(1, Math.floor(L.M / 2048));
      let p = `M${f(L.approx[0])} ${f(L.approx[1])}`;
      for (let i = step; i < L.M; i += step) p += `L${f(L.approx[2 * i])} ${f(L.approx[2 * i + 1])}`;
      p += "Z";
      out += `<path d="${p}" stroke="rgba(255,255,255,.10)" stroke-width="${(lw * 2.6).toFixed(2)}"/>`;
      out += `<path d="${p}" stroke="${colorOf(L)}" stroke-width="${lw.toFixed(2)}"/>\n`;
    }
    out += `</g>\n</svg>\n`;
    download(URL.createObjectURL(new Blob([out], { type: "image/svg+xml" })), fileBase() + ".svg");
  }

  /* ---------------- sharing via URL ---------------- */
  function paramsFromState() {
    const p = new URLSearchParams();
    p.set("s", st.seed); p.set("m", st.mode); p.set("c", st.floor);
    if (st.mode === "sikku") {
      p.set("k", st.shape); p.set("n", st.sizes[st.shape]);
      if (st.shape === "rect") p.set("r", st.rows);
      p.set("y", $("sym").value); p.set("w", $("weave").value); p.set("l", $("loopStyle").value); p.set("o", $("single").checked ? 1 : 0);
    } else {
      p.set("f", $("layout").value); p.set("t", $("flower").value); p.set("p", $("petals").value); p.set("d", $("lattice").checked ? 1 : 0);
    }
    return p;
  }
  function updateURL() {
    try { history.replaceState(null, "", location.pathname + "?" + paramsFromState().toString()); } catch (e) { /* not allowed here */ }
  }
  function setSelect(id, v) { const el = $(id); if (v != null && [...el.options].some((o) => o.value === v)) el.value = v; }
  function readURL() {
    let p;
    try { p = new URLSearchParams(location.search); } catch (e) { return false; }
    if (!p.has("s")) return false;
    st.seed = parseInt(p.get("s"), 10) || newSeed();
    if (p.get("m") === "floral") st.mode = "floral";
    if (FLOORS[p.get("c")]) st.floor = p.get("c");
    if (SHAPES[p.get("k")]) st.shape = p.get("k");
    const n = parseInt(p.get("n"), 10);
    if (n) { const S = SHAPES[st.shape]; st.sizes[st.shape] = Math.min(S.max, Math.max(S.min, n)); }
    const r = parseInt(p.get("r"), 10); if (r) st.rows = Math.min(15, Math.max(2, r));
    setSelect("sym", p.get("y")); setSelect("weave", p.get("w")); setSelect("loopStyle", p.get("l"));
    if (p.has("o")) $("single").checked = p.get("o") === "1";
    setSelect("layout", p.get("f")); setSelect("flower", p.get("t")); setSelect("petals", p.get("p"));
    if (p.has("d")) $("lattice").checked = p.get("d") === "1";
    return true;
  }
  function flash(btn, text) { const old = btn.textContent; btn.textContent = text; setTimeout(() => (btn.textContent = old), 1500); }
  function copyLink() {
    const btn = $("copyLinkBtn");
    let url;
    try { url = location.origin && location.origin !== "null" ? location.origin + location.pathname + "?" + paramsFromState() : null; } catch (e) { url = null; }
    const text = url || `Design ${st.seed}`;
    try {
      navigator.clipboard.writeText(text).then(() => flash(btn, "Link copied"), () => { $("seedInput").select(); });
    } catch (e) { $("seedInput").select(); }
  }
  function toggleFull() {
    const el = $("floor");
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    } catch (e) { /* not supported */ }
  }

  /* ---------------- events ---------------- */
  function newSeed() { return 100000 + Math.floor(Math.random() * 900000); }
  function newDesign() { st.seed = newSeed(); build(); }

  buildStaticControls();
  $("newBtn").addEventListener("click", newDesign);
  cv.addEventListener("click", newDesign);
  document.addEventListener("keydown", (e) => {
    if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "n" || e.key === "N") { e.preventDefault(); newDesign(); }
    if (e.key === "f" || e.key === "F") { e.preventDefault(); toggleFull(); }
  });
  document.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => { st.mode = b.dataset.mode; syncControls(); newDesign(); }));
  $("sizeA").addEventListener("input", (e) => { st.sizes[st.shape] = +e.target.value; syncControls(); newDesign(); });
  $("sizeB").addEventListener("input", (e) => { st.rows = +e.target.value; syncControls(); newDesign(); });
  for (const id of ["sym", "weave", "loopStyle", "single", "layout", "flower", "petals", "lattice"]) $(id).addEventListener("change", newDesign);
  $("colorLines").addEventListener("change", () => { redrawDone(); render(); });
  $("showDots").addEventListener("change", () => { drawFloor(); render(); });
  $("terms").addEventListener("input", () => { syncControls(); applyTerms(); updateReadout(); redrawDone(); render(); });
  $("speed").addEventListener("input", syncControls);
  $("showCircles").addEventListener("change", render);
  $("together").addEventListener("change", () => startAnim(true));
  $("replayBtn").addEventListener("click", () => startAnim(true));
  $("finishBtn").addEventListener("click", finish);
  $("loadBtn").addEventListener("click", () => { const v = parseInt($("seedInput").value.replace(/\D/g, ""), 10); if (Number.isFinite(v)) { st.seed = v; build(); } });
  $("seedInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loadBtn").click(); });
  $("pngBtn").addEventListener("click", savePNG);
  $("svgBtn").addEventListener("click", saveSVG);
  $("copyLinkBtn").addEventListener("click", copyLink);
  $("fullBtn").addEventListener("click", toggleFull);
  document.addEventListener("fullscreenchange", () => layout());
  if ("ResizeObserver" in window) new ResizeObserver(() => layout()).observe($("floor"));
  else window.addEventListener("resize", layout);

  if (!readURL()) st.seed = newSeed();
  syncControls();
  build();
})(window.FEK = window.FEK || {});
