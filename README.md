# Arcadia Commuter Assistant
# ah.evaakselrad.com
**Arcadia University Hackathon Project**

## What it does
A lightweight serverless web application that cross-references students' Canvas schedules, emails, and live traffic data (via OSRM) to output real-time commute recommendations. If a class is cancelled or moved to Zoom, the app prominently alerts the student not to drive to campus—saving time and stress!

## Features
- **Live Class Tracking** – In-person, Virtual, or Cancelled status updates pulled from mock Canvas / Email parsing APIs.
- **Traffic Interceptor** – Computes drive ETAs and distance on the fly using OSRM to determine exactly when a student needs to leave.
- **Dark Mode Support & Custom Settings** – Full light/dark mode css-var toggle, Time Format switches, and Commute preferences.
- **Time Travel Debug Tool** – A persistent floating toggle for demoing different times of day to see how the dashboard reacts.

## Tech Stack
- **Frontend**: Vanilla HTML / CSS / JS (Single Page Application architecture with dynamic view injection)
- **Backend / Delivery**: Cloudflare Workers + Cloudflare Pages (Serverless)

## Deployment
Deploy the full application to Cloudflare edge network via Wrangler:
```bash
npx wrangler deploy
```

Run locally:
```bash
npx wrangler dev
```
