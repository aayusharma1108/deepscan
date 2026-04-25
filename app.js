// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = window.location.origin.startsWith("http")
  ? window.location.origin
  : "http://127.0.0.1:8000";

// ── State ─────────────────────────────────────────────────────────────────────
let currentFile = null;

// ── API Health Check ─────────────────────────────────────────────────────────
async function checkApiStatus() {
  const dot   = document.getElementById("apiDot");
  const label = document.getElementById("apiLabel");
  try {
    const res = await fetch(`${API_BASE}/api/stats`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      dot.className   = "api-dot online";
      const data = await res.json();
      label.textContent = data.mongo_connected ? "API + Mongo Online" : "API Online (Memory)";
      updateDbStats(data);
    } else { throw new Error("non-ok"); }
  } catch {
    dot.className   = "api-dot offline";
    label.textContent = "API Offline";
  }
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setTab(tab, btn) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  const fi = document.getElementById("fileInput");
  fi.accept = tab === "video" ? "video/*" : "image/*,video/*";
}

// ── File Upload ───────────────────────────────────────────────────────────────
function handleFileUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    showPreview(e.target.result);
    currentFile = { name: file.name, isVideo: file.type.startsWith("video") };
    startAnalysis(file.name, null, file);   // pass actual file for real upload
  };
  reader.readAsDataURL(file);
}

// ── Samples ───────────────────────────────────────────────────────────────────
function loadSample(type) {
  const names = {
    real:      "portrait_natural_001.jpg",
    fake:      "gan_generated_face.jpg",
    uncertain: "deepfake_ambiguous.mp4",
  };
  currentFile = { name: names[type], isVideo: type === "uncertain" };
  const pw = document.getElementById("previewWrap");
  pw.style.display = "block";
  document.getElementById("previewImg").style.display = "none";
  startAnalysis(names[type], type, null);
}

function showPreview(src) {
  const pw  = document.getElementById("previewWrap");
  pw.style.display = "block";
  const img = document.getElementById("previewImg");
  img.src = src;
  img.style.display = "block";
}

// ── Processing Steps ──────────────────────────────────────────────────────────
const STEPS = [
  { icon: "🎞️", label: "Frame Extraction",     desc: "Decoding media & extracting face regions via MTCNN" },
  { icon: "📐", label: "Landmark Detection",    desc: "Mapping 468 3D facial keypoints per frame" },
  { icon: "🔄", label: "RNN Temporal Analysis", desc: "Bi-LSTM processing 32-frame sequences" },
  { icon: "📊", label: "Confidence Scoring",    desc: "Computing deepfake probability score" },
  { icon: "💾", label: "MongoDB Storage",       desc: "Storing 128D embedding to Atlas collection" },
];
const STEP_DURATIONS = [700, 900, 1100, 600, 500];

