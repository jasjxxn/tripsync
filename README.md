# TripSync Itinerary Studio

TripSync now focuses on travel planning. The lightweight web app assembles curated day-by-day itineraries using handcrafted destination data. Plug in where you want to go, your preferred pace, and the vibe you’re chasing to instantly see a personalized trip card with daily schedules, dining notes, and local tips.

## Requirements

- Python 3.9+ (only used to run the static dev server)
- A modern browser

## Web App

```bash
# Serve /web along with JSON data under /data
npm run dev
```

Open [http://localhost:5173/web/](http://localhost:5173/web/) and choose a destination, trip length, styles, and pace. The page fetches `data/itineraries.json`, scores flexible day plans against your preferences, and renders a shareable timeline along with highlights and practical tips.

## Customizing Destinations

- Edit `data/itineraries.json` to add or adjust destinations. Each entry defines `days` (core plans), optional `flexDays` (used when someone asks for extra time), `highlights`, and `localTips`.
- Every day plan supports `schedule` blocks for morning/afternoon/evening, `meals`, `notes`, and `style` tags. Add or remove fields as needed—the UI simply hides blank sections.
- You can expand the form UI or scoring rules inside `web/app.js` if you want more advanced filtering (budget, lodging, etc.).
