/**
 * api.js — Arcadia Commuter Assistant
 * Phase 2: Backend Logic Layer
 *
 * Task 2.02 — Email keyword scanner
 * Task 2.03 — Class status cross-reference engine
 * Task 2.04 — Traffic / ETA via OSRM (free, no API key required)
 * Task 2.05 — Unified API surface consumed by the frontend
 *
 * All data currently flows from mockData.js. When Cloudflare Workers are wired
 * in, swap `fetchSchedule()` and `fetchEmails()` to hit the Workers endpoints
 * instead of the local mock arrays.
 */

import {
  MOCK_CANVAS_COURSES,
  MOCK_EMAILS,
  MOCK_STUDENT,
  CAMPUS,
  CANCELLATION_KEYWORDS,
  VIRTUAL_KEYWORDS,
} from "./mockData.js";

// ─── Internals: simulated network delay ──────────────────────────────────────

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));

// ─── Task 2.01 — Canvas Schedule Fetch ───────────────────────────────────────

/**
 * Returns today's classes from the (mock) Canvas API.
 * @returns {Promise<CanvasCourse[]>}
 */
async function fetchSchedule() {
  await delay(250);
  return structuredClone(MOCK_CANVAS_COURSES);
}

// ─── Task 2.02 — Email Fetch & Keyword Scanner ───────────────────────────────

/**
 * Returns parsed emails from the (mock) inbox.
 * @returns {Promise<EmailMessage[]>}
 */
async function fetchEmails() {
  await delay(200);
  return structuredClone(MOCK_EMAILS);
}

/**
 * Scans a string for keyword matches from a given list.
 * @param {string} text
 * @param {string[]} keywords
 * @returns {string|null} — the matched keyword, or null
 */
function findKeyword(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.find((kw) => lower.includes(kw)) ?? null;
}

/**
 * Parses a list of emails and returns a map of courseCode → detected status.
 * @param {EmailMessage[]} emails
 * @returns {Map<string, 'cancelled'|'virtual'>}
 */
function parseEmailStatuses(emails) {
  const statusMap = new Map();

  for (const email of emails) {
    if (!email.courseCode) continue;
    const fullText = `${email.subject} ${email.body}`;

    if (findKeyword(fullText, CANCELLATION_KEYWORDS)) {
      statusMap.set(email.courseCode, "cancelled");
    } else if (findKeyword(fullText, VIRTUAL_KEYWORDS)) {
      // Don't override a stronger "cancelled" signal
      if (!statusMap.has(email.courseCode)) {
        statusMap.set(email.courseCode, "virtual");
      }
    }
  }

  return statusMap;
}

// ─── Task 2.03 — Cross-Reference Engine ──────────────────────────────────────

/**
 * @typedef {'in-person'|'cancelled'|'virtual'} ClassStatus
 *
 * @typedef {Object} EnrichedClass
 * @property {string} id
 * @property {string} name
 * @property {string} code
 * @property {string} instructor
 * @property {string} location
 * @property {string} startTime   — ISO string
 * @property {string} endTime     — ISO string
 * @property {ClassStatus} status
 * @property {string|null} statusSource — 'canvas' | 'email' | null
 * @property {string|null} zoomLink
 */

/**
 * Merges Canvas schedule with email keyword signals to produce enriched class objects.
 * Canvas announcements take precedence over email signals (professor's official channel).
 *
 * @returns {Promise<EnrichedClass[]>}
 */
export async function getEnrichedSchedule() {
  const [courses, emails] = await Promise.all([fetchSchedule(), fetchEmails()]);
  const emailStatuses = parseEmailStatuses(emails);

  return courses.map((course) => {
    let status = "in-person";
    let statusSource = null;
    let zoomLink = null;

    // 1️⃣  Check Canvas announcements first (highest priority)
    for (const ann of course.announcements) {
      const text = `${ann.title} ${ann.body}`;
      if (findKeyword(text, CANCELLATION_KEYWORDS)) {
        status = "cancelled";
        statusSource = "canvas";
        break;
      }
      if (findKeyword(text, VIRTUAL_KEYWORDS)) {
        status = "virtual";
        statusSource = "canvas";
        const match = ann.body.match(/https?:\/\/[^\s]+zoom[^\s]*/i);
        if (match) zoomLink = match[0];
        break;
      }
    }

    // 2️⃣  Fall back to email signals
    if (status === "in-person" && emailStatuses.has(course.code)) {
      status = emailStatuses.get(course.code);
      statusSource = "email";

      if (status === "virtual") {
        const relatedEmail = emails.find((e) => e.courseCode === course.code);
        if (relatedEmail) {
          const match = `${relatedEmail.subject} ${relatedEmail.body}`.match(
            /https?:\/\/[^\s]+zoom[^\s]*/i
          );
          if (match) zoomLink = match[0];
        }
      }
    }

    return {
      id: course.id,
      name: course.name,
      code: course.code,
      instructor: course.instructor,
      location: course.location,
      startTime: course.startTime,
      endTime: course.endTime,
      status,
      statusSource,
      zoomLink,
    };
  });
}

