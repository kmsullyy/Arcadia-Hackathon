# Arcadia Commuter Assistant - Project Plan

This document ou    tlines the tasks required to build the Arcadia Commuter Assistant application. 
The application will be built using HTML/CSS/JS, run serverless on Cloudflare, and utilize Cloudflare databases for user data.

## Phase 1: Project Setup & Infrastructure
- **Task 1.01:** Initialize project directory structure with HTML, CSS, and JS files. (Done)
- **Task 1.02:** Initialize Cloudflare Workers project for serverless backend computing. (Done)
- **Task 1.03:** Setup Cloudflare Database (D1 or KV) to store user data (preferences, schedule, location). (Done KV=ArcadiaHackathon)
- **Task 1.04:** Create the base CSS design system (tokens, variables, base styling) to support theming. (Done)
# Phase 2 will be all demo data insead of canvas and email and maps api will be either mocked or a free alternative
## Phase 2: Data & External API Integrations (Backend)
- **Task 2.01:** Implement Canvas API integration to retrieve student schedules and course announcements. ✅ (Done — JS/mockData.js: MOCK_CANVAS_COURSES)
- **Task 2.02:** Implement Email parsing/scraping logic to detect crucial keywords (e.g., "cancelled", "virtual", "Zoom"). ✅ (Done — JS/api.js: parseEmailStatuses + keyword lists)
- **Task 2.03:** Develop backend logic that cross-references class schedules with Canvas/Email data to flag classes as cancelled or virtual. ✅ (Done — JS/api.js: getEnrichedSchedule)
- **Task 2.04:** Integrate a Maps/Traffic API — using OSRM (free, no key required) to calculate driving ETAs. ✅ (Done — JS/api.js: getDrivingETA)
- **Task 2.05:** Expose secure API endpoints via Cloudflare Workers for the frontend to consume. ✅ (Done — SRC/worker/index.js: /api/dashboard, /api/schedule, /api/eta, /api/health)
## Phase 3: Frontend - Overview/Homepage
- **Task 3.01:** Design and develop the homepage layout.
- **Task 3.02:** Build the `Day's Schedule Overview` component.
- **Task 3.03:** Build the dynamic `Traffic & ETA Display` component, recommending when the user should leave.
- **Task 3.04:** Implement the `Main Notification System` to aggressively highlight if a user's next class is cancelled (saving them the drive).

## Phase 4: Frontend - Account Page
- **Task 4.01:** Build the `Full Arcadia Schedule` view, including filters to break down the schedule day-by-day.
- **Task 4.02:** Build the `Location Management` component to allow users to set their starting address     or enable location tracking.
- **Task 4.03:** Build the `Map/Google Connectivity Setup` component for authorizing location and map data.

## Phase 5: Frontend - Alert Page
- **Task 5.01:** Build the `Recent Alerts` feed to show a history of notifications.
- **Task 5.02:** Build the `Upcoming Classes` timeline view.
- **Task 5.03:** Build the `Cancelled Classes` log for record-keeping.

## Phase 6: Frontend - Settings Page
- **Task 6.01:** Implement the `Time Format` toggle (12-hour vs 24-hour clock) and link to database preferences.
- **Task 6.02:** Implement the `Theme Switcher` (Light/Dark) to toggle CSS variables.
- **Task 6.03:** Add `Notification Preferences` (e.g., SMS alerts, push notifications, email).
- **Task 6.04:** Add `Account Management` (Clear data, logout functionality).

## Phase 7: Car Integration (Android Auto / Apple CarPlay)
- **Task 7.01:** Investigate bridging solutions or PWA templates compatible with Android Auto and Apple CarPlay environments.
- **Task 7.02:** Design a highly simplified, distraction-free UI view specifically for the car dashboard (showing only ETA, Next Class, and Big Alert banners).
- **Task 7.03:** Implement car dashboard view routing and data binding.