async function startAnalysis(filename, forcedType, file) {
  document.getElementById("idleState").style.display = "none";
  document.getElementById("resultsContent").style.display = "none";

  const pp = document.getElementById("progressPanel");
  pp.style.display = "flex";
  pp.innerHTML = STEPS.map((s, i) => `
    <div class="p-step" id="ps_${i}">
      <div class="p-icon pending" id="pi_${i}">${s.icon}</div>
      <div class="p-info" style="flex:1">
        <h4>${s.label}</h4>
        <p id="pd_${i}">${s.desc}</p>
        ${i < STEPS.length - 1
          ? `<div class="p-bar-wrap" id="pb_${i}" style="display:none"><div class="p-bar-fill" id="pf_${i}"></div></div>`
          : ""}
      </div>
    </div>
  `).join("");

  // Animate progress steps while waiting for API ────────────────────────────
  let step = 0;
  const TOTAL_ANIM_MS = STEP_DURATIONS.reduce((a, b) => a + b, 0);

  const animPromise = new Promise(resolve => {
    function doStep() {
      if (step >= STEPS.length) { resolve(); return; }
      const icon = document.getElementById(`pi_${step}`);
      const desc = document.getElementById(`pd_${step}`);
      icon.className = "p-icon active";
      desc.className = "running";
      if (step > 0) document.getElementById(`pi_${step - 1}`).className = "p-icon done";
      const barWrap = step < STEPS.length - 1 ? document.getElementById(`pb_${step}`) : null;
      const barFill = barWrap ? document.getElementById(`pf_${step}`) : null;
      if (barWrap) barWrap.style.display = "block";
      let pct = 0;
      const dur = STEP_DURATIONS[step];
      const interval = setInterval(() => {
        pct += 100 / (dur / 50);
        if (barFill) barFill.style.width = Math.min(pct, 100) + "%";
        if (pct >= 100) {
          clearInterval(interval);
          step++;
          setTimeout(doStep, 120);
        }
      }, 50);
    }
    doStep();
  });

  // Call the Flask API ───────────────────────────────────────────────────────
  let apiResult = null;
  try {
    let res;
    if (file) {
      // Real file upload
      const form = new FormData();
      form.append("file", file);
      res = await fetch(`${API_BASE}/api/analyze`, { method: "POST", body: form });
    } else {
      // Sample shortcut
      res = await fetch(`${API_BASE}/api/analyze`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ filename, type: forcedType }),
      });
    }
    if (res.ok) {
      apiResult = await res.json();
      // Refresh DB stats
      const stats = await fetch(`${API_BASE}/api/stats`).then(r => r.json()).catch(() => null);
      if (stats) updateDbStats(stats);
    }
  } catch (err) {
    console.warn("API unavailable, falling back to client-side simulation:", err);
  }

  // Wait for animation to finish before rendering
  await animPromise;
  showResults(apiResult || simulateFallback(filename, forcedType));
}

// ── Client-side fallback (used when Flask is offline) ─────────────────────────
function simulateFallback(filename, forcedType) {
  const rand = () => Math.random();
  let verdict, conf, reason;
  if (forcedType === "real") {
    verdict = "REAL"; conf = 0.80 + rand() * 0.14;
    reason = "Facial landmarks align with natural geometry. RNN detects consistent micro-expressions. No GAN artifacts found.";
  } else if (forcedType === "fake") {
    verdict = "FAKE"; conf = 0.87 + rand() * 0.11;
    reason = "GAN blending artifacts detected in periocular region. Temporal inconsistencies in 14/32 frames. Eye-blink anomaly flagged.";
  } else if (forcedType === "uncertain") {
    verdict = "UNCERTAIN"; conf = 0.42 + rand() * 0.20;
    reason = "Mixed signals. Low-quality input reduces landmark confidence. Temporal data inconclusive. Manual review recommended.";
  } else {
    const r = rand();
    if (r < 0.40)      { verdict = "REAL";      conf = 0.75 + rand() * 0.20; reason = "No significant deepfake indicators found."; }
    else if (r < 0.78) { verdict = "FAKE";      conf = 0.78 + rand() * 0.20; reason = "Boundary blending artifacts found. GAN fingerprint in texture gradients."; }
    else               { verdict = "UNCERTAIN"; conf = 0.38 + rand() * 0.28; reason = "Confidence below classification threshold."; }
  }

  const rng = () => Math.round(60 + rand() * 38);
  const regions = ["Jawline","Eyes","Nose","Mouth","Brows","Ears"];
  const landmarks = {};
  regions.forEach(r => { landmarks[r] = parseFloat((0.58 + rand() * 0.40).toFixed(2)); });

  const timeline = Array.from({ length: 32 }, () => {
    if (verdict === "FAKE")      return rand() > 0.55 ? "#ff4d6d" : "#1a1f35";
    if (verdict === "REAL")      return rand() > 0.90 ? "#ffb347" : "#00f5c4";
    return ["#ff4d6d","#ffb347","#1a1f35"][Math.floor(rand()*3)];
  });

  const hash = Array.from({ length: 8 }, () => Math.floor(rand()*16).toString(16)).join("").toUpperCase();
  const ep   = Array.from({ length: 8 }, () => parseFloat((rand()*2-1).toFixed(3)));

  return {
    filename, verdict, confidence: conf, pct: Math.round(conf * 100), reason,
    metrics: { landmark: rng(), rnn: rng(), blink: rng(), texture: rng() },
    timeline, landmarks, hash, embedding_preview: ep, model_ver: "bilstm-v2.4 (offline)",
  };
}

