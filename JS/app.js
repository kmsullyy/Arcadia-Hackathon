/**
 * app.js — Arcadia Commuter Assistant
 * Phase 3: Full homepage / dashboard implementation.
 *
 * 3.01 — Homepage layout
 * 3.02 — Day's Schedule Overview  (with cancellation/virtual reasons)
 * 3.03 — Traffic & ETA Display    (leave-by recommender)
 * 3.04 — Main Notification System (aggressive urgent alert with reason)
 */

// ─── Config ───────────────────────────────────────────────────────────────────

const WORKER_URL = ""; // empty = same origin (relative) — works in wrangler dev & production

// ─── Time Travel State ────────────────────────────────────────────────────────

let simTime = null;

function getSimNow() {
  if (!simTime) return new Date();
  const [h, m] = simTime.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  "in-person": {
    label: "In-Person",
    emoji: "🏫",
    color: "#10b981",
    bg: "rgba(16,185,129,0.15)",
    border: "rgba(16,185,129,0.3)",
    gradient: "linear-gradient(135deg, #10b981, #059669)",
  },
  virtual: {
    label: "Virtual",
    emoji: "💻",
    color: "#6366f1",
    bg: "rgba(99,102,241,0.15)",
    border: "rgba(99,102,241,0.3)",
    gradient: "linear-gradient(135deg, #6366f1, #4338ca)",
  },
  cancelled: {
    label: "Cancelled",
    emoji: "🚫",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.15)",
    border: "rgba(239,68,68,0.3)",
    gradient: "linear-gradient(135deg, #ef4444, #b91c1c)",
  },
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatTime(isoString) {
  const is24 = localStorage.getItem("setting-24hr") === "true";
  return new Date(isoString).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: !is24,
  });
}

function minutesUntil(isoString) {
  return Math.max(0, Math.round((new Date(isoString) - getSimNow()) / 60000));
}

function sourceLabel(source) {
  if (source === "canvas") return "via Canvas";
  if (source === "email")  return "via Email";
  return "";
}

// Strip zoom links from a reason string so it's readable
function cleanReason(reason) {
  if (!reason) return null;
  return reason.replace(/https?:\/\/\S+/g, "").replace(/\s{2,}/g, " ").trim();
}

// ─── Task 3.01 — Header ───────────────────────────────────────────────────────

function renderHeader(data) {
  const h1 = document.getElementById("greeting-text");
  if (!h1) return;
  const hour = getSimNow().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = (data.student?.name ?? "Student").split(" ")[0];
  h1.textContent = `${greeting}, ${firstName}!`;

  // Sub-line: date
  let sub = document.getElementById("greeting-sub");
  if (!sub) {
    sub = document.createElement("p");
    sub.id = "greeting-sub";
    sub.className = "greeting-sub";
    h1.parentElement.appendChild(sub);
  }
  const opts = { weekday: "long", month: "long", day: "numeric" };
  sub.textContent = getSimNow().toLocaleDateString("en-US", opts);
}

// ─── Task 3.04 — Main Notification System ─────────────────────────────────────
// Aggressive, prominent banner + modal-style alert for cancelled/virtual classes.

