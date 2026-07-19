/* ═══════════════════════════════════════════════════════════
   ChurnShield — app.js
   SPA router · industry select · CSV upload · FastAPI call ·
   full intelligence dashboard (KPIs, customers, analytics,
   retention plans) with Plotly charts.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ═══════════ STATE ═══════════ */
  const state = {
    stage: "landing",       // landing | select | loading | dashboard
    industry: null,          // telecom | bank
    file: null,
    results: null,
    nav: "dashboard",        // dashboard | customers | analytics | retention
    selectedCustomer: null,
    riskFilter: "ALL",
    isDemo: false
  };

  const API_KEY = "churnshield_api_url";
  function apiUrl() { return localStorage.getItem(API_KEY) || "http://localhost:8000"; }

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  /* ═══════════ HELPERS ═══════════ */
  const INITIALS = ["AK","BR","CS","DM","EL","FN","GR","HT","IV","JW","KP","LO","MN",
    "NS","OQ","PU","QR","RS","TY","UA","VB","WC","XD","YE","ZF","AG","BH","CI","DJ","EK"];
  const initials = (idx) => INITIALS[idx % INITIALS.length];

  function palette(rl, probPct, isBank) {
    if (rl === "HIGH" && probPct >= 80) return ["#ff3d57", "rgba(255,61,87,0.09)"];
    if (rl === "HIGH") return ["#ff7c3e", "rgba(255,124,62,0.09)"];
    if (rl === "MEDIUM") return ["#ffb800", "rgba(255,184,0,0.09)"];
    return isBank ? ["#00ffc8", "rgba(0,255,200,0.07)"] : ["#5b8dff", "rgba(91,141,255,0.07)"];
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function setIndustryTheme(isBank) {
    const root = document.documentElement.style;
    if (isBank) {
      root.setProperty("--pc", "#00ffc8");
      root.setProperty("--pc-soft", "rgba(0,255,200,0.08)");
      root.setProperty("--pc-border", "rgba(0,255,200,0.22)");
    } else {
      root.setProperty("--pc", "#5b8dff");
      root.setProperty("--pc-soft", "rgba(91,141,255,0.09)");
      root.setProperty("--pc-border", "rgba(91,141,255,0.22)");
    }
  }

  /* ═══════════ ROUTER ═══════════ */
  function goto(stage) {
    state.stage = stage;
    $$(".view").forEach(v => v.classList.remove("active"));
    $("#view-" + stage).classList.add("active");
    window.scrollTo({ top: 0 });
    if (stage === "loading") runLoading();
    if (stage === "dashboard") renderDashboard();
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-goto]");
    if (t) goto(t.dataset.goto);
  });

  /* ═══════════ SELECT VIEW ═══════════ */
  function selectIndustry(ind) {
    state.industry = ind;
    const isBank = ind === "bank";
    setIndustryTheme(isBank);
    $("#card-telecom").classList.toggle("sel", !isBank);
    $("#card-bank").classList.toggle("sel", isBank);
    $("#card-telecom .sel-badge").hidden = isBank;
    $("#card-bank .sel-badge").hidden = !isBank;
    $("#upload-section").hidden = false;
    $("#select-nav-row").hidden = true;
    $("#selected-banner").innerHTML =
      `✓ &nbsp;${isBank ? "🏦 Banking / Finance" : "📡 Telecommunications"} selected — upload your CSV below, or try the demo.`;
    $("#upload-section").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  $("#card-telecom").addEventListener("click", () => selectIndustry("telecom"));
  $("#card-bank").addEventListener("click", () => selectIndustry("bank"));
  [["card-telecom", "telecom"], ["card-bank", "bank"]].forEach(([id, ind]) => {
    document.getElementById(id).addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectIndustry(ind); }
    });
  });

  /* ── CSV upload + preview ── */
  const dropzone = $("#dropzone");
  const fileInput = $("#file-input");
  dropzone.addEventListener("click", () => fileInput.click());
  dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault(); dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files.length) handleFile(fileInput.files[0]); });

  // Minimal CSV row parser (handles quoted fields)
  function parseCsvLine(line) {
    const out = []; let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; }
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function handleFile(file) {
    if (!file.name.toLowerCase().endsWith(".csv")) { alert("Please upload a .csv file."); return; }
    if (file.size > 20 * 1024 * 1024) { alert("File exceeds 20 MB."); return; }
    state.file = file;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result);
      const lines = text.split(/\r?\n/).filter(l => l.trim().length);
      const header = parseCsvLine(lines[0] || "");
      const rows = lines.slice(1, 5).map(parseCsvLine);
      $("#fp-meta").textContent = `✓ ${file.name} — ${(lines.length - 1).toLocaleString()} rows × ${header.length} columns · ${(file.size / 1024).toFixed(1)} KB`;
      const maxCols = Math.min(header.length, 14);
      let html = "<thead><tr>" + header.slice(0, maxCols).map(h => `<th>${esc(h)}</th>`).join("") +
        (header.length > maxCols ? "<th>…</th>" : "") + "</tr></thead><tbody>";
      rows.forEach(r => {
        html += "<tr>" + r.slice(0, maxCols).map(c => `<td>${esc(c)}</td>`).join("") +
          (header.length > maxCols ? "<td>…</td>" : "") + "</tr>";
      });
      $("#fp-table").innerHTML = html + "</tbody>";
      $("#file-preview").hidden = false;
      $("#btn-run").disabled = false;
    };
    reader.readAsText(file.slice(0, 512 * 1024)); // preview from first 512 KB
  }

  $("#btn-run").addEventListener("click", () => {
    if (!state.file || !state.industry) return;
    state.isDemo = false;
    goto("loading");
  });
  $("#btn-demo").addEventListener("click", () => {
    if (!state.industry) return;
    state.isDemo = true;
    goto("loading");
  });

  /* ── API config modal ── */
  const apiModal = $("#api-modal");
  function refreshApiLabel() { $("#api-url-label").textContent = apiUrl(); }
  refreshApiLabel();
  $("#btn-api-config").addEventListener("click", () => {
    $("#api-url-input").value = apiUrl();
    apiModal.showModal();
  });
  apiModal.addEventListener("close", () => {
    if (apiModal.returnValue === "save") {
      const v = $("#api-url-input").value.trim().replace(/\/+$/, "");
      if (v) localStorage.setItem(API_KEY, v);
      refreshApiLabel();
    }
  });

  /* ═══════════ LOADING VIEW ═══════════ */
  const LOAD_STEPS = [
    [0.05, "$", "Initializing ChurnShield ANN for {IND}..."],
    [0.12, "·", "Reading CSV and validating column schema..."],
    [0.20, "✓", "Schema validated — 0 critical errors."],
    [0.28, "·", "Cleaning: TotalCharges, nulls, coercion..."],
    [0.36, "✓", "Encoding complete — get_dummies applied."],
    [0.44, "·", "Normalizing features with MinMaxScaler..."],
    [0.52, "✓", "Feature engineering done."],
    [0.60, "·", "ANN: Dense(64)→Dense(32)→Dense(16)→Sigmoid..."],
    [0.70, "·", "Training: epochs=100, batch_size=100, EarlyStopping..."],
    [0.80, "✓", "Training complete — AUC computed."],
    [0.87, "·", "Computing feature importances..."],
    [0.92, "·", "Generating customer predictions..."],
    [0.96, "·", "Building customer cards & retention playbooks..."],
    [1.00, "✓", "Complete — loading intelligence dashboard."]
  ];

  async function runLoading() {
    const ind = state.industry || "telecom";
    const isBank = ind === "bank";
    $("#loading-icon").textContent = isBank ? "🏦" : "📡";
    $("#terminal-body").innerHTML = "";
    $("#progress-fill").style.width = "0%";
    $("#loading-error").hidden = true;

    const body = $("#terminal-body");
    const cursorSpan = document.createElement("span");
    cursorSpan.className = "tcursor";
    cursorSpan.textContent = "▌";

    // Fire API request in parallel with the terminal animation
    const apiPromise = state.isDemo ? demoPromise(ind) : callPredict(ind);

    for (const [prog, kind, msg] of LOAD_STEPS) {
      await sleep(180);
      const line = document.createElement("div");
      line.className = "tline " + (kind === "✓" ? "ok" : kind === "$" ? "cmd" : "info");
      line.textContent = `${kind} ${msg.replace("{IND}", ind[0].toUpperCase() + ind.slice(1))}`;
      body.appendChild(line);
      body.appendChild(cursorSpan);
      body.scrollTop = body.scrollHeight;
      $("#progress-fill").style.width = (prog * 100) + "%";
    }

    try {
      const results = await apiPromise;
      state.results = results;
      await sleep(300);
      goto("dashboard");
    } catch (err) {
      showLoadingError(err);
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function demoPromise(ind) { return sleep(600).then(() => window.ChurnDemo.generate(ind)); }

  async function callPredict(ind) {
    const fd = new FormData();
    fd.append("file", state.file, state.file.name);
    fd.append("industry", ind);
    let res;
    try {
      res = await fetch(apiUrl() + "/predict", { method: "POST", body: fd });
    } catch (e) {
      const err = new Error("connection");
      err.isConnection = true;
      throw err;
    }
    if (!res.ok) {
      let detail = "Unknown error";
      try { detail = (await res.json()).detail || detail; } catch (_) {}
      const err = new Error(`API Error ${res.status}: ${detail}`);
      throw err;
    }
    return res.json();
  }

  function showLoadingError(err) {
    const box = $("#loading-error");
    box.hidden = false;
    if (err.isConnection) {
      box.innerHTML = `❌ <strong>Cannot connect to the FastAPI backend</strong> at <code>${esc(apiUrl())}</code>.<br><br>
        Start it with: <code>uvicorn main:app --reload --port 8000</code><br>
        (If your API runs elsewhere, change the endpoint on the upload page.)<br>
        <button class="btn-ghost" id="err-back">← Back</button>
        <button class="btn-ghost" id="err-demo">▶ Continue with demo data instead</button>`;
      $("#err-demo").addEventListener("click", () => {
        state.isDemo = true;
        state.results = window.ChurnDemo.generate(state.industry || "telecom");
        goto("dashboard");
      });
    } else {
      box.innerHTML = `❌ ${esc(err.message)}<br><button class="btn-ghost" id="err-back">← Back to upload</button>`;
    }
    $("#err-back").addEventListener("click", () => goto("select"));
  }

  /* ═══════════ DASHBOARD ═══════════ */
  const PLOTLY_CFG = { displayModeBar: false, responsive: true };

  function renderDashboard() {
    const R = state.results;
    if (!R) { goto("landing"); return; }
    const M = R.metrics, SEG = R.segment_summary, IND = R.industry;
    const isBank = IND === "bank";
    setIndustryTheme(isBank);

    $("#tb-sub").textContent = `${M.total_samples.toLocaleString()} customers · ${IND[0].toUpperCase() + IND.slice(1)}`;
    $("#tb-industry").textContent = `${isBank ? "🏦" : "📡"} ${IND.toUpperCase()}`;
    $("#tb-model").textContent = `🧠 ${M.model_type || "ANN"}`;
    $("#sb-model-name").textContent = M.model_type || "ANN (3 Dense Layers)";
    $("#sb-badge-high").textContent = SEG.high_risk.toLocaleString();

    // demo banner
    document.querySelectorAll(".demo-banner").forEach(b => b.remove());
    if (R.demo) {
      const b = document.createElement("div");
      b.className = "demo-banner";
      b.textContent = "⚡ DEMO MODE — showing simulated predictions. Connect the FastAPI backend for real results.";
      document.body.appendChild(b);
    }

    setNav(state.nav || "dashboard");
  }

  /* sidebar nav */
  $$(".sb-item[data-nav]").forEach(btn => btn.addEventListener("click", () => setNav(btn.dataset.nav)));
  $("#btn-new-dataset").addEventListener("click", () => {
    state.results = null; state.file = null; state.industry = null;
    state.selectedCustomer = null; state.nav = "dashboard"; state.isDemo = false;
    document.querySelectorAll(".demo-banner").forEach(b => b.remove());
    $("#btn-run").disabled = true;
    $("#file-preview").hidden = true;
    $("#upload-section").hidden = true;
    $("#select-nav-row").hidden = false;
    $("#card-telecom").classList.remove("sel");
    $("#card-bank").classList.remove("sel");
    $$(".sel-badge").forEach(b => b.hidden = true);
    goto("landing");
  });

  function setNav(nav) {
    state.nav = nav;
    $$(".sb-item[data-nav]").forEach(b => b.classList.toggle("active", b.dataset.nav === nav));
    $$(".subview").forEach(s => s.classList.remove("active"));
    $("#sub-" + nav).classList.add("active");
    const R = state.results;
    if (!R) return;
    const isBank = R.industry === "bank";
    const pc = isBank ? "#00ffc8" : "#5b8dff";
    if (nav === "dashboard") renderSubDashboard(R, isBank, pc);
    if (nav === "customers") renderSubCustomers(R, isBank, pc);
    if (nav === "analytics") renderSubAnalytics(R, isBank, pc);
    if (nav === "retention") renderSubRetention(R, isBank, pc);
  }

  /* ── SUBVIEW: overview dashboard ── */
  function kpiCard(val, label, color, extra) {
    return `<div class="kpi" style="border-top-color:${color}">
      <div class="kpi-lbl">${label}</div>
      <div class="kpi-val" style="color:${color}">${val}</div>
      ${extra ? `<div class="kpi-sub">${extra}</div>` : ""}
    </div>`;
  }
  function barRow(name, pct, val, color) {
    return `<div class="bar-row">
      <div class="bar-name" title="${esc(name)}">${esc(name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-val">${val}</div>
    </div>`;
  }

  function renderSubDashboard(R, isBank, pc) {
    const M = R.metrics, SEG = R.segment_summary, FI = R.feature_importances, P = R.predictions;

    $("#kpi-row").innerHTML =
      kpiCard((M.accuracy * 100).toFixed(1) + "%", "Model Accuracy", pc, "ANN Classifier") +
      kpiCard((M.roc_auc * 100).toFixed(1) + "%", "ROC AUC", "#5b8dff", "Discrimination") +
      kpiCard(SEG.high_risk.toLocaleString(), "High Risk", "#ff3d57", "Customers flagged") +
      kpiCard((M.churn_rate * 100).toFixed(1) + "%", "Churn Rate", "#ffb800", "Dataset rate") +
      kpiCard((SEG.avg_churn_prob * 100).toFixed(1) + "%", "Avg Churn", "#fb923c", "All customers");

    const fiMax = FI.length && FI[0][1] > 0 ? FI[0][1] : 1;
    $("#panel-fi").innerHTML = FI.slice(0, 6).map(f =>
      barRow(f[0].slice(0, 18), Math.min(100, f[1] / fiMax * 100), (f[1] * 100).toFixed(1) + "%", pc)
    ).join("");

    const segRows = [
      ["High Risk ≥70%", SEG.high_risk, "#ff3d57"],
      ["Medium 40–70%", SEG.medium_risk, "#ffb800"],
      ["Low Risk <40%", SEG.low_risk, pc]
    ];
    $("#panel-seg").innerHTML = segRows.map(([lbl, v, c]) =>
      `<div class="seg-row"><span class="seg-lbl">${lbl}</span>
        <div><span class="seg-val" style="color:${c}">${v.toLocaleString()}</span>
        <span class="seg-pct">${(v / M.total_samples * 100).toFixed(1)}%</span></div></div>`
    ).join("") +
      `<div class="seg-row"><span class="seg-lbl">Avg Churn Prob</span>
       <span class="seg-val" style="color:#e8eaf6">${(SEG.avg_churn_prob * 100).toFixed(1)}%</span></div>`;

    $("#panel-perf").innerHTML = [
      ["Accuracy", M.accuracy], ["Precision", M.precision], ["Recall", M.recall],
      ["F1 Score", M.f1_score], ["ROC AUC", M.roc_auc]
    ].map(([nm, v]) => barRow(nm, v * 100, (v * 100).toFixed(1) + "%", "#a855f7")).join("");

    // top-6 high risk mini cards
    const top6 = [...P].sort((a, b) => b.churn_probability - a.churn_probability).slice(0, 6);
    $("#top-customers").innerHTML = top6.map(p => miniCard(p, isBank)).join("");
    $("#top-customers").querySelectorAll(".mc").forEach((el, i) => {
      el.addEventListener("click", () => {
        state.selectedCustomer = top6[i];
        setNav("customers");
        setTimeout(() => $("#cust-detail").scrollIntoView({ behavior: "smooth" }), 100);
      });
    });
  }

  function miniCard(p, isBank, withDriver) {
    const pp = p.churn_probability * 100;
    const [cc, ccd] = palette(p.risk_level, pp, isBank);
    return `<div class="mc" style="border-top:2px solid ${cc}" data-idx="${p.index}">
      <div class="mc-avatar" style="background:${ccd};color:${cc}">${initials(p.index)}
        ${p.risk_level === "HIGH" ? '<div class="ring"></div>' : ""}</div>
      <div class="mc-id">#${p.index + 1}</div>
      <div class="mc-prob" style="color:${cc}">${withDriver ? pp.toFixed(1) : pp.toFixed(0)}%</div>
      <div class="mc-risk" style="color:${cc};background:${ccd}">${p.risk_level}</div>
      ${withDriver ? `<div class="mc-driver">${esc(p.top_drivers[0] || "")}</div>` : ""}
    </div>`;
  }

  /* ── SUBVIEW: customers ── */
  $("#risk-filter").addEventListener("change", (e) => {
    state.riskFilter = e.target.value;
    const R = state.results;
    if (R) renderSubCustomers(R, R.industry === "bank", R.industry === "bank" ? "#00ffc8" : "#5b8dff");
  });

  function renderSubCustomers(R, isBank, pc) {
    let sp = [...R.predictions].sort((a, b) => b.churn_probability - a.churn_probability);
    if (state.riskFilter !== "ALL") sp = sp.filter(p => p.risk_level === state.riskFilter);
    $("#cust-count").textContent = `${sp.length.toLocaleString()} customers`;
    const show = sp.slice(0, 60);
    $("#cust-grid").innerHTML = show.map(p => miniCard(p, isBank, true)).join("");
    $("#cust-grid").querySelectorAll(".mc").forEach((el, i) => {
      el.addEventListener("click", () => {
        state.selectedCustomer = show[i];
        renderCustomerDetail(R, isBank);
        $("#cust-detail").scrollIntoView({ behavior: "smooth" });
      });
    });
    renderCustomerDetail(R, isBank);
  }

  function renderCustomerDetail(R, isBank) {
    const box = $("#cust-detail");
    const p = state.selectedCustomer;
    if (!p) { box.hidden = true; box.innerHTML = ""; return; }
    const IND = R.industry;
    const pp = p.churn_probability * 100;
    const [cc, ccd] = palette(p.risk_level, pp, isBank);
    const acts = customerActions(p, isBank, cc);

    const drivers = (p.top_drivers || []).map((d, i) => {
      const s = (p.driver_scores || [])[i] || 0;
      return `<div class="drv">
        <div class="drv-top"><span>${esc(d)}</span><span style="color:${cc}">${s.toFixed(3)}</span></div>
        <div class="drv-track"><div class="drv-fill" style="width:${Math.min(100, s * 700).toFixed(0)}%;background:${cc}"></div></div>
      </div>`;
    }).join("");

    const actions = acts.map((a, i) => `
      <div class="action" style="border-left-color:${a.color}">
        <div class="action-type" style="color:${a.color}">ACTION ${String(i + 1).padStart(2, "0")} · ${a.type}</div>
        <div class="action-title">${a.title}</div>
        <div class="action-body">${a.body}</div>
        <div class="action-tags">${a.tags.map(t =>
          `<span class="atag" style="background:${a.color}18;color:${a.color};border-color:${a.color}33">${t}</span>`).join("")}</div>
      </div>`).join("");

    box.hidden = false;
    box.innerHTML = `<div class="detail-card">
      <div class="detail-head">
        <div class="detail-title">👤 Customer #${p.index + 1} — Full Detail &amp; Retention Plan</div>
        <button class="detail-close" id="btn-close-detail">✕ Close</button>
      </div>
      <div class="detail-grid">
        <div class="dprofile">
          <div class="dp-head">
            <div class="dp-avatar" style="background:${ccd};color:${cc}">${initials(p.index)}</div>
            <div>
              <div class="dp-name">Customer #${p.index + 1}</div>
              <div class="dp-sub">${IND[0].toUpperCase() + IND.slice(1)} · Index ${p.index}</div>
              <div class="dp-risk" style="color:${cc};background:${ccd}">${p.risk_level} RISK</div>
            </div>
            <div class="dp-prob-box">
              <div class="dp-prob" style="color:${cc}">${pp.toFixed(0)}%</div>
              <div class="dp-prob-lbl">Churn Prob</div>
            </div>
          </div>
          <div class="drv-lbl">Top Churn Drivers</div>
          ${drivers}
          <div class="prob-box">
            <div class="prob-box-lbl">Churn Probability</div>
            <div class="prob-box-val">${pp.toFixed(2)}%</div>
            <div class="prob-box-track"><div class="prob-box-fill" style="width:${pp.toFixed(0)}%;background:linear-gradient(90deg,${cc},${cc}88)"></div></div>
          </div>
          <div class="prob-box">
            <div class="prob-box-lbl">Next Best Action (model)</div>
            <div class="action-body">${esc(p.next_best_action || "—")}</div>
          </div>
        </div>
        <div>
          <div class="drv-lbl">🎯 Personalized Retention Plan — ${acts.length} Actions</div>
          ${actions}
        </div>
      </div>
    </div>`;
    $("#btn-close-detail").addEventListener("click", () => {
      state.selectedCustomer = null;
      box.hidden = true; box.innerHTML = "";
    });
  }

  /* ── SUBVIEW: analytics (Plotly) ── */
  function renderSubAnalytics(R, isBank, pc) {
    const M = R.metrics, FI = R.feature_importances, P = R.predictions;

    // Gauges
    const gauges = [
      ["gauge-acc", M.accuracy, "Accuracy"],
      ["gauge-prec", M.precision, "Precision"],
      ["gauge-rec", M.recall, "Recall"],
      ["gauge-f1", M.f1_score, "F1 Score"]
    ];
    gauges.forEach(([id, v, title]) => {
      const col = v >= 0.85 ? pc : v >= 0.75 ? "#ffb800" : "#ff3d57";
      const rgb = pc === "#00ffc8" ? "0,255,200" : "91,141,255";
      Plotly.newPlot(id, [{
        type: "indicator", mode: "gauge+number", value: +(v * 100).toFixed(1),
        number: { suffix: "%", font: { size: 18, color: "#e8eaf6", family: "DM Mono" } },
        title: { text: title, font: { size: 11, color: "#7b82a8" } },
        gauge: {
          axis: { range: [0, 100], tickfont: { size: 8, color: "#7b82a8" }, tickcolor: "rgba(255,255,255,0.06)" },
          bar: { color: col, thickness: 0.28 },
          bgcolor: "rgba(255,255,255,0.02)", borderwidth: 1, bordercolor: "rgba(255,255,255,0.06)",
          steps: [
            { range: [0, 75], color: "rgba(255,61,87,0.04)" },
            { range: [75, 85], color: "rgba(255,184,0,0.04)" },
            { range: [85, 100], color: `rgba(${rgb},0.06)` }
          ]
        }
      }], {
        height: 180, margin: { l: 14, r: 14, t: 36, b: 10 },
        paper_bgcolor: "rgba(0,0,0,0)", font: { color: "#e8eaf6" }
      }, PLOTLY_CFG);
    });

    // Confusion matrix
    const cm = M.confusion_matrix;
    const midRgb = isBank ? "0,255,200" : "91,141,255";
    Plotly.newPlot("chart-cm", [{
      type: "heatmap", z: cm,
      x: ["Stayed", "Churned"], y: ["Stayed", "Churned"],
      text: cm.map(r => r.map(String)), texttemplate: "%{text}",
      textfont: { size: 20, color: "#e8eaf6" },
      colorscale: [[0, "rgba(7,11,28,0.9)"], [0.5, `rgba(${midRgb},0.27)`], [1, pc]],
      showscale: false
    }], {
      title: { text: "Confusion Matrix", font: { size: 13, color: "#7b82a8" }, x: 0.5 },
      height: 300, margin: { l: 70, r: 24, t: 44, b: 50 },
      xaxis: { title: "Predicted", color: "#8890b0" },
      yaxis: { title: "Actual", color: "#8890b0" },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: "#e8eaf6" }
    }, PLOTLY_CFG);

    // Feature importance bars
    const fn = FI.slice(0, 8).map(f => f[0]);
    const fv = FI.slice(0, 8).map(f => +(f[1] * 100).toFixed(2));
    Plotly.newPlot("chart-fi", [{
      type: "bar", orientation: "h",
      x: fv.slice().reverse(), y: fn.slice().reverse(),
      marker: { color: fv.slice().reverse(), colorscale: [[0, "rgba(255,255,255,.06)"], [1, pc]], showscale: false },
      text: fv.slice().reverse().map(v => v.toFixed(1) + "%"), textposition: "outside",
      textfont: { color: "#7b82a8", size: 10 }
    }], {
      title: { text: "Feature Importance", font: { size: 13, color: "#7b82a8" }, x: 0 },
      height: 300, margin: { l: 130, r: 60, t: 44, b: 20 },
      xaxis: { gridcolor: "rgba(255,255,255,.04)", color: "#7b82a8" },
      yaxis: { color: "#8890b0", tickfont: { size: 10 } },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: "#e8eaf6" }
    }, PLOTLY_CFG);

    // Probability histogram
    Plotly.newPlot("chart-hist", [{
      type: "histogram", x: P.map(p => p.churn_probability),
      nbinsx: 30, marker: { color: pc }, opacity: 0.75
    }], {
      title: { text: "Churn Probability Distribution", font: { size: 13, color: "#7b82a8" }, x: 0 },
      height: 240, margin: { l: 40, r: 16, t: 44, b: 34 },
      xaxis: { gridcolor: "rgba(255,255,255,.04)", color: "#7b82a8" },
      yaxis: { gridcolor: "rgba(255,255,255,.04)", color: "#7b82a8" },
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)", font: { color: "#e8eaf6" },
      bargap: 0.06
    }, PLOTLY_CFG);
  }

  /* ── SUBVIEW: retention plans ── */
  function renderSubRetention(R, isBank, pc) {
    const SEG = R.segment_summary;
    const recs = strategicRecs(isBank, SEG, pc);
    $("#ret-grid").innerHTML = recs.map((r, i) => `
      <article class="ret-card" style="border-left-color:${r.c}">
        <div class="ret-cat" style="color:${r.c}">INITIATIVE ${String(i + 1).padStart(2, "0")} · ${r.cat}</div>
        <div class="ret-title">${r.title}</div>
        <div class="ret-body">${r.body}</div>
        <div class="ret-tags">${r.tags.map(t =>
          `<span class="atag" style="background:${r.c}18;color:${r.c};border-color:${r.c}33">${t}</span>`).join("")}</div>
      </article>`).join("");
  }

  /* ═══════════ CONTENT LIBRARIES (from the Streamlit app) ═══════════ */
  function customerActions(p, isBank, cc) {
    const rl = p.risk_level;
    let all;
    if (isBank) {
      all = [
        { title: "Dedicated RM Call Within 48 Hours", body: "Assign a senior RM to call and discuss financial goals. High-touch engagement reduces churn by 35%.", type: "IMMEDIATE", color: cc, tags: ["↓35% churn", "48 hrs", "Low cost"] },
        { title: "High-Yield Savings Rate Offer", body: "Offer +1.5% above standard rate for new deposits. Zero-balance customers respond strongly to interest incentives.", type: "FINANCIAL", color: "#ffb800", tags: ["↑23% deposits", "1 week", "Medium"] },
        { title: "Multi-Product Bundle Discount", body: "Bundle savings + credit card + insurance at 20% fee discount. 3+ product customers churn at 61% lower rates.", type: "UPSELL", color: "#00ffc8", tags: ["↓42% churn", "2 weeks", "Low"] },
        { title: "Free Credit Health Advisory", body: "Enrol in Credit Health program. Advisory participants show 28% lower exit rates over 6 months.", type: "ADVISORY", color: "#a855f7", tags: ["↓28% exit", "1 month", "Free"] },
        { title: "Fast-Track Silver Loyalty Tier", body: "Unlock Silver: zero forex fees, priority support, 2× reward points. Loyalty members have 61% lower annual churn.", type: "LOYALTY", color: "#ffb800", tags: ["↓61% churn", "Immediate", "Low"] },
        { title: "Regional Wealth Seminar Invite", body: "Invite to exclusive wealth management event. Post-event NPS scores rise by 22 points on average.", type: "ENGAGEMENT", color: "#5b8dff", tags: ["+22 NPS", "1 month", "Medium"] },
        { title: "Proactive Complaint Resolution Audit", body: "Audit all past interactions. Escalate unresolved issues within 24 hours with a goodwill gesture.", type: "RETENTION", color: "#ff3d57", tags: ["↓55% churn", "24 hrs", "Very Low"] }
      ];
    } else {
      all = [
        { title: "Immediate Discount Call (20–25% Off)", body: "Outbound call with 20–25% discount on current plan for 3 months. M2M customers show 38% retention improvement.", type: "IMMEDIATE", color: cc, tags: ["↓38% churn", "24 hrs", "Low"] },
        { title: "Annual Contract + Incentive Bundle", body: "Offer 1-year contract at 15% below current billing + free 5GB/month. Annual holders churn at 4× lower rates.", type: "CONTRACT", color: "#5b8dff", tags: ["↓75% vs M2M", "1 week", "Medium"] },
        { title: "VIP Technical Support Fast-Track", body: "Priority Support for 90 days free, dedicated advisor, 4-hour SLA. Unresolved tech issues are #1 churn driver.", type: "SUPPORT", color: "#a855f7", tags: ["↓45% churn", "Immediate", "Low"] },
        { title: "Usage Drop Re-Engagement Campaign", body: "SMS + email with usage insights and free 10GB top-up when usage drops >25%. Reduces exit intent by 31%.", type: "ENGAGEMENT", color: "#00ffc8", tags: ["↓31% exit", "48 hrs", "Very Low"] },
        { title: "Gold Loyalty Status + Milestone Reward", body: "Award Gold status if tenure > 12 months: free roaming, unlimited SMS, priority network.", type: "LOYALTY", color: "#ffb800", tags: ["↓52% churn", "1 week", "Low"] },
        { title: "Family Multi-Line Bundle Offer", body: "Add 1–2 lines at 40% discount for 6 months. Multi-line accounts have 67% lower churn.", type: "UPSELL", color: "#ff3d57", tags: ["↓67% churn", "2 weeks", "Medium"] },
        { title: "OTT Streaming 2-Month Free Trial", body: "Offer 2-month free streaming bundle. Customers with add-ons show 44% lower churn.", type: "CROSS-SELL", color: "#a855f7", tags: ["↓44% churn", "1 week", "Low"] }
      ];
    }
    if (rl === "LOW") return all.slice(0, 3);
    if (rl === "MEDIUM") return all.slice(0, 5);
    return all;
  }

  function strategicRecs(isBank, SEG, pc) {
    const hr = SEG.high_risk.toLocaleString();
    if (isBank) {
      return [
        { title: "Real-Time Churn Alert Dashboard", body: `Automated system flagging all ${hr} customers crossing 70% probability. CRM integration for auto-task assignment. Each saved customer = avg ₹85,000 LTV.`, cat: "TECHNOLOGY", c: pc, tags: ["↑15% retention", "4–6 weeks", "Medium ROI"] },
        { title: "Dormant Account Re-Activation Campaign", body: "Quarterly 'Account Health Check' for IsActiveMember=0 customers. Fee waivers, +0.5% bonus interest, personal RM call. Inactive accounts are 4.2× more likely to exit.", cat: "CAMPAIGN", c: "#5b8dff", tags: ["↑22% re-activation", "2–3 weeks", "Low"] },
        { title: "ML Product Cross-Sell Engine", body: "Recommendation engine to move single-product customers to 3+. Customers with 3+ products have 61% lower annual churn. Priority: mutual funds + insurance + credit card.", cat: "PRODUCT", c: "#ffb800", tags: ["↓61% churn", "6–8 weeks", "High ROI"] },
        { title: "Geography-Specific Retention Squads", body: "Dedicated regional teams in high-churn zones. Each squad handles 200 at-risk customers per month via phone + branch visits.", cat: "OPERATIONS", c: "#a855f7", tags: ["↓33% regional churn", "1–2 months", "High"] },
        { title: "Credit Score Advisory Program", body: "Free Credit Health program for CreditScore < 650: monthly reports, improvement tips, RM check-ins. Advisory participants show 28% lower exit rates.", cat: "ADVISORY", c: "#00ffc8", tags: ["↓28% exit", "3–4 weeks", "Very Low"] },
        { title: "HNI VIP Escalation Protocol", body: "Auto-flag top 5% by EstimatedSalary × Balance. Dedicated senior RM, lounge access, zero-fee premium services.", cat: "VIP", c: "#ffb800", tags: ["↑40% HNI retention", "2–3 weeks", "Medium"] },
        { title: "Exit Intent Survey + Win-Back Loop", body: "3-question exit survey + auto-trigger personalized offers within 72 hours. Win-back success averages 26% when personalized.", cat: "FEEDBACK", c: "#ff3d57", tags: ["↑26% win-back", "1–2 weeks", "Very Low"] }
      ];
    }
    return [
      { title: "AI Churn Prevention Operations Hub", body: `Central dashboard showing all ${hr} high-risk subscribers ranked by probability. CRM auto-assigns retention agents. Each prevented churn saves ₹4,200 re-acquisition cost.`, cat: "TECHNOLOGY", c: pc, tags: ["↑18% retention", "3–5 weeks", "Medium ROI"] },
      { title: "Contract Conversion Sprint (6 Weeks)", body: "Convert M2M subscribers: locked-in price + free data upgrade + 3 months extra. M2M customers churn at 4× annual contract holders.", cat: "CAMPAIGN", c: "#a855f7", tags: ["↓75% vs M2M", "6 weeks", "Medium"] },
      { title: "Automated Pricing Intervention Engine", body: "MonthlyCharges is top ANN driver. Engine auto-generates 10–30% personalized discounts when churn score crosses 60%. No manual agent required.", cat: "PRICING", c: "#ffb800", tags: ["↓34% high-bill churn", "4–6 weeks", "Low"] },
      { title: "TechSupport Zero-Backlog SLA Policy", body: "Unresolved tickets = #2 churn driver. New SLA: HIGH-risk tickets escalated to Level 2 within 4 hours. Target: zero open >48 hours.", cat: "OPERATIONS", c: "#ff3d57", tags: ["↓45% support churn", "2 weeks", "Low"] },
      { title: "3-Tier Loyalty Milestone Program", body: "Silver (12mo), Gold (24mo), Platinum (36mo) with real rewards: free roaming days, data rollover, streaming. Milestone loyalty increases 24-month retention by 52%.", cat: "LOYALTY", c: "#ffb800", tags: ["↓52% long-tenure churn", "6–8 weeks", "Medium"] },
      { title: "Usage Drop Early Warning Automation", body: "Weekly pipeline flagging >25% usage drop. Day 1: free top-up SMS. Day 3: app notification. Day 7: personal call. Reduces exit intent by 31%.", cat: "TECHNOLOGY", c: "#00ffc8", tags: ["↓31% exit intent", "3–4 weeks", "Low"] },
      { title: "Fibre/5G Upgrade Path for DSL Users", body: "DSL subscribers churn at 2.8× vs fibre users. Offer subsidised 5G/fibre migration to all HIGH-risk DSL subscribers. Margin improves while churn drops.", cat: "UPSELL", c: "#a855f7", tags: ["↓58% DSL churn", "4–6 weeks", "High ROI"] }
    ];
  }
})();
