/**
 * mockData.js — Arcadia Commuter Assistant
 * Phase 2: Mock data simulating Canvas LMS + Email Inbox responses.
 * In production, these would be replaced by real API calls to Canvas and an
 * email parser running on Cloudflare Workers.
 */

// ─── Campus Locations ────────────────────────────────────────────────────────

export const CAMPUS = {
  name: "Arcadia University",
  address: "450 S Easton Rd, Glenside, PA 19038",
  lat: 40.1017,
  lng: -75.1546,
};

// ─── Mock Student Profile ─────────────────────────────────────────────────────

export const MOCK_STUDENT = {
  id: "stu_001",
  name: "Alex Rivera",
  email: "alex.rivera@arcadia.edu",
  homeAddress: "1234 Main St, Philadelphia, PA 19103",
  homeLat: 39.9526,
  homeLng: -75.1652,
};

// ─── Task 2.01 — Mock Canvas Schedule ────────────────────────────────────────
// Simulates a Canvas API `/api/v1/courses` + `/api/v1/calendar_events` response.
// Each entry represents one class meeting for "today".

const today = new Date();
const fmt = (h, m) => {
  const d = new Date(today);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/** @type {CanvasCourse[]} */
export const MOCK_CANVAS_COURSES = [
  {
    id: "crs_101",
    name: "Introduction to Computer Science",
    code: "CS 101",
    instructor: "Prof. Macropol",
    location: "Brubaker Hall 210",
    startTime: fmt(9, 0),
    endTime: fmt(10, 15),
    announcements: [],
  },
  {
    id: "crs_202",
    name: "Data Structures & Algorithms",
    code: "CS 202",
    instructor: "Prof. Ford",
    location: "Brubaker Hall 105",
    startTime: fmt(11, 0),
    endTime: fmt(12, 15),
    announcements: [
      {
        id: "ann_001",
        title: "Class CANCELLED today",
        body: "Due to a conference, today's DS&A session is cancelled. Please review Chapter 7.",
        postedAt: fmt(7, 30),
      },
    ],
  },
  {
    id: "crs_315",
    name: "Web Application Development",
    code: "CS 315",
    instructor: "Prof. Woods",
    location: "Knight Hall 302",
    startTime: fmt(14, 0),
    endTime: fmt(15, 15),
    announcements: [
      {
        id: "ann_002",
        title: "Today's class is VIRTUAL — Zoom link inside",
        body: "Join Zoom Meeting: https://www.youtube.com/watch?v=xvFZjo5PgG0. Today will be held online.",
        postedAt: fmt(8, 0),
      },
    ],
  },
  {
    id: "crs_420",
    name: "Machine Learning Fundamentals",
    code: "CS 420",
    instructor: "Prof Jia",
    location: "Landman Library 101",
    startTime: fmt(16, 30),
    endTime: fmt(17, 45),
    announcements: [],
  },
];

// ─── Task 2.02 — Mock Email Inbox ─────────────────────────────────────────────
// Simulates parsed emails from professors / university systems.
// In production, a Cloudflare Worker would connect to a Gmail/Outlook API,
// then scan subject + body for keywords.

/** @type {EmailMessage[]} */
export const MOCK_EMAILS = [
  {
    id: "email_001",
    from: "rarras@arcadia.edu",
    to: "alex.rivera@arcadia.edu",
    subject: "CS 202 — Class Cancelled 3/28",
    body: "Hi all, today's Data Structures class is cancelled due to my attendance at the ACM conference. See you Thursday.",
    receivedAt: fmt(7, 28),
    courseCode: "CS 202",
  },
  {
    id: "email_002",
    from: "vford@arcadia.edu",
    to: "alex.rivera@arcadia.edu",
    subject: "CS 315 Going Virtual Today",
    body: "Hi team, today's Web Dev session will be held virtually over Zoom. Link: https://arcadia.zoom.us/j/987654321. Please log in by 2:05 PM.",
    receivedAt: fmt(7, 55),
    courseCode: "CS 315",
  },
  {
    id: "email_003",
    from: "registrar@arcadia.edu",
    to: "alex.rivera@arcadia.edu",
    subject: "Spring 2026 Registration Reminder",
    body: "Registration for Summer/Fall 2026 opens next Monday. Log in to Self Service to check your time slot.",
    receivedAt: fmt(6, 0),
    courseCode: null,
  },
];

// ─── Keyword Definitions for Email Parser ─────────────────────────────────────

export const CANCELLATION_KEYWORDS = [
  "cancelled", "canceled", "no class", "class is off", "cancellation",
  "not meeting", "will not meet",
];

export const VIRTUAL_KEYWORDS = [
  "virtual", "zoom", "online", "remote", "teams", "google meet",
  "webex", "microsoft teams", "held online", "online session",
];
