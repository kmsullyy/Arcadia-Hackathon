/**
 * app.js — Arcadia Commuter Assistant
 * Fetches dashboard data from the Cloudflare Worker (/api/dashboard)
 * and renders it into the existing index.html UI.
 *
 * Uses relative URLs so this file works unchanged in:
 *   - wrangler dev  (http://localhost:8787)
 *   - Production    (https://your-worker.workers.dev)
 */

// ─── Config ───────────────────────────────────────────────────────────────────

// Using relative URLs — works identically in wrangler dev and production.
// The Worker serves both /api/* endpoints AND these static files.
const API_MODE = "worker";
const WORKER_URL = ""; // empty = same origin (relative)

// ─── Time Travel State ────────────────────────────────────────────────────────
// simTime: "HH:MM" string sent to Worker, or null for real time.
let simTime = null;

/** Returns a Date representing "now" (real or simulated). */
function getSimNow() {
  if (!simTime) return new Date();
  const [h, m] = simTime.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ─── Status Helpers ───────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  "in-person": { label: "In-Person",  emoji: "🏫", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  "virtual":   { label: "Virtual",    emoji: "💻", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  "cancelled": { label: "Cancelled",  emoji: "🚫", color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
};

function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function minutesUntil(isoString) {
  return Math.max(0, Math.round((new Date(isoString) - getSimNow()) / 60000));
}

// ─── Render: Header ───────────────────────────────────────────────────────────

function renderHeader(data) {
  const h1 = document.querySelector(".app-header h1");
  if (!h1) return;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (data.student?.name ?? "Student").split(" ")[0];
  h1.textContent = `${greeting}, ${firstName}!`;
}

// ─── Render: Big Status Card ──────────────────────────────────────────────────

function renderStatusCard(data) {
  const card = document.querySelector(".red-class-card");
  if (!card) return;

  const { shouldCommute, urgentAlert, nextClass, eta } = data;

  if (!nextClass) {
    // No more classes today
    card.style.background = "linear-gradient(135deg, #10b981, #059669)";
    card.innerHTML = `
      <div class="card-badge">✅ All Done!</div>
      <h2 style="font-size:2rem">No More Classes</h2>
      <p class="card-sub">Enjoy your evening 🎉</p>
    `;
    return;
  }

  const cfg = STATUS_CONFIG[nextClass.status];

  // Card color changes based on status
  if (nextClass.status === "cancelled") {
    card.style.background = "linear-gradient(135deg, #ef4444, #b91c1c)";
  } else if (nextClass.status === "virtual") {
    card.style.background = "linear-gradient(135deg, #6366f1, #4338ca)";
  } else {
    card.style.background = "linear-gradient(135deg, hsl(350,85%,45%), hsl(340,85%,40%))";
  }

  const minsUntil = minutesUntil(nextClass.startTime);
  const etaText = eta?.isFallback
    ? `~${eta.durationMinutes} min (est.)`
    : `${eta.durationMinutes} min drive`;

  const shouldLeaveIn = Math.max(0, minsUntil - (eta?.durationMinutes ?? 35));

  card.innerHTML = `
    <div class="card-badge">${cfg.emoji} ${cfg.label}</div>
    <h2 style="font-size:1.6rem;padding:0 16px;text-align:center">${nextClass.code}</h2>
    <p class="card-sub" style="padding:0 16px;text-align:center;opacity:0.9">${nextClass.name}</p>
    <div class="card-time-row">
      <span>⏰ ${formatTime(nextClass.startTime)}</span>
      <span>📍 ${nextClass.location}</span>
    </div>
    ${
      nextClass.status === "in-person"
        ? `<div class="card-eta-chip">
            🚗 ${etaText} &nbsp;·&nbsp;
            ${shouldLeaveIn > 0 ? `Leave in ${shouldLeaveIn} min` : "Leave now!"}
           </div>`
        : nextClass.status === "virtual" && nextClass.zoomLink
        ? `<a href="${nextClass.zoomLink}" target="_blank" class="card-zoom-btn">🎥 Join Zoom</a>`
        : ""
    }
    <div class="card-location">${
      nextClass.status === "cancelled"
        ? "📛 Class cancelled — no need to drive!"
        : nextClass.status === "virtual"
        ? "💻 Attend from home"
        : `👣 Head to ${nextClass.location}`
    }</div>
  `;
}

// ─── Render: Schedule List (injected below the road) ─────────────────────────

function renderScheduleList(data) {
  // Remove old list if any
  const old = document.getElementById("schedule-list");
  if (old) old.remove();

  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const wrapper = document.createElement("div");
  wrapper.id = "schedule-list";
  wrapper.innerHTML = `
    <h3 class="schedule-list-title">Today's Schedule</h3>
    <div class="schedule-items">
      ${data.schedule.map((c) => {
        const cfg = STATUS_CONFIG[c.status];
        const isPast = new Date(c.endTime) < Date.now();
        return `
          <div class="schedule-item ${isPast ? "is-past" : ""}" style="border-left: 3px solid ${cfg.color}">
            <div class="si-time">${formatTime(c.startTime)}</div>
            <div class="si-info">
              <span class="si-code">${c.code}</span>
              <span class="si-name">${c.name}</span>
            </div>
            <div class="si-badge" style="background:${cfg.bg};color:${cfg.color}">${cfg.emoji} ${cfg.label}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;

  // Insert before nav
  nav.parentElement.insertBefore(wrapper, nav);
  injectScheduleStyles();
}

// ─── Animate Car ─────────────────────────────────────────────────────────────

function animateCar(shouldCommute) {
  const car = document.querySelector(".car-container");
  if (!car) return;
  if (shouldCommute) {
    car.style.animation = "car-bounce 0.8s infinite alternate ease-in-out, car-drive 8s linear infinite";
  } else {
    // Parked — stop at center, no driving animation
    car.style.animation = "car-bounce 1.6s infinite alternate ease-in-out";
    car.style.opacity = "0.6";
  }
}

// ─── Urgent Alert Banner ──────────────────────────────────────────────────────

function showUrgentAlert(urgentAlert) {
  const old = document.getElementById("urgent-banner");
  if (old) old.remove();
  if (!urgentAlert) return;

  const banner = document.createElement("div");
  banner.id = "urgent-banner";
  const isCancelled = urgentAlert.status === "cancelled";
  banner.innerHTML = `
    <span>${isCancelled ? "🚫 CLASS CANCELLED" : "💻 CLASS IS VIRTUAL"}</span>
    <strong>${urgentAlert.code} — ${urgentAlert.name}</strong>
    <span>${isCancelled ? "Stay home! 🏠" : "Join online 💻"}</span>
  `;
  banner.style.cssText = `
    position:fixed;top:0;left:0;width:100%;z-index:999;
    padding:10px 16px;display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;
    background:${isCancelled ? "#ef4444" : "#6366f1"};
    color:white;font-family:var(--font-heading);font-size:0.85rem;font-weight:600;
    animation:slide-down 0.4s cubic-bezier(0.34,1.56,0.64,1);
  `;

  document.body.prepend(banner);

  // Auto-dismiss after 8 s
  setTimeout(() => banner.remove(), 8000);
}

// ─── Injected Styles ──────────────────────────────────────────────────────────

function injectScheduleStyles() {
  if (document.getElementById("schedule-list-styles")) return;
  const style = document.createElement("style");
  style.id = "schedule-list-styles";
  style.textContent = `
    #schedule-list {
      padding: 16px 24px 4px;
      overflow-y: auto;
      max-height: 220px;
    }
    .schedule-list-title {
      font-family: var(--font-heading);
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 10px;
    }
    .schedule-items { display: flex; flex-direction: column; gap: 8px; }
    .schedule-item {
      display: flex; align-items: center; gap: 12px;
      background: var(--bg-glass); backdrop-filter: var(--glass-blur);
      border-radius: 12px; padding: 10px 14px;
      transition: transform 0.2s; cursor: default;
    }
    .schedule-item:hover { transform: translateX(4px); }
    .schedule-item.is-past { opacity: 0.4; }
    .si-time { font-size: 0.75rem; font-weight: 700; color: var(--text-muted); min-width: 52px; }
    .si-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .si-code { font-family: var(--font-heading); font-size: 0.85rem; font-weight: 700; color: var(--text-primary); }
    .si-name { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
    .si-badge { font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 20px; white-space: nowrap; }
    .card-badge { font-size: 0.85rem; font-weight: 700; background: rgba(255,255,255,0.2); padding: 4px 14px; border-radius: 20px; color: white; margin-bottom: 10px; }
    .card-sub { color: rgba(255,255,255,0.85); font-size: 0.95rem; margin-top: 4px; }
    .card-time-row { display: flex; gap: 16px; margin-top: 14px; color: rgba(255,255,255,0.9); font-size: 0.85rem; font-weight: 600; }
    .card-eta-chip { margin-top: 12px; background: rgba(255,255,255,0.2); padding: 6px 16px; border-radius: 20px; color: white; font-size: 0.85rem; font-weight: 700; }
    .card-zoom-btn { margin-top: 12px; background: white; color: #6366f1; padding: 8px 20px; border-radius: 20px; font-size: 0.9rem; font-weight: 700; text-decoration: none; transition: transform 0.2s; display: inline-block; }
    .card-zoom-btn:hover { transform: scale(1.05); }
    @keyframes slide-down { from { transform: translateY(-100%); } to { transform: translateY(0); } }
    @keyframes car-drive {
      0%   { left: -20%;  }
      100% { left: 120%;  }
    }
  `;
  document.head.appendChild(style);
}

// ─── Loading State ────────────────────────────────────────────────────────────

function showLoading() {
  const card = document.querySelector(".red-class-card");
  if (card) {
    card.innerHTML = `
      <div class="card-badge">⏳ Loading…</div>
      <h2 style="font-size:1.6rem">Fetching your schedule</h2>
      <p class="card-sub">Checking Canvas &amp; email…</p>
    `;
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

let lastData = null; // cache so debug panel can re-render without a new fetch

async function boot(forceRefetch = true) {
  injectScheduleStyles();
  if (forceRefetch) showLoading();

  try {
    let data;
    if (forceRefetch) {
      const qs = simTime ? `?simTime=${encodeURIComponent(simTime)}` : "";
      const resp = await fetch(`${WORKER_URL}/api/dashboard${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
      lastData = data;
    } else {
      data = lastData;
    }

    renderHeader(data);
    renderStatusCard(data);
    renderScheduleList(data);
    animateCar(data.shouldCommute);
    showUrgentAlert(data.urgentAlert);

    console.log(`[Arcadia] Dashboard loaded (simTime=${simTime ?? "real"})`, data);
  } catch (err) {
    console.error("[Arcadia] Boot failed:", err);
    const card = document.querySelector(".red-class-card");
    if (card) {
      card.innerHTML = `
        <div class="card-badge">⚠️ Error</div>
        <h2 style="font-size:1.4rem">Could not load data</h2>
        <p class="card-sub">${err.message}</p>
      `;
    }
  }
}

// ─── Debug Panel ──────────────────────────────────────────────────────────────

const TIME_PRESETS = [
  { label: "8:30 AM",  value: "08:30", note: "Before classes" },
  { label: "9:30 AM",  value: "09:30", note: "CS 101 🏫" },
  { label: "10:30 AM", value: "10:30", note: "Between classes" },
  { label: "11:30 AM", value: "11:30", note: "CS 202 🚫" },
  { label: "1:00 PM",  value: "13:00", note: "Before CS 315" },
  { label: "2:30 PM",  value: "14:30", note: "CS 315 💻" },
  { label: "4:00 PM",  value: "16:00", note: "Before CS 420" },
  { label: "5:00 PM",  value: "17:00", note: "CS 420 🏫" },
  { label: "6:30 PM",  value: "18:30", note: "After all classes" },
];

function createDebugPanel() {
  // Inject styles
  const style = document.createElement("style");
  style.textContent = `
    #debug-panel {
      position: fixed;
      bottom: 88px;
      right: 12px;
      z-index: 200;
      font-family: var(--font-heading);
    }
    #debug-toggle {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #1e293b;
      color: #facc15;
      border: none;
      font-size: 1.2rem;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: auto;
      transition: transform 0.2s;
    }
    #debug-toggle:hover { transform: scale(1.1) rotate(20deg); }
    #debug-drawer {
      display: none;
      flex-direction: column;
      gap: 6px;
      background: rgba(15,23,42,0.97);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 14px 12px;
      margin-bottom: 8px;
      min-width: 200px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    #debug-drawer.open { display: flex; }
    .dbg-title {
      font-size: 0.65rem;
      font-weight: 800;
      color: #facc15;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      margin-bottom: 4px;
    }
    .dbg-clock {
      font-size: 1.1rem;
      font-weight: 700;
      color: white;
      text-align: center;
      background: rgba(255,255,255,0.05);
      border-radius: 8px;
      padding: 6px 0;
      margin-bottom: 4px;
    }
    .dbg-btn {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.07);
      border-radius: 8px;
      padding: 7px 10px;
      cursor: pointer;
      transition: background 0.15s, transform 0.15s;
      width: 100%;
      text-align: left;
    }
    .dbg-btn:hover { background: rgba(255,255,255,0.12); transform: translateX(-2px); }
    .dbg-btn.active { background: rgba(250,204,21,0.15); border-color: #facc15; }
    .dbg-time { font-size: 0.8rem; font-weight: 700; color: white; }
    .dbg-note { font-size: 0.65rem; color: #94a3b8; }
    .dbg-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 4px 0; }
    .dbg-real-btn {
      background: rgba(239,68,68,0.1);
      border-color: rgba(239,68,68,0.3);
      color: #f87171;
      font-size: 0.75rem;
      font-weight: 700;
      border-radius: 8px;
      padding: 7px 10px;
      cursor: pointer;
      border: 1px solid rgba(239,68,68,0.3);
      width: 100%;
      transition: background 0.15s;
    }
    .dbg-real-btn:hover { background: rgba(239,68,68,0.2); }
    .dbg-custom-row {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .dbg-input {
      flex: 1;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      color: white;
      font-family: var(--font-heading);
      font-size: 0.8rem;
      padding: 6px 8px;
      outline: none;
    }
    .dbg-go-btn {
      background: #facc15;
      color: #1e293b;
      font-weight: 800;
      font-size: 0.75rem;
      border: none;
      border-radius: 8px;
      padding: 6px 10px;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // Build DOM
  const panel = document.createElement("div");
  panel.id = "debug-panel";

  const drawer = document.createElement("div");
  drawer.id = "debug-drawer";

  function refreshClock() {
    const now = getSimNow();
    clock.textContent = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
      + (simTime ? " ⏱" : " 🔴");
  }

  drawer.innerHTML = `<div class="dbg-title">⏰ Time Travel</div>`;

  const clock = document.createElement("div");
  clock.className = "dbg-clock";
  drawer.appendChild(clock);
  refreshClock();

  // Preset buttons
  const presetWrap = document.createElement("div");
  TIME_PRESETS.forEach(({ label, value, note }) => {
    const btn = document.createElement("button");
    btn.className = "dbg-btn";
    btn.dataset.simTime = value;
    btn.innerHTML = `<span class="dbg-time">${label}</span><span class="dbg-note">${note}</span>`;
    btn.addEventListener("click", async () => {
      simTime = value;
      document.querySelectorAll(".dbg-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      refreshClock();
      await boot(true);
    });
    presetWrap.appendChild(btn);
  });
  drawer.appendChild(presetWrap);

  // Divider
  const div1 = document.createElement("div");
  div1.className = "dbg-divider";
  drawer.appendChild(div1);

  // Custom time input
  const customRow = document.createElement("div");
  customRow.className = "dbg-custom-row";
  const input = document.createElement("input");
  input.type = "time";
  input.className = "dbg-input";
  input.placeholder = "HH:MM";
  const goBtn = document.createElement("button");
  goBtn.className = "dbg-go-btn";
  goBtn.textContent = "Go";
  goBtn.addEventListener("click", async () => {
    if (!input.value) return;
    simTime = input.value;
    document.querySelectorAll(".dbg-btn").forEach(b => b.classList.remove("active"));
    refreshClock();
    await boot(true);
  });
  customRow.appendChild(input);
  customRow.appendChild(goBtn);
  drawer.appendChild(customRow);

  // Divider + real time button
  const div2 = document.createElement("div");
  div2.className = "dbg-divider";
  drawer.appendChild(div2);

  const realBtn = document.createElement("button");
  realBtn.className = "dbg-real-btn";
  realBtn.textContent = "↩︎ Reset to Real Time";
  realBtn.addEventListener("click", async () => {
    simTime = null;
    input.value = "";
    document.querySelectorAll(".dbg-btn").forEach(b => b.classList.remove("active"));
    refreshClock();
    await boot(true);
  });
  drawer.appendChild(realBtn);

  // Toggle button
  const toggle = document.createElement("button");
  toggle.id = "debug-toggle";
  toggle.textContent = "⏱";
  toggle.title = "Time Travel Debug Panel";
  toggle.addEventListener("click", () => {
    drawer.classList.toggle("open");
  });

  panel.appendChild(drawer);
  panel.appendChild(toggle);
  document.body.appendChild(panel);

  // Keep clock ticking
  setInterval(refreshClock, 1000);
}

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", async () => { await boot(); createDebugPanel(); });
} else {
  boot().then(() => createDebugPanel());
}