// ─── Task 2.04 — Traffic / ETA via OSRM (Free, no key needed) ───────────────

/**
 * Uses the public OSRM demo server to calculate driving duration + distance.
 * In production, self-host OSRM or swap for a routing service of choice.
 *
 * @param {number} originLat
 * @param {number} originLng
 * @param {number} destLat
 * @param {number} destLng
 * @returns {Promise<{durationSeconds: number, distanceMeters: number, durationMinutes: number, distanceMiles: number}>}
 */
export async function getDrivingETA(originLat, originLng, destLat, destLng) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?overview=false&alternatives=false`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OSRM HTTP ${resp.status}`);
    const data = await resp.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      throw new Error("OSRM returned no routes");
    }

    const route = data.routes[0];
    return {
      durationSeconds: route.duration,
      durationMinutes: Math.ceil(route.duration / 60),
      distanceMeters: route.distance,
      distanceMiles: parseFloat((route.distance / 1609.34).toFixed(1)),
    };
  } catch (err) {
    console.warn("[api] OSRM failed, using fallback ETA:", err.message);
    // Graceful mock fallback so UI never breaks
    return {
      durationSeconds: 2100,
      durationMinutes: 35,
      distanceMeters: 24140,
      distanceMiles: 15.0,
      isFallback: true,
    };
  }
}

// ─── Task 2.05 — Unified API Surface ─────────────────────────────────────────

/**
 * @typedef {Object} DashboardPayload
 * @property {EnrichedClass[]} schedule   — Full enriched day schedule
 * @property {EnrichedClass|null} nextClass — The next upcoming class
 * @property {EnrichedClass|null} urgentAlert — Cancelled/virtual class that hasn't started yet
 * @property {Object} eta                 — ETA result from getDrivingETA
 * @property {boolean} shouldCommute      — True only if ≥1 in-person class remains today
 * @property {Object} student             — Student profile info
 * @property {Object} campus              — Campus info
 * @property {string} generatedAt         — ISO timestamp
 */

/**
 * Master API call — fetches all data in parallel and returns a single
 * dashboard payload. This mirrors what a Cloudflare Worker `/api/dashboard`
 * endpoint would return.
 *
 * @returns {Promise<DashboardPayload>}
 */
export async function getDashboardData() {
  const now = new Date();

  const [schedule, eta] = await Promise.all([
    getEnrichedSchedule(),
    getDrivingETA(
      MOCK_STUDENT.homeLat,
      MOCK_STUDENT.homeLng,
      CAMPUS.lat,
      CAMPUS.lng
    ),
  ]);

  // Sort by start time
  schedule.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));

  // Upcoming = hasn't ended yet
  const upcoming = schedule.filter((c) => new Date(c.endTime) > now);

  // Next class = first upcoming (regardless of status)
  const nextClass = upcoming[0] ?? null;

  // Urgent alert = first upcoming class that is cancelled or virtual
  const urgentAlert =
    upcoming.find((c) => c.status === "cancelled" || c.status === "virtual") ??
    null;

  // Should commute = at least one in-person class still to come
  const shouldCommute = upcoming.some((c) => c.status === "in-person");

  return {
    schedule,
    nextClass,
    urgentAlert,
    eta,
    shouldCommute,
    student: MOCK_STUDENT,
    campus: CAMPUS,
    generatedAt: now.toISOString(),
  };
}

// ─── Cloudflare Worker stub ───────────────────────────────────────────────────
// When deploying to Cloudflare Workers, the file below (worker/index.js)
// calls getDashboardData() and responds with JSON. The frontend then points
// its fetch() calls to the Worker URL instead of the local JS module.
//
// Example Worker response shape mirrors DashboardPayload above exactly,
// so no frontend changes are required when switching environments.
