/* ═══════════════════════════════════════════════════════════
   ChurnShield — fx.js
   Visual effects: custom cursor, hero 3D sphere, neural net
   canvas, animated counters, industry card mini-spheres,
   scroll reveal.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── Custom cursor ─────────────────────────────────────── */
  const cur = document.getElementById("cursor");
  const ring = document.getElementById("cursor-ring");
  if (cur && ring) {
    document.addEventListener("mousemove", (e) => {
      cur.style.left = e.clientX + "px";
      cur.style.top = e.clientY + "px";
      ring.style.left = e.clientX + "px";
      ring.style.top = e.clientY + "px";
    });
  }

  /* ── Animated counters (hero stat cards) ───────────────── */
  function countUp(el, target, dur, isFloat, suffix) {
    if (!el) return;
    const start = performance.now();
    function tick(now) {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = (isFloat ? (e * target).toFixed(3) : Math.floor(e * target)) + (suffix || "");
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }
  setTimeout(() => {
    countUp(document.getElementById("counter-risk"), 621, 2000, false);
    countUp(document.getElementById("counter-acc"), 92, 1800, false, "%");
    countUp(document.getElementById("counter-auc"), 0.886, 2200, true);
  }, 1200);

  /* ── Hero 3D particle sphere ───────────────────────────── */
  const hcv = document.getElementById("hero-canvas");
  if (hcv) {
    const hctx = hcv.getContext("2d");
    function resizeHero() { hcv.width = hcv.offsetWidth; hcv.height = hcv.offsetHeight; }
    resizeHero();
    window.addEventListener("resize", resizeHero);

    const N = 220, SR = 178, G = Math.PI * (1 + Math.sqrt(5)), pts = [];
    for (let i = 0; i < N; i++) {
      const th = Math.acos(1 - 2 * (i + 0.5) / N), ph = G * i;
      const x = Math.sin(th) * Math.cos(ph), y = Math.sin(th) * Math.sin(ph), z = Math.cos(th);
      let t = "safe";
      if (i < 22) t = "danger"; else if (i < 66) t = "warn";
      pts.push({
        ox: x, oy: y, oz: z, x, y, z, type: t,
        ft: Math.random() * Math.PI * 2,
        esc: false, eDist: 0,
        eDir: { x: Math.random() - 0.5, y: Math.random() - 0.5, z: Math.random() - 0.5 },
        cat: false, ct: 0,
        sz: t === "danger" ? 3.4 : t === "warn" ? 2.7 : 2.1
      });
    }
    const CONN = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = pts[i].ox - pts[j].ox, dy = pts[i].oy - pts[j].oy, dz = pts[i].oz - pts[j].oz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < 0.28) CONN.push([i, j, d]);
    }
    const escs = pts.filter(p => p.type === "danger");
    let eQ = [...escs], aE = [];
    setInterval(() => {
      if (!eQ.length) eQ = [...escs];
      const p = eQ.splice(Math.floor(Math.random() * eQ.length), 1)[0];
      p.esc = true; p.eDist = 0; p.cat = false; p.ct = 0; aE.push(p);
    }, 900);

    const mi = { x: 0, y: 0 };
    document.addEventListener("mousemove", (e) => {
      mi.x = (e.clientX / window.innerWidth - 0.5) * 0.4;
      mi.y = (e.clientY / window.innerHeight - 0.5) * 0.3;
    });

    function rot3(x, y, z, rx, ry) {
      let nx = x * Math.cos(ry) - z * Math.sin(ry);
      let nz = x * Math.sin(ry) + z * Math.cos(ry);
      let ny = y * Math.cos(rx) - nz * Math.sin(rx);
      nz = y * Math.sin(rx) + nz * Math.cos(rx);
      return [nx, ny, nz];
    }
    function proj(x, y, z, cx, cy) {
      const f = 500, zo = 4, sc = f / (f + z * SR * 0.5 + SR * zo);
      return [x * SR * sc + cx, y * SR * sc + cy, sc];
    }
    let ht = 0, rY = 0, rX = 0.25;
    function drawHero() {
      const W = hcv.width, H = hcv.height, CX = W * 0.62, CY = H * 0.5;
      hctx.clearRect(0, 0, W, H);
      ht += 0.008; rY = ht + mi.x; rX = 0.25 + mi.y;
      const cg = hctx.createRadialGradient(CX, CY, 0, CX, CY, 75);
      cg.addColorStop(0, "rgba(168,85,247,0.16)"); cg.addColorStop(1, "rgba(168,85,247,0)");
      hctx.beginPath(); hctx.arc(CX, CY, 75, 0, Math.PI * 2); hctx.fillStyle = cg; hctx.fill();

      const pp = pts.map(p => {
        let px = p.ox, py = p.oy, pz = p.oz;
        if (p.esc) {
          p.eDist += 0.018;
          px = p.ox + p.eDir.x * p.eDist * 1.8; py = p.oy + p.eDir.y * p.eDist * 1.8; pz = p.oz + p.eDir.z * p.eDist * 1.8;
          if (p.eDist > 0.9) { p.cat = true; p.esc = false; }
        } else if (p.cat) {
          p.ct += 0.03;
          const e = 1 - Math.pow(1 - Math.min(p.ct, 1), 3);
          const fx = p.ox + p.eDir.x * 1.62, fy = p.oy + p.eDir.y * 1.62, fz = p.oz + p.eDir.z * 1.62;
          px = fx + (p.ox - fx) * e; py = fy + (p.oy - fy) * e; pz = fz + (p.oz - fz) * e;
          if (p.ct >= 1) { p.cat = false; aE = aE.filter(x => x !== p); }
        }
        p.x = px; p.y = py; p.z = pz;
        const [a, b, c] = rot3(px, py, pz, rX, rY);
        return proj(a, b, c, CX, CY);
      });

      CONN.forEach(([i, j, d]) => {
        if (pts[i].type === "danger" || pts[j].type === "danger") return;
        const [ax, ay, as_] = pp[i], [bx, by, bs] = pp[j];
        if (as_ < 0.3 || bs < 0.3) return;
        hctx.beginPath(); hctx.moveTo(ax, ay); hctx.lineTo(bx, by);
        hctx.strokeStyle = `rgba(91,141,255,${((1 - d / 0.28) * 0.11 * Math.min(as_, bs)).toFixed(3)})`;
        hctx.lineWidth = 0.5; hctx.stroke();
      });

      aE.forEach(p => {
        if (!p.cat && !p.esc) return;
        const pi = pts.indexOf(p);
        const [px_, py_] = pp[pi];
        const al = p.esc ? p.eDist * 0.7 : (1 - p.ct) * 0.7;
        const gr = hctx.createLinearGradient(CX, CY, px_, py_);
        gr.addColorStop(0, `rgba(0,255,200,${al * 0.6})`);
        gr.addColorStop(0.7, `rgba(91,141,255,${al * 0.4})`);
        gr.addColorStop(1, `rgba(255,61,87,${al * 0.8})`);
        hctx.beginPath(); hctx.moveTo(CX, CY); hctx.lineTo(px_, py_);
        hctx.strokeStyle = gr; hctx.lineWidth = 1.5; hctx.stroke();
      });

      const or_ = 21 + Math.sin(ht * 2) * 2;
      const og = hctx.createRadialGradient(CX, CY, 0, CX, CY, or_);
      og.addColorStop(0, "rgba(255,255,255,0.93)"); og.addColorStop(0.3, "rgba(168,85,247,0.88)");
      og.addColorStop(0.7, "rgba(91,141,255,0.55)"); og.addColorStop(1, "rgba(91,141,255,0)");
      hctx.beginPath(); hctx.arc(CX, CY, or_, 0, Math.PI * 2); hctx.fillStyle = og; hctx.fill();

      pp.map((p, i) => ({ p, i })).sort((a, b) => a.p[2] - b.p[2]).forEach(({ p: s, i }) => {
        const [sx, sy, sc] = s;
        if (sx < -100 || sx > W + 100 || sy < -100 || sy > H + 100) return;
        const pt = pts[i], sz = pt.sz * sc * 1.2;
        pt.ft += 0.04;
        const fl = 0.6 + Math.sin(pt.ft) * 0.4;
        let col, gl;
        if (pt.type === "danger") { col = `rgba(255,61,87,${(0.5 + sc * 0.5) * fl})`; gl = "rgba(255,61,87,0.4)"; }
        else if (pt.type === "warn") { col = `rgba(255,184,0,${(0.4 + sc * 0.4) * fl})`; gl = "rgba(255,184,0,0.3)"; }
        else { col = `rgba(0,255,200,${(0.3 + sc * 0.5) * fl})`; gl = "rgba(0,255,200,0.2)"; }
        if (pt.type === "danger" && sz > 2) {
          const gg = hctx.createRadialGradient(sx, sy, 0, sx, sy, sz * 3);
          gg.addColorStop(0, gl); gg.addColorStop(1, "transparent");
          hctx.beginPath(); hctx.arc(sx, sy, sz * 3, 0, Math.PI * 2); hctx.fillStyle = gg; hctx.fill();
        }
        hctx.beginPath(); hctx.arc(sx, sy, Math.max(0.4, sz), 0, Math.PI * 2); hctx.fillStyle = col; hctx.fill();
      });
      requestAnimationFrame(drawHero);
    }
    drawHero();
  }

  /* ── Neural network canvas ─────────────────────────────── */
  const ncv = document.getElementById("nn-canvas");
  if (ncv) {
    const nctx = ncv.getContext("2d");
    function resizeNN() {
      ncv.width = ncv.offsetWidth * devicePixelRatio;
      ncv.height = ncv.offsetHeight * devicePixelRatio;
      nctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    }
    resizeNN();
    window.addEventListener("resize", resizeNN);

    const LAYERS = [
      { n: 5, l: "INPUT", c: "#5b8dff" },
      { n: 8, l: "DENSE 1", c: "#a855f7" },
      { n: 6, l: "DENSE 2", c: "#a855f7" },
      { n: 4, l: "DENSE 3", c: "#a855f7" },
      { n: 1, l: "OUTPUT", c: "#00ffc8" }
    ];
    function getLayout() {
      const W = ncv.offsetWidth, H = ncv.offsetHeight, px = 44, py = 44;
      const uw = W - px * 2, uh = H - py * 2, gx = uw / (LAYERS.length - 1);
      return LAYERS.map((l, li) => {
        const x = px + li * gx, gy = uh / (l.n + 1);
        const ns = Array.from({ length: l.n }, (_, ni) => ({ x, y: py + (ni + 1) * gy }));
        return { ...l, x, neurons: ns };
      });
    }
    const sigs = [];
    setInterval(() => {
      const ly = getLayout(), li = Math.floor(Math.random() * (LAYERS.length - 1));
      const fn = ly[li].neurons[Math.floor(Math.random() * ly[li].neurons.length)];
      const tn = ly[li + 1].neurons[Math.floor(Math.random() * ly[li + 1].neurons.length)];
      sigs.push({ fx: fn.x, fy: fn.y, tx: tn.x, ty: tn.y, t: 0, sp: 0.02 + Math.random() * 0.02, c: ly[li].c });
    }, 180);

    function drawNN() {
      const W = ncv.offsetWidth, H = ncv.offsetHeight;
      nctx.clearRect(0, 0, W, H);
      const ly = getLayout();
      ly.forEach((l, li) => {
        if (li === LAYERS.length - 1) return;
        const nl = ly[li + 1];
        l.neurons.forEach(f => nl.neurons.forEach(t => {
          nctx.beginPath(); nctx.moveTo(f.x, f.y); nctx.lineTo(t.x, t.y);
          nctx.strokeStyle = "rgba(91,141,255,0.05)"; nctx.lineWidth = 0.5; nctx.stroke();
        }));
      });
      for (let i = sigs.length - 1; i >= 0; i--) {
        const s = sigs[i]; s.t += s.sp;
        if (s.t > 1) { sigs.splice(i, 1); continue; }
        const x = s.fx + (s.tx - s.fx) * s.t, y = s.fy + (s.ty - s.fy) * s.t;
        const al = Math.sin(s.t * Math.PI);
        nctx.beginPath(); nctx.arc(x, y, 3.2, 0, Math.PI * 2);
        nctx.fillStyle = s.c + Math.floor(al * 255).toString(16).padStart(2, "0"); nctx.fill();
        const g = nctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, s.c + "40"); g.addColorStop(1, "transparent");
        nctx.beginPath(); nctx.arc(x, y, 9, 0, Math.PI * 2); nctx.fillStyle = g; nctx.fill();
      }
      ly.forEach((l, li) => {
        l.neurons.forEach(n => {
          const r = li === LAYERS.length - 1 ? 9 : 6;
          nctx.beginPath(); nctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          nctx.fillStyle = "rgba(7,11,28,0.9)"; nctx.fill();
          nctx.strokeStyle = l.c; nctx.lineWidth = 1.5; nctx.stroke();
          const g = nctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 3);
          g.addColorStop(0, l.c + "28"); g.addColorStop(1, "transparent");
          nctx.beginPath(); nctx.arc(n.x, n.y, r * 3, 0, Math.PI * 2); nctx.fillStyle = g; nctx.fill();
        });
        nctx.fillStyle = "rgba(123,130,168,0.65)";
        nctx.font = '9px "DM Mono",monospace'; nctx.textAlign = "center";
        nctx.fillText(l.l, l.x, H - 13);
      });
      requestAnimationFrame(drawNN);
    }
    drawNN();
  }

  /* ── Industry card mini-spheres ────────────────────────── */
  function makeSphere(id, pc, ac) {
    const cv = document.getElementById(id);
    if (!cv) return;
    const ctx = cv.getContext("2d");
    cv.width = 140; cv.height = 140;
    const N = 70, SR = 50, G = Math.PI * (1 + Math.sqrt(5)), pts = [];
    for (let i = 0; i < N; i++) {
      const th = Math.acos(1 - 2 * (i + 0.5) / N), ph = G * i;
      pts.push({
        ox: Math.sin(th) * Math.cos(ph), oy: Math.sin(th) * Math.sin(ph), oz: Math.cos(th),
        type: i < 10 ? "danger" : "safe",
        ft: Math.random() * Math.PI * 2,
        sz: i < 10 ? 2.4 : 1.5
      });
    }
    const CONN = [];
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      const dx = pts[i].ox - pts[j].ox, dy = pts[i].oy - pts[j].oy, dz = pts[i].oz - pts[j].oz;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.42) CONN.push([i, j]);
    }
    let t = 0;
    function draw() {
      ctx.clearRect(0, 0, 140, 140);
      t += 0.013;
      const CX = 70, CY = 70;
      const pp = pts.map(p => {
        const ry = t, rx = 0.28;
        const nx = p.ox * Math.cos(ry) - p.oz * Math.sin(ry);
        const nz2 = p.ox * Math.sin(ry) + p.oz * Math.cos(ry);
        const ny = p.oy * Math.cos(rx) - nz2 * Math.sin(rx);
        const nz = p.oy * Math.sin(rx) + nz2 * Math.cos(rx);
        const f = 300, zo = 3, sc = f / (f + nz * SR * 0.5 + SR * zo);
        return [nx * SR * sc + CX, ny * SR * sc + CY, sc];
      });
      CONN.forEach(([i, j]) => {
        if (pts[i].type === "danger" || pts[j].type === "danger") return;
        const [ax, ay] = pp[i], [bx, by] = pp[j];
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
        ctx.strokeStyle = pc + "20"; ctx.lineWidth = 0.5; ctx.stroke();
      });
      pp.forEach(([sx, sy, sc], i) => {
        const p = pts[i], sz = p.sz * sc * 1.3;
        p.ft += 0.04;
        const fl = 0.6 + Math.sin(p.ft) * 0.4;
        const col = p.type === "danger"
          ? `rgba(255,61,87,${(0.5 + sc * 0.4) * fl})`
          : `${pc}${Math.floor((0.3 + sc * 0.4) * fl * 255).toString(16).padStart(2, "0")}`;
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.3, sz), 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      });
      const or_ = 9 + Math.sin(t * 2) * 1.2;
      const og = ctx.createRadialGradient(CX, CY, 0, CX, CY, or_);
      og.addColorStop(0, "rgba(255,255,255,0.9)"); og.addColorStop(0.35, ac + "cc"); og.addColorStop(1, ac + "00");
      ctx.beginPath(); ctx.arc(CX, CY, or_, 0, Math.PI * 2); ctx.fillStyle = og; ctx.fill();
      requestAnimationFrame(draw);
    }
    draw();
  }
  makeSphere("cv-tel", "#5b8dff", "#a855f7");
  makeSphere("cv-bank", "#00ffc8", "#5b8dff");

  /* ── Scroll reveal for how-it-works steps ──────────────── */
  const steps = document.querySelectorAll(".step");
  const obs = new IntersectionObserver(entries => {
    entries.forEach(x => { if (x.isIntersecting) x.target.classList.add("vis"); });
  }, { threshold: 0.2 });
  steps.forEach(s => obs.observe(s));
})();