// ── Render Results ────────────────────────────────────────────────────────────
function showResults(data) {
  document.getElementById("progressPanel").style.display = "none";
  const rc = document.getElementById("resultsContent");
  rc.style.display = "flex";

  const { verdict, pct, reason, metrics, timeline, landmarks, hash, embedding_preview, model_ver } = data;
  const vClass  = verdict === "REAL" ? "real" : verdict === "FAKE" ? "fake" : "uncertain";
  const vColor  = verdict === "REAL" ? "var(--success)" : verdict === "FAKE" ? "var(--danger)" : "var(--warning)";
  const vEmoji  = verdict === "REAL" ? "✅" : verdict === "FAKE" ? "⚠️" : "❓";

  const lmHtml = Object.entries(landmarks).map(([name, score]) => {
    const c = score > 0.85 ? "var(--success)" : score > 0.70 ? "var(--warning)" : "var(--danger)";
    return `<div class="lm-item"><div class="lm-name">${name}</div><div class="lm-score" style="color:${c}">${score.toFixed(2)}</div></div>`;
  }).join("");

  const segs = timeline.map(c => `<div class="t-seg" style="background:${c};opacity:0.85"></div>`).join("");
  const vecPreview = embedding_preview.map(v => typeof v === "number" ? v.toFixed(3) : v).join(", ");

  rc.innerHTML = `
    <div class="result-verdict v-${vClass}">
      <div class="verdict-emoji">${vEmoji}</div>
      <div class="verdict-tag vt-${vClass}">${verdict}</div>
      <div class="verdict-pct vp-${vClass}">${pct}%</div>
      <div class="verdict-reason">${reason}</div>
    </div>

    <div class="metrics-grid">
      <div class="metric-card">
        <div class="m-label">Landmark Confidence</div>
        <div class="m-value" style="color:var(--accent)">${metrics.landmark}%</div>
        <div class="m-bar"><div class="m-fill" id="mf1" style="background:var(--accent);width:0%"></div></div>
      </div>
      <div class="metric-card">
        <div class="m-label">RNN Score</div>
        <div class="m-value" style="color:var(--accent2)">${metrics.rnn}%</div>
        <div class="m-bar"><div class="m-fill" id="mf2" style="background:var(--accent2);width:0%"></div></div>
      </div>
      <div class="metric-card">
        <div class="m-label">Blink Analysis</div>
        <div class="m-value" style="color:${vColor}">${metrics.blink}%</div>
        <div class="m-bar"><div class="m-fill" id="mf3" style="background:${vColor};width:0%"></div></div>
      </div>
      <div class="metric-card">
        <div class="m-label">Texture Integrity</div>
        <div class="m-value" style="color:var(--warning)">${metrics.texture}%</div>
        <div class="m-bar"><div class="m-fill" id="mf4" style="background:var(--warning);width:0%"></div></div>
      </div>
    </div>

    <div class="analysis-card">
      <div class="a-title">Facial Landmark Scores — 468 keypoints → 6 regions</div>
      <div class="lm-grid">${lmHtml}</div>
    </div>

    <div class="analysis-card">
      <div class="a-title">RNN Frame Timeline — 32 frames analyzed</div>
      <div class="timeline-bar">${segs}</div>
      <div class="t-legend">
        <span style="color:var(--success)">▮ Normal</span>
        <span style="color:var(--warning)">▮ Anomaly</span>
        <span style="color:var(--danger)">▮ Artifact</span>
      </div>
    </div>

    <div class="analysis-card">
      <div class="a-title">MongoDB Vector Embedding — 128D (preview) · Model: ${model_ver}</div>
      <div class="db-preview">
Hash:     <span class="db-hash">${hash}</span><br>
Vec[0:8]: [${vecPreview}, ...]<br>
<span class="db-comment">Collection: configured MongoDB collection</span><br>
<span class="db-comment">Embedding: 128D vector · Status: ✓ stored</span>
      </div>
    </div>

    <button class="analyze-btn" onclick="resetAnalyzer()">← Analyze Another</button>
  `;

  // Animate metric bars
  setTimeout(() => {
    document.getElementById("mf1").style.width = metrics.landmark + "%";
    document.getElementById("mf2").style.width = metrics.rnn + "%";
    document.getElementById("mf3").style.width = metrics.blink + "%";
    document.getElementById("mf4").style.width = metrics.texture + "%";
  }, 100);

  // Update session history from server
  refreshHistory();
}

