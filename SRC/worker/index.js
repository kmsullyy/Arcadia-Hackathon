/**
 * worker/index.js — Arcadia Commuter Assistant Cloudflare Worker
 * Task 2.05: Exposes a secure /api/* surface for the frontend.
 *
 * Deploy with: npx wrangler deploy
 * Local dev:   npx wrangler dev
 *
 * NOTE: The mock data is inlined here so the Worker is self-contained.
 * In production, Task 2.01 / 2.02 data would come from:
 *   - Canvas OAuth2 API (course + announcements)
 *   - Gmail/Outlook API via a stored OAuth token in KV
 */

// ─── CORS helper ─────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*", // Lock this to your domain in production
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Content-Type": "application/json",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: CORS_HEADERS,
  });
}

function error(message, status = 400) {
  return json({ error: message }, status);
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Pre-flight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── GET /api/dashboard ──────────────────────────────────────────────────
    if (url.pathname === "/api/dashboard" && request.method === "GET") {
      try {
        const payload = await buildDashboard(env, url);
        return json(payload);
      } catch (err) {
        return error(`Dashboard build failed: ${err.message}`, 500);
      }
    }

    // ── GET /api/schedule ───────────────────────────────────────────────────
    if (url.pathname === "/api/schedule" && request.method === "GET") {
      const schedule = getMockSchedule();
      return json({ schedule });
    }

    // ── GET /api/eta ────────────────────────────────────────────────────────
    if (url.pathname === "/api/eta" && request.method === "GET") {
      const originLat = parseFloat(url.searchParams.get("originLat") ?? "39.9526");
      const originLng = parseFloat(url.searchParams.get("originLng") ?? "-75.1652");
      // Always routes to Arcadia campus
      const eta = await fetchOSRM(originLat, originLng, 40.1017, -75.1546);
      return json(eta);
    }

    // ── GET /api/health ─────────────────────────────────────────────────────
    if (url.pathname === "/api/health") {
      return json({ status: "ok", ts: new Date().toISOString() });
    }

    // ── Static assets (index.html, JS, CSS, images) ─────────────────────────
    // Cloudflare passes all non-API requests to the ASSETS bucket automatically.
    // This explicit fallthrough handles any edge cases.
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return error("Not Found", 404);
  },
};

// ─── Dashboard Builder ────────────────────────────────────────────────────────

async function buildDashboard(env, url) {
  // Allow time-travel via ?simTime=HH:MM (e.g. ?simTime=10:30)
  const simTimeParam = url?.searchParams.get("simTime");
  const now = parseSimTime(simTimeParam);

  const schedule = enrichSchedule(getMockSchedule(), getMockEmails());
  schedule.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  const upcoming = schedule.filter((c) => new Date(c.endTime) > now);
  const nextClass = upcoming[0] ?? null;
  const urgentAlert =
    upcoming.find((c) => c.status === "cancelled" || c.status === "virtual") ?? null;
  const shouldCommute = upcoming.some((c) => c.status === "in-person");

  const eta = await fetchOSRM(39.9526, -75.1652, 40.1017, -75.1546);

  return {
    schedule,
    nextClass,
    urgentAlert,
    eta,
    shouldCommute,
    student: { name: "Kevin Sullivan", email: "ksullivan@arcadia.edu" },
    campus: { name: "Arcadia University", address: "450 S Easton Rd, Glenside, PA" },
    generatedAt: now.toISOString(),
    simulatedTime: simTimeParam ?? null,
  };
}

// Parse "HH:MM" into a Date set to today at that time.
// Returns real Date.now() if param is missing or invalid.
function parseSimTime(param) {
  if (!param) return new Date();
  const match = param.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return new Date();
  const d = new Date();
  d.setHours(parseInt(match[1], 10), parseInt(match[2], 10), 0, 0);
  return d;
}

// ─── Keyword Matching ─────────────────────────────────────────────────────────

const CANCEL_KW = ["cancelled", "canceled", "no class", "class is off", "cancellation", "not meeting", "will not meet"];
const VIRTUAL_KW = ["virtual", "zoom", "online", "remote", "teams", "google meet", "webex", "held online", "online session"];

function hasKeyword(text, list) {
  const t = text.toLowerCase();
  return list.some((kw) => t.includes(kw));
}

function extractZoom(text) {
  const m = text.match(/https?:\/\/[^\s]+zoom[^\s]*/i);
  return m ? m[0] : null;
}