function showUrgentAlert(urgentAlert) {
  // Remove any old alerts
  document.getElementById("urgent-banner")?.remove();
  document.getElementById("urgent-modal")?.remove();

  if (!urgentAlert) return;

  const isCancelled = urgentAlert.status === "cancelled";
  const cfg = STATUS_CONFIG[urgentAlert.status];
  const reason = cleanReason(urgentAlert.statusReason);
  const src = sourceLabel(urgentAlert.statusSource);

  // ── Sticky top banner (always visible) ──────────────────────────────────────
  const banner = document.createElement("div");
  banner.id = "urgent-banner";
  banner.innerHTML = `
    <span class="ub-icon">${cfg.emoji}</span>
    <span class="ub-text">
      <strong>${urgentAlert.code}</strong>
      ${isCancelled ? "is CANCELLED" : "is VIRTUAL"}
    </span>
    <button class="ub-details-btn" id="ub-details-btn">Details ›</button>
    <button class="ub-close" id="ub-close" title="Dismiss">✕</button>
  `;
  banner.style.cssText = `
    position:relative;z-index:1000;
    display:flex;align-items:center;gap:10px;
    padding:14px 20px;
    background:${cfg.gradient};
    color:white;font-family:var(--font-heading);font-weight:600;font-size:0.9rem;
    box-shadow:0 10px 20px rgba(0,0,0,0.15);
    animation:slide-down 0.4s cubic-bezier(0.34,1.56,0.64,1);
  `;
  document.body.prepend(banner);

  // ── Expandable Detail Modal ───────────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.id = "urgent-modal";
  modal.style.cssText = `
    position:fixed;inset:0;z-index:999;
    display:none;align-items:flex-end;justify-content:center;
    background:rgba(0,0,0,0.55);backdrop-filter:blur(6px);
    padding-bottom:96px;
  `;

  const body_html = `
    <div id="urgent-modal-card" style="
      background:#0f172a;
      border:1px solid ${cfg.border};
      border-radius:24px 24px 16px 16px;
      padding:24px 20px;
      max-width:480px;width:calc(100% - 32px);
      box-shadow:0 -16px 48px rgba(0,0,0,0.4);
      animation:modal-up 0.35s cubic-bezier(0.34,1.56,0.64,1);
    ">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="font-size:2.2rem;">${cfg.emoji}</div>
        <div>
          <div style="font-family:var(--font-heading);font-size:0.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:${cfg.color};margin-bottom:2px;">${urgentAlert.status === "cancelled" ? "Class Cancelled" : "Class Going Virtual"}</div>
          <div style="font-family:var(--font-heading);font-size:1.4rem;font-weight:800;color:white;line-height:1.2;">${urgentAlert.code}</div>
          <div style="font-size:0.8rem;color:#94a3b8;">${urgentAlert.name}</div>
        </div>
      </div>

      ${reason ? `
      <div style="
        background:rgba(255,255,255,0.05);
        border-left:3px solid ${cfg.color};
        border-radius:0 10px 10px 0;
        padding:12px 14px;
        margin-bottom:16px;
      ">
        <div style="font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:${cfg.color};margin-bottom:6px;">
          📣 Reason ${src}
        </div>
        <div style="font-size:0.88rem;color:#cbd5e1;line-height:1.5;">"${reason}"</div>
      </div>` : ""}

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;">
        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:10px 12px;">
          <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:3px;">Time</div>
          <div style="font-size:0.95rem;font-weight:700;color:white;">⏰ ${formatTime(urgentAlert.startTime)}</div>
        </div>
        <div style="background:rgba(255,255,255,0.04);border-radius:12px;padding:10px 12px;">
          <div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#64748b;margin-bottom:3px;">Instructor</div>
          <div style="font-size:0.95rem;font-weight:700;color:white;">👤 ${urgentAlert.instructor}</div>
        </div>
      </div>

      <div style="background:${cfg.bg};border-radius:14px;padding:14px 16px;margin-bottom:16px;text-align:center;">
        <div style="font-size:1.05rem;font-weight:800;color:${cfg.color};font-family:var(--font-heading);">
          ${isCancelled
            ? "🏠 No need to drive in for this class!"
            : "💻 You can attend from home!"}
        </div>
        ${urgentAlert.status === "virtual" && urgentAlert.zoomLink
          ? `<a href="${urgentAlert.zoomLink}" target="_blank" rel="noopener" style="
              display:inline-block;margin-top:10px;
              background:#6366f1;color:white;
              padding:8px 20px;border-radius:20px;
              font-size:0.85rem;font-weight:700;
              text-decoration:none;
            ">🎥 Join Zoom Meeting</a>`
          : ""}
      </div>

      <button id="urgent-modal-close" style="
        width:100%;padding:12px;border:none;
        background:rgba(255,255,255,0.08);
        color:#94a3b8;font-family:var(--font-heading);font-size:0.9rem;font-weight:700;
        border-radius:12px;cursor:pointer;
      ">Got it — Dismiss</button>
    </div>
  `;
  modal.innerHTML = body_html;
  document.body.appendChild(modal);

  // Wire up buttons
  document.getElementById("ub-details-btn")?.addEventListener("click", () => {
    modal.style.display = "flex";
  });
  document.getElementById("ub-close")?.addEventListener("click", () => {
    banner.remove();
    modal.remove();
  });
  document.getElementById("urgent-modal-close")?.addEventListener("click", () => {
    modal.style.display = "none";
  });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
}

// ─── Task 3.01 — Big Status Card (Next Class) ────────────────────────────────

function renderStatusCard(data) {
  const card = document.getElementById("main-card");
  if (!card) return;

  const { shouldCommute, urgentAlert, nextClass, eta } = data;

  if (!nextClass) {
    card.style.background = STATUS_CONFIG["in-person"].gradient;
    card.innerHTML = `
      <div class="card-badge">✅ All Done!</div>
      <h2 class="card-heading">No More Classes</h2>
      <p class="card-sub">Enjoy your evening 🎉</p>
    `;
    return;
  }

  const cfg = STATUS_CONFIG[nextClass.status];
  card.style.background = cfg.gradient;

  const minsUntil = minutesUntil(nextClass.startTime);
  const etaText = eta?.isFallback
    ? `~${eta.durationMinutes} min (est.)`
    : `${eta.durationMinutes} min drive`;
  const shouldLeaveIn = Math.max(0, minsUntil - (eta?.durationMinutes ?? 35));
  const reason = cleanReason(nextClass.statusReason);

  card.innerHTML = `
    <div class="card-badge">${cfg.emoji} ${cfg.label}</div>
    <h2 class="card-heading">${nextClass.code}</h2>
    <p class="card-sub">${nextClass.name}</p>

    <div class="card-time-row">
      <span>⏰ ${formatTime(nextClass.startTime)} – ${formatTime(nextClass.endTime)}</span>
      <span>📍 ${nextClass.location}</span>
    </div>

    ${
      nextClass.status === "in-person"
        ? `<div class="card-eta-chip">
            🚗 ${etaText} &nbsp;·&nbsp;
            ${shouldLeaveIn > 0 ? `Leave in <strong>${shouldLeaveIn} min</strong>` : "<strong>Leave now!</strong>"}
           </div>`
        : nextClass.status === "virtual" && nextClass.zoomLink
        ? `<a href="${nextClass.zoomLink}" target="_blank" rel="noopener" class="card-zoom-btn">🎥 Join Zoom</a>`
        : ""
    }

    ${reason ? `
    <div class="card-reason">
      <span class="card-reason-label">📣 ${sourceLabel(nextClass.statusSource)}</span>
      <span class="card-reason-text">"${reason}"</span>
    </div>` : ""}

    <div class="card-location">${
      nextClass.status === "cancelled"
        ? "📛 Class cancelled — no need to drive!"
        : nextClass.status === "virtual"
        ? "💻 Attend from home"
        : `👣 Head to ${nextClass.location}`
    }</div>
  `;
}

// ─── Task 3.03 — Traffic & ETA Display ───────────────────────────────────────

function renderETAWidget(data) {
  const old = document.getElementById("eta-widget");
  if (old) old.remove();

  const { eta, nextClass, shouldCommute } = data;
  if (!eta) return;

  const widget = document.createElement("div");
  widget.id = "eta-widget";

  const upcoming = data.schedule.filter((c) => new Date(c.endTime) > getSimNow());
  const nextInPerson = upcoming.find((c) => c.status === "in-person");
  const minsUntilNext = nextInPerson ? minutesUntil(nextInPerson.startTime) : null;
  const shouldLeaveIn = minsUntilNext !== null
    ? Math.max(0, minsUntilNext - (eta.durationMinutes ?? 35))
    : null;

  const commuteNeeded = shouldCommute;
  const etaColor = commuteNeeded ? "#f97316" : "#10b981";
  const etaLabel = commuteNeeded ? "Drive to Campus" : "No Drive Needed";

  widget.innerHTML = `
    <div class="eta-header">
      <span class="eta-title">🚗 Traffic & ETA</span>
      <span class="eta-live-dot"></span>
    </div>
    <div class="eta-grid">
      <div class="eta-cell">
        <div class="eta-cell-label">Drive Time</div>
        <div class="eta-cell-value" style="color:${etaColor}">${eta.durationMinutes} <span class="eta-unit">min</span></div>
      </div>
      <div class="eta-cell">
        <div class="eta-cell-label">Distance</div>
        <div class="eta-cell-value" style="color:${etaColor}">${eta.distanceMiles} <span class="eta-unit">mi</span></div>
      </div>
      <div class="eta-cell">
        <div class="eta-cell-label">Status</div>
        <div class="eta-cell-value" style="font-size:0.85rem;color:${etaColor};">${commuteNeeded ? "🚦 Go" : "🏠 Stay"}</div>
      </div>
    </div>
    ${commuteNeeded && nextInPerson ? `
    <div class="eta-leave-banner" style="border-color:${etaColor}">
      <span class="eta-leave-icon">🕐</span>
      <div>
        <div class="eta-leave-title">${shouldLeaveIn > 0 ? `Leave in ${shouldLeaveIn} min` : "Leave right now!"}</div>
        <div class="eta-leave-sub">to reach ${nextInPerson.code} by ${formatTime(nextInPerson.startTime)}</div>
      </div>
    </div>` : `
    <div class="eta-no-drive">
      <span>🏠</span>
      <div>
        <div class="eta-leave-title">No commute needed today</div>
        <div class="eta-leave-sub">All remaining classes are ${upcoming.length === 0 ? "done" : "cancelled or virtual"}</div>
      </div>
    </div>`}
    ${eta.isFallback ? `<div class="eta-fallback">⚠ Estimated (traffic API offline)</div>` : ""}
  `;

  // Insert into home-widgets
  const homeWidgets = document.getElementById("home-widgets");
  if (homeWidgets) {
    homeWidgets.appendChild(widget);
  } else {
    const scheduleList = document.getElementById("schedule-list");
    const nav = document.querySelector(".bottom-nav");
    const insertBefore = scheduleList ?? nav;
    if (insertBefore) insertBefore.parentElement.insertBefore(widget, insertBefore);
  }
}

// ─── Task 3.02 — Day's Schedule Overview ─────────────────────────────────────

function renderScheduleList(data) {
  document.getElementById("schedule-list")?.remove();

  const nav = document.querySelector(".bottom-nav");
  if (!nav) return;

  const now = getSimNow();

  const wrapper = document.createElement("div");
  wrapper.id = "schedule-list";
  wrapper.innerHTML = `
    <div class="sl-header">
      <h3 class="sl-title">Today's Schedule</h3>
      <span class="sl-count">${data.schedule.length} classes</span>
    </div>
    <div class="sl-items">
      ${data.schedule.map((c) => {
        const cfg = STATUS_CONFIG[c.status];
        const isPast = new Date(c.endTime) < now;
        const isActive = new Date(c.startTime) <= now && new Date(c.endTime) >= now;
        const reason = cleanReason(c.statusReason);
        const src = sourceLabel(c.statusSource);

        return `
          <div class="sl-item ${isPast ? "is-past" : ""} ${isActive ? "is-active" : ""}"
               style="border-left:3px solid ${cfg.color}"
               data-id="${c.id}">

            <div class="sl-item-main">
              <div class="sl-time">
                <span>${formatTime(c.startTime)}</span>
                <span class="sl-end-time">${formatTime(c.endTime)}</span>
              </div>
              <div class="sl-info">
                <span class="sl-code">${c.code}</span>
                <span class="sl-name">${c.name}</span>
                ${isActive ? `<span class="sl-now-badge">NOW</span>` : ""}
              </div>
              <div class="sl-badge" style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border}">
                ${cfg.emoji} ${cfg.label}
              </div>
            </div>

            ${(c.status === "cancelled" || c.status === "virtual") && reason ? `
            <div class="sl-reason" style="border-left:2px solid ${cfg.color};">
              <div class="sl-reason-source">📣 ${src}</div>
              <div class="sl-reason-text">"${reason}"</div>
              ${c.status === "virtual" && c.zoomLink
                ? `<a href="${c.zoomLink}" target="_blank" rel="noopener" class="sl-zoom-link" style="color:${cfg.color}">🎥 Join Zoom →</a>`
                : ""}
            </div>` : ""}

          </div>
        `;
      }).join("")}
    </div>
  `;

  const homeWidgets = document.getElementById("home-widgets");
  if (homeWidgets) {
    homeWidgets.appendChild(wrapper);
  } else {
    nav.parentElement.insertBefore(wrapper, nav);
  }
}

// ─── Animate Car ─────────────────────────────────────────────────────────────

function animateCar(shouldCommute) {
  const car = document.querySelector(".car-container");
  if (!car) return;
  if (shouldCommute) {
    car.style.animation =
      "car-bounce 0.8s infinite alternate ease-in-out, car-drive 8s linear infinite";
    car.style.opacity = "1";
  } else {
    car.style.animation = "car-bounce 1.6s infinite alternate ease-in-out";
    car.style.opacity = "0.5";
  }
}

// ─── Loading State ────────────────────────────────────────────────────────────

function showLoading() {
  const card = document.getElementById("main-card");
  if (card) {
    card.style.background =
      "linear-gradient(135deg, hsl(350,85%,45%), hsl(340,85%,40%))";
    card.innerHTML = `
      <div class="card-badge">⏳ Loading…</div>
      <h2 class="card-heading" style="font-size:1.5rem">Fetching your schedule</h2>
      <p class="card-sub">Checking Canvas &amp; email…</p>
    `;
  }
  document.getElementById("eta-widget")?.remove();
  document.getElementById("schedule-list")?.remove();
}

// ─── Inject All Styles ────────────────────────────────────────────────────────

function injectStyles() {
  if (document.getElementById("phase3-styles")) return;
  const style = document.createElement("style");
  style.id = "phase3-styles";
  style.textContent = `
    /* ── Greeting ── */
    .greeting-sub {
      font-family: var(--font-base);
      font-size: 0.85rem;
      color: var(--text-muted);
      margin-top: 4px;
      font-weight: 500;
    }

    /* ── Urgent Banner ── */
    .ub-text { flex: 1; }
    .ub-details-btn {
      background: rgba(255,255,255,0.2); border: 1px solid rgba(255,255,255,0.4); color: white;
      font-family: var(--font-heading); font-size: 0.75rem; font-weight: 700; border-radius: 12px;
      padding: 6px 12px; cursor: pointer; transition: background 0.2s, transform 0.1s;
    }
    .ub-details-btn:hover { background: rgba(255,255,255,0.3); transform: scale(1.05); }
    .ub-close {
      background: transparent; border: none; color: rgba(255,255,255,0.7); font-size: 1.1rem;
      cursor: pointer; padding: 4px; transition: color 0.2s, transform 0.1s;
      display: flex; align-items: center; justify-content: center;
    }
    .ub-close:hover { color: white; transform: scale(1.1); }

    /* ── Main Card ── */
    #main-card {
      width: 90%;
      max-width: 480px;
      min-height: 260px;
      border-radius: 28px;
      box-shadow: 0 20px 50px -10px rgba(0,0,0,0.35);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0;
      padding: 24px 20px;
      z-index: 5;
      transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), background 0.5s;
      position: relative;
    }
    #main-card:hover { transform: translateY(-6px) scale(1.015); }
    .card-badge {
      font-size: 0.8rem; font-weight: 800;
      background: rgba(255,255,255,0.2); padding: 4px 14px;
      border-radius: 20px; color: white; margin-bottom: 12px;
      letter-spacing: .04em;
    }
    .card-heading {
      color: white; font-family: var(--font-heading);
      font-size: 2rem; font-weight: 800; text-align: center;
      line-height: 1.1; text-shadow: 0 2px 12px rgba(0,0,0,0.2);
      margin-bottom: 4px;
    }
    .card-sub { color: rgba(255,255,255,0.85); font-size:0.9rem; text-align:center; margin-bottom:10px; }
    .card-time-row {
      display: flex; flex-wrap: wrap; gap: 10px;
      color: rgba(255,255,255,0.9); font-size: 0.8rem; font-weight: 600;
      margin-bottom: 12px; justify-content: center;
    }
    .card-eta-chip {
      background: rgba(255,255,255,0.2); padding: 7px 18px;
      border-radius: 20px; color: white; font-size: 0.85rem; font-weight: 700;
      margin-bottom: 10px;
    }
    .card-zoom-btn {
      background: white; color: #6366f1; padding: 8px 22px;
      border-radius: 20px; font-size: 0.9rem; font-weight: 800;
      text-decoration: none; display: inline-block;
      transition: transform .2s; margin-bottom: 10px;
    }
    .card-zoom-btn:hover { transform: scale(1.05); }
    .card-reason {
      display: flex; flex-direction: column; gap: 3px;
      background: rgba(0,0,0,0.2); border-radius: 12px;
      padding: 10px 14px; margin-top: 4px; margin-bottom: 10px;
      max-width: 100%; text-align: left;
    }
    .card-reason-label {
      font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: .1em; color: rgba(255,255,255,0.6);
    }
    .card-reason-text {
      font-size: 0.8rem; color: rgba(255,255,255,0.9); line-height: 1.4;
      font-style: italic;
    }
    .card-location {
      font-size: 0.85rem; color: rgba(255,255,255,0.85); font-weight: 600;
      text-align: center; padding-top: 4px;
    }

    /* ── ETA Widget ── */
    #eta-widget {
      margin: 0 24px 16px;
      background: var(--bg-glass);
      backdrop-filter: var(--glass-blur);
      border-radius: 20px;
      padding: 18px 20px;
      box-shadow: var(--shadow-sm);
      border: 1px solid rgba(0,0,0,0.05);
    }
    .eta-header {
      display: flex; align-items: center; gap: 8px;
      margin-bottom: 16px;
    }
    .eta-title {
      font-family: var(--font-heading); font-size: 0.8rem;
      font-weight: 800; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .08em; flex: 1;
    }
    .eta-live-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 0 0 rgba(16,185,129,0.4);
      animation: pulse-dot 1.5s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%   { box-shadow: 0 0 0 0   rgba(16,185,129,0.4); }
      70%  { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
      100% { box-shadow: 0 0 0 0   rgba(16,185,129,0); }
    }
    .eta-grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;
      margin-bottom: 16px;
    }
    .eta-cell {
      background: rgba(0,0,0,0.04); border-radius: 12px;
      padding: 14px 10px; text-align: center;
    }
    .eta-cell-label {
      font-size: 0.6rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: var(--text-muted); margin-bottom: 4px;
    }
    .eta-cell-value {
      font-family: var(--font-heading); font-size: 1.4rem; font-weight: 800;
    }
    .eta-unit { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); }
    .eta-leave-banner, .eta-no-drive {
      display: flex; align-items: center; gap: 12px;
      background: rgba(249,115,22,0.08);
      border: 1px solid rgba(249,115,22,0.2);
      border-radius: 14px; padding: 14px 18px;
    }
    .eta-no-drive {
      background: rgba(16,185,129,0.08);
      border-color: rgba(16,185,129,0.2);
    }
    .eta-leave-icon { font-size: 1.5rem; }
    .eta-leave-title {
      font-family: var(--font-heading); font-size: 0.9rem;
      font-weight: 800; color: var(--text-primary);
    }
    .eta-leave-sub { font-size: 0.72rem; color: var(--text-muted); margin-top: 2px; }
    .eta-fallback {
      font-size: 0.7rem; color: var(--text-muted); text-align: center;
      margin-top: 8px; font-style: italic;
    }

    /* ── Schedule List ── */
    #schedule-list {
      padding: 0 24px 24px;
      max-height: 400px;
      overflow-y: auto;
      scroll-behavior: smooth;
    }
    #schedule-list::-webkit-scrollbar { width: 3px; }
    #schedule-list::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
    .sl-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px; padding: 0 2px;
    }
    .sl-title {
      font-family: var(--font-heading); font-size: 0.8rem;
      font-weight: 800; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: .08em;
    }
    .sl-count {
      font-size: 0.7rem; font-weight: 700; color: var(--text-muted);
      background: rgba(0,0,0,0.05); padding: 2px 10px; border-radius: 20px;
    }
    .sl-items { display: flex; flex-direction: column; gap: 12px; }
    .sl-item {
      background: var(--bg-glass);
      backdrop-filter: var(--glass-blur);
      border-radius: 14px; padding: 14px 16px;
      cursor: default;
      transition: transform 0.2s;
    }
    .sl-item:hover { transform: translateX(3px); }
    .sl-item.is-past { opacity: 0.38; }
    .sl-item.is-active {
      background: rgba(255,255,255,0.97);
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    }
    .sl-item-main {
      display: flex; align-items: center; gap: 10px;
    }
    .sl-time {
      display: flex; flex-direction: column; gap: 1px;
      min-width: 52px;
    }
    .sl-time span:first-child {
      font-size: 0.8rem; font-weight: 800; color: var(--text-primary);
    }
    .sl-end-time { font-size: 0.65rem; color: var(--text-muted); }
    .sl-info { flex: 1; display: flex; flex-direction: column; gap: 1px; }
    .sl-code {
      font-family: var(--font-heading); font-size: 0.85rem;
      font-weight: 800; color: var(--text-primary);
    }
    .sl-name {
      font-size: 0.75rem; color: var(--text-muted);
      line-height: 1.3; margin-top: 2px;
    }
    .sl-now-badge {
      display: inline-block; font-size: 0.55rem; font-weight: 900;
      background: #ef4444; color: white; padding: 1px 6px;
      border-radius: 20px; letter-spacing: .08em; margin-top: 2px;
    }
    .sl-badge {
      font-size: 0.68rem; font-weight: 800; padding: 4px 10px;
      border-radius: 20px; white-space: nowrap;
    }

    /* Reason snippet inside schedule card */
    .sl-reason {
      margin-top: 12px; padding: 12px 14px;
      background: rgba(0,0,0,0.03); border-radius: 8px;
      display: flex; flex-direction: column; gap: 6px;
    }
    .sl-reason-source {
      font-size: 0.6rem; font-weight: 800; text-transform: uppercase;
      letter-spacing: .1em; color: var(--text-muted);
    }
    .sl-reason-text {
      font-size: 0.78rem; color: var(--text-primary);
      line-height: 1.4; font-style: italic;
    }
    .sl-zoom-link {
      font-size: 0.75rem; font-weight: 700; text-decoration: none;
      margin-top: 4px; display: inline-block;
    }
    .sl-zoom-link:hover { text-decoration: underline; }

    /* ── Keyframes ── */
    @keyframes slide-down {
      from { transform: translateY(-100%); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    @keyframes modal-up {
      from { transform: translateY(40px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
    @keyframes car-drive {
      0%   { left: -20%; }
      100% { left: 120%; }
    }

    /* ── Settings View ── */
    #view-settings { padding: 24px; padding-bottom: 100px; }
    .settings-group { margin-bottom: 24px; }
    .settings-group-title { font-family: var(--font-heading); font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.1em; margin-bottom: 12px; }
    .settings-item { display: flex; justify-content: space-between; align-items: center; background: var(--bg-glass); backdrop-filter: var(--glass-blur); padding: 16px; border-radius: 12px; margin-bottom: 10px; border: 1px solid rgba(0,0,0,0.05); }
    .settings-label { display: flex; flex-direction: column; gap: 4px; }
    .settings-label strong { font-size: 0.95rem; color: var(--text-primary); }
    .settings-label span { font-size: 0.75rem; color: var(--text-muted); }
    
    /* Toggle switch */
    .toggle-switch { position: relative; display: inline-block; width: 44px; height: 24px; }
    .toggle-switch input { opacity: 0; width: 0; height: 0; }
    .slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .4s; border-radius: 24px; }
    .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background-color: white; transition: .4s; border-radius: 50%; }
    input:checked + .slider { background-color: #fca5a5; }
    input:checked + .slider:before { transform: translateX(20px); }
    body.dark-mode input:checked + .slider { background-color: #e11d48; }

    /* Buttons */
    .settings-btn { width: 100%; padding: 14px; background: rgba(0,0,0,0.05); border: none; border-radius: 12px; font-family: var(--font-heading); font-size: 0.9rem; font-weight: 700; color: var(--text-primary); cursor: pointer; margin-bottom: 10px; transition: background 0.2s; }
    .settings-btn:hover { background: rgba(0,0,0,0.1); }
    .settings-btn.btn-danger { color: #ef4444; background: rgba(239,68,68,0.1); }
    .settings-btn.btn-danger:hover { background: rgba(239,68,68,0.2); }
    body.dark-mode .settings-btn { background: rgba(255,255,255,0.05); }
    body.dark-mode .settings-btn:hover { background: rgba(255,255,255,0.1); }

    /* Dark Mode Widget Overrides */
    body.dark-mode .eta-cell { background: rgba(255,255,255,0.05); }
    body.dark-mode #eta-widget { border-color: rgba(255,255,255,0.05); }
    body.dark-mode .sl-count { background: rgba(255,255,255,0.1); }
    body.dark-mode .sl-item.is-active { background: rgba(255,255,255,0.05); box-shadow: 0 4px 16px rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); }
    body.dark-mode .sl-reason { background: rgba(255,255,255,0.03); }
    body.dark-mode .card-zoom-btn { background: rgba(255,255,255,0.1); color: #818cf8; }
    body.dark-mode .eta-leave-banner { background: rgba(249,115,22,0.15); border-color: rgba(249,115,22,0.3); }
    body.dark-mode .eta-no-drive { background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.3); }
  `;
  document.head.appendChild(style);
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

let lastData = null;

async function boot(forceRefetch = true) {
  injectStyles();
  if (forceRefetch) showLoading();

  try {
    let data;
    if (forceRefetch) {
      const qs = simTime ? `?simTime=${encodeURIComponent(simTime)}` : "";
      const resp = await fetch(`${WORKER_URL}/api/dashboard${qs}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      data = await resp.json();
      lastData = data;
    } else {
      data = lastData;
    }

    renderHeader(data);
    renderStatusCard(data);
    renderETAWidget(data);
    renderScheduleList(data);
    animateCar(data.shouldCommute);
    showUrgentAlert(data.urgentAlert);

    console.log(`[Arcadia] Phase 3 dashboard loaded (simTime=${simTime ?? "real"})`, data);
  } catch (err) {
    console.error("[Arcadia] Boot failed:", err);
    const card = document.getElementById("main-card");
    if (card) {
      card.style.background = "linear-gradient(135deg, #ef4444, #b91c1c)";
      card.innerHTML = `
        <div class="card-badge">⚠️ Error</div>
        <h2 class="card-heading" style="font-size:1.4rem">Could not load data</h2>
        <p class="card-sub">${err.message}</p>
      `;
    }
  }
}

// ─── Debug: Time Travel Panel ─────────────────────────────────────────────────

const TIME_PRESETS = [
  { label: "8:30 AM",  value: "08:30", note: "Before classes" },
  { label: "9:30 AM",  value: "09:30", note: "CS 101 🏫" },
  { label: "10:30 AM", value: "10:30", note: "Between classes" },
  { label: "11:30 AM", value: "11:30", note: "CS 202 🚫" },
  { label: "1:00 PM",  value: "13:00", note: "Before CS 315" },
  { label: "2:30 PM",  value: "14:30", note: "CS 315 💻" },
  { label: "4:00 PM",  value: "16:00", note: "Before CS 420" },
  { label: "5:00 PM",  value: "17:00", note: "CS 420 🏫" },
  { label: "6:30 PM",  value: "18:30", note: "All done" },
];

function createDebugPanel() {
  const style = document.createElement("style");
  style.textContent = `
    #debug-panel { position:fixed;bottom:120px;right:16px;z-index:500;font-family:var(--font-heading); }
    #debug-toggle {
      width:44px;height:44px;border-radius:50%;
      background:#1e293b;color:#facc15;border:none;font-size:1.2rem;
      cursor:pointer;box-shadow:0 6px 16px rgba(0,0,0,0.25);
      display:flex;align-items:center;justify-content:center;
      margin-left:auto;transition:transform .2s;
    }
    #debug-toggle:hover { transform:scale(1.1) rotate(20deg); }
    #debug-drawer {
      display:none;flex-direction:column;gap:6px;
      background:rgba(15,23,42,0.97);backdrop-filter:blur(16px);
      border:1px solid rgba(255,255,255,0.08);border-radius:16px;
      padding:16px 14px;margin-bottom:10px;min-width:220px;
      box-shadow:0 20px 40px rgba(0,0,0,0.5);
    }
    #debug-drawer.open { display:flex; }
    .dbg-title { font-size:.7rem;font-weight:800;color:#facc15;text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px; }
    .dbg-clock { font-size:1.1rem;font-weight:700;color:white;text-align:center;background:rgba(255,255,255,0.05);border-radius:8px;padding:6px;margin-bottom:4px; }
    .dbg-btn { display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.07);border-radius:8px;padding:7px 10px;cursor:pointer;transition:background .15s,transform .15s;width:100%;text-align:left; }
    .dbg-btn:hover { background:rgba(255,255,255,0.12);transform:translateX(-2px); }
    .dbg-btn.active { background:rgba(250,204,21,0.15);border-color:#facc15; }
    .dbg-time { font-size:.8rem;font-weight:700;color:white; }
    .dbg-note { font-size:.65rem;color:#94a3b8; }
    .dbg-divider { height:1px;background:rgba(255,255,255,0.06);margin:4px 0; }
    .dbg-real-btn { background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#f87171;font-size:.75rem;font-weight:700;border-radius:8px;padding:7px 10px;cursor:pointer;width:100%;transition:background .15s; }
    .dbg-real-btn:hover { background:rgba(239,68,68,0.2); }
    .dbg-custom-row { display:flex;gap:6px;align-items:center; }
    .dbg-input { flex:1;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);border-radius:8px;color:white;font-family:var(--font-heading);font-size:.8rem;padding:6px 8px;outline:none; }
    .dbg-go-btn { background:#facc15;color:#1e293b;font-weight:800;font-size:.75rem;border:none;border-radius:8px;padding:6px 10px;cursor:pointer; }
  `;
  document.head.appendChild(style);

  const panel = document.createElement("div");
  panel.id = "debug-panel";

  const drawer = document.createElement("div");
  drawer.id = "debug-drawer";
  drawer.innerHTML = `<div class="dbg-title">⏰ Time Travel</div>`;

  const clock = document.createElement("div");
  clock.className = "dbg-clock";
  drawer.appendChild(clock);

  function refreshClock() {
    const now = getSimNow();
    clock.textContent =
      now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }) +
      (simTime ? " ⏱" : " 🔴");
  }
  refreshClock();
  setInterval(refreshClock, 1000);

  TIME_PRESETS.forEach(({ label, value, note }) => {
    const btn = document.createElement("button");
    btn.className = "dbg-btn";
    btn.dataset.simTime = value;
    btn.innerHTML = `<span class="dbg-time">${label}</span><span class="dbg-note">${note}</span>`;
    btn.addEventListener("click", async () => {
      simTime = value;
      document.querySelectorAll(".dbg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      refreshClock();
      await boot(true);
    });
    drawer.appendChild(btn);
  });

  const div1 = document.createElement("div");
  div1.className = "dbg-divider";
  drawer.appendChild(div1);

  const customRow = document.createElement("div");
  customRow.className = "dbg-custom-row";
  const input = document.createElement("input");
  input.type = "time";
  input.className = "dbg-input";
  const goBtn = document.createElement("button");
  goBtn.className = "dbg-go-btn";
  goBtn.textContent = "Go";
  goBtn.addEventListener("click", async () => {
    if (!input.value) return;
    simTime = input.value;
    document.querySelectorAll(".dbg-btn").forEach((b) => b.classList.remove("active"));
    refreshClock();
    await boot(true);
  });
  customRow.appendChild(input);
  customRow.appendChild(goBtn);
  drawer.appendChild(customRow);

  const div2 = document.createElement("div");
  div2.className = "dbg-divider";
  drawer.appendChild(div2);

  const realBtn = document.createElement("button");
  realBtn.className = "dbg-real-btn";
  realBtn.textContent = "↩ Reset to Real Time";
  realBtn.addEventListener("click", async () => {
    simTime = null;
    input.value = "";
    document.querySelectorAll(".dbg-btn").forEach((b) => b.classList.remove("active"));
    refreshClock();
    await boot(true);
  });
  drawer.appendChild(realBtn);

  const toggle = document.createElement("button");
  toggle.id = "debug-toggle";
  toggle.textContent = "⏱";
  toggle.title = "Time Travel Debug";
  toggle.addEventListener("click", () => drawer.classList.toggle("open"));

  panel.appendChild(drawer);
  panel.appendChild(toggle);
  document.body.appendChild(panel);
}

// ─── Phase 6: Settings & Navigation ──────────────────────────────────────────

function initSettings() {
  const applyDarkMode = () => {
    const isDark = localStorage.getItem("setting-dark") === "true";
    if (isDark) document.body.classList.add("dark-mode");
    else document.body.classList.remove("dark-mode");
  };

  const settings = ["24hr", "dark", "push", "sms"];
  settings.forEach((k) => {
    const el = document.getElementById(`setting-${k}`);
    if (!el) return;
    el.checked = localStorage.getItem(`setting-${k}`) === "true";
    el.addEventListener("change", (e) => {
      localStorage.setItem(`setting-${k}`, e.target.checked);
      if (k === "dark") applyDarkMode();
      if (k === "24hr") {
        if (lastData) { // re-render with new time format
          renderHeader(lastData);
          renderStatusCard(lastData);
          renderETAWidget(lastData);
          renderScheduleList(lastData);
        }
      }
    });
  });

  applyDarkMode();

  const commuteTimeEl = document.getElementById("setting-commute-time");
  if (commuteTimeEl) {
    const savedTime = localStorage.getItem("setting-commute-time");
    if (savedTime !== null) commuteTimeEl.value = savedTime;
    
    commuteTimeEl.addEventListener("change", (e) => {
      let val = parseInt(e.target.value, 10);
      if (isNaN(val) || val < 0) val = 0;
      localStorage.setItem("setting-commute-time", val);
      e.target.value = val;
    });
  }

  document.getElementById("btn-clear-data")?.addEventListener("click", () => {
    if (confirm("Clear all local settings?")) {
      localStorage.clear();
      location.reload();
    }
  });

  document.getElementById("btn-logout")?.addEventListener("click", () => {
    alert("Logged out successfully");
  });

  // Wiring up Bottom Navigation
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      
      const targetId = item.id;
      if (targetId === "nav-alerts") {
        alert("Alerts feed under construction (Task 5.01)!");
        return; 
      }

      document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
      item.classList.add("active");

      document.getElementById("view-home").style.display = targetId === "nav-home" ? "block" : "none";
      document.getElementById("view-settings").style.display = targetId === "nav-settings" ? "block" : "none";
      const viewAccount = document.getElementById("view-account");
      if (viewAccount) {
        viewAccount.style.display = targetId === "nav-account" ? "block" : "none";
      }
    });
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initAll() {
  initSettings();
  await boot();
  createDebugPanel();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAll);
} else {
  initAll();
}