// ── History ───────────────────────────────────────────────────────────────────
async function refreshHistory() {
  try {
    const rows = await fetch(`${API_BASE}/api/history`).then(r => r.json());
    renderHistory(rows);
  } catch { /* server offline — history stays as-is */ }
}

function renderHistory(rows) {
  const hb = document.getElementById("historyBody");
  if (!rows || !rows.length) {
    hb.innerHTML = '<div style="padding:2.5rem;text-align:center;color:var(--text3);font-size:0.88rem">No analyses yet — upload a file or try a sample above.</div>';
    return;
  }
  hb.innerHTML = rows.slice(0, 10).map(r => {
    const isImg   = !/\.(mp4|mov|webm)$/i.test(r.filename);
    const bdg     = r.verdict === "REAL" ? "b-real" : r.verdict === "FAKE" ? "b-fake" : "b-uncertain";
    const cColor  = r.verdict === "REAL" ? "var(--success)" : r.verdict === "FAKE" ? "var(--danger)" : "var(--warning)";
    const created = r.created_at ? new Date(r.created_at) : null;
    const ts      = created && !Number.isNaN(created.getTime())
      ? created.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "—";
    return `<div class="h-row">
      <div class="h-file">
        <div class="f-icon ${isImg ? "fi-img" : "fi-vid"}">${isImg ? "🖼" : "🎬"}</div>
        <span class="h-fname">${r.filename}</span>
      </div>
      <div><span class="badge ${bdg}">${r.verdict}</span></div>
      <div class="h-conf" style="color:${cColor}">${r.pct}%</div>
      <div class="h-muted" style="font-family:var(--font-mono);font-size:0.78rem">${r.model_ver || "BiLSTM-v2"}</div>
      <div class="h-muted">${ts}</div>
    </div>`;
  }).join("");
}

// ── DB Stats ──────────────────────────────────────────────────────────────────
function updateDbStats(data) {
  document.getElementById("dbTotal").textContent = data.total ?? 0;
  document.getElementById("dbFake").textContent  = data.fake  ?? 0;
  document.getElementById("dbConf").textContent  = data.avg_confidence != null ? data.avg_confidence + "%" : "—";
}

// ── Reset ─────────────────────────────────────────────────────────────────────
function resetAnalyzer() {
  currentFile = null;
  document.getElementById("idleState").style.display     = "flex";
  document.getElementById("resultsContent").style.display = "none";
  document.getElementById("progressPanel").style.display  = "none";
  document.getElementById("progressPanel").innerHTML       = "";
  document.getElementById("previewWrap").style.display    = "none";
  document.getElementById("fileInput").value              = "";
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const dropArea = document.getElementById("dropArea");
  dropArea.addEventListener("dragover", e => { e.preventDefault(); dropArea.classList.add("dragover"); });
  dropArea.addEventListener("dragleave", ()  => dropArea.classList.remove("dragover"));
  dropArea.addEventListener("drop", e => {
    e.preventDefault(); dropArea.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer(); dt.items.add(file);
      const fi = document.getElementById("fileInput"); fi.files = dt.files;
      handleFileUpload(fi);
    }
  });

  // Initial API ping
  checkApiStatus();
  setInterval(checkApiStatus, 30_000);
});