function enrichSchedule(courses, emails) {
  const emailMap = new Map();
  for (const e of emails) {
    if (!e.courseCode) continue;
    const t = `${e.subject} ${e.body}`;
    if (hasKeyword(t, CANCEL_KW)) emailMap.set(e.courseCode, { status: "cancelled", text: t });
    else if (hasKeyword(t, VIRTUAL_KW) && !emailMap.has(e.courseCode))
      emailMap.set(e.courseCode, { status: "virtual", text: t });
  }

  return courses.map((c) => {
    let status = "in-person", source = null, zoomLink = null, statusReason = null;

    for (const ann of c.announcements ?? []) {
      const t = `${ann.title} ${ann.body}`;
      if (hasKeyword(t, CANCEL_KW)) {
        status = "cancelled"; source = "canvas";
        statusReason = ann.body.trim(); break;
      }
      if (hasKeyword(t, VIRTUAL_KW)) {
        status = "virtual"; source = "canvas";
        statusReason = ann.body.trim();
        zoomLink = extractZoom(t); break;
      }
    }

    if (status === "in-person" && emailMap.has(c.code)) {
      const sig = emailMap.get(c.code);
      status = sig.status; source = "email";
      statusReason = sig.text.trim();
      if (status === "virtual") zoomLink = extractZoom(sig.text);
    }

    return { ...c, status, statusSource: source, statusReason, zoomLink };
  });
}

// ─── OSRM ETA ─────────────────────────────────────────────────────────────────

async function fetchOSRM(oLat, oLng, dLat, dLng) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${oLng},${oLat};${dLng},${dLat}?overview=false`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data.code !== "Ok") throw new Error("bad OSRM response");
    const r = data.routes[0];
    return {
      durationSeconds: r.duration,
      durationMinutes: Math.ceil(r.duration / 60),
      distanceMeters: r.distance,
      distanceMiles: parseFloat((r.distance / 1609.34).toFixed(1)),
    };
  } catch {
    return { durationSeconds: 2100, durationMinutes: 35, distanceMeters: 24140, distanceMiles: 15.0, isFallback: true };
  }
}

// ─── Inline Mock Data (Worker self-contained) ─────────────────────────────────

function getMockSchedule() {
  const today = new Date();
  const t = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString(); };
  return [
    { id: "crs_101", name: "Introduction to Computer Science", code: "CS 101", instructor: "Dr. Patel", location: "Brubaker Hall 210", startTime: t(9, 0), endTime: t(10, 15), announcements: [] },
    { id: "crs_202", name: "Data Structures & Algorithms", code: "CS 202", instructor: "Prof. Kim", location: "Brubaker Hall 105", startTime: t(11, 0), endTime: t(12, 15), announcements: [{ id: "ann_001", title: "Class CANCELLED today", body: "Due to a conference, today's DS&A session is cancelled.", postedAt: t(7, 30) }] },
    { id: "crs_315", name: "Web Application Development", code: "CS 315", instructor: "Dr. Chen", location: "Knight Hall 302", startTime: t(14, 0), endTime: t(15, 15), announcements: [{ id: "ann_002", title: "Today's class is VIRTUAL — Zoom link inside", body: "Join Zoom: https://www.youtube.com/watch?v=xvFZjo5PgG0. Held online.", postedAt: t(8, 0) }] },
    { id: "crs_420", name: "Machine Learning Fundamentals", code: "CS 420", instructor: "Dr. Okoye", location: "Landman Library 101", startTime: t(16, 30), endTime: t(17, 45), announcements: [] },
  ];
}

function getMockEmails() {
  const today = new Date();
  const t = (h, m) => { const d = new Date(today); d.setHours(h, m, 0, 0); return d.toISOString(); };
  return [
    { id: "email_001", from: "prof.kim@arcadia.edu", subject: "CS 202 — Class Cancelled 3/28", body: "Today's Data Structures class is cancelled.", receivedAt: t(7, 28), courseCode: "CS 202" },
    { id: "email_002", from: "dr.chen@arcadia.edu", subject: "CS 315 Going Virtual Today", body: "Today's Web Dev session will be held virtually over Zoom. https://www.youtube.com/watch?v=xvFZjo5PgG0", receivedAt: t(7, 55), courseCode: "CS 315" },
    { id: "email_003", from: "registrar@arcadia.edu", subject: "Spring 2026 Registration Reminder", body: "Registration opens next Monday.", receivedAt: t(6, 0), courseCode: null },
  ];
}
