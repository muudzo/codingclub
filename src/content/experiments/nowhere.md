---
title: "Nowhere"
description: "Find and join spontaneous hangouts happening around you right now—without profiles, likes, or pressure."
published: true
stage: prototype
repositoryUrl: https://github.com/muudzo/nowhere
---

## The idea

Nowhere is for those moments when you're out and want to see if anyone nearby is up for grabbing coffee, shooting hoops, or hanging out. You post what you're doing, it disappears after 24 hours, and anyone nearby can tap **I'm in** to join a quick temporary chat.

No followers, no feeds, and no permanent history—if nothing is happening nearby, start something.

## Why it interests me

Most social apps are built to keep you scrolling at home. I wanted to explore what a location-based app would look like if everything expired automatically and there was no social graph to maintain.

## Technical details

- **Frontend:** React Native (Expo) mobile client with anonymous, device-scoped identity.
- **Backend:** FastAPI (Python) backed by Redis for primary storage and geospatial indexing.
- **Ephemeral state:** Intents, joins, and coordination messages all expire after 24 hours.

## What I’m figuring out

The app is built end-to-end, but I haven't launched it or tested it with real users yet—especially how a local-only app handles empty neighborhoods on day one.

## Next step

Run a small real-world test in one neighborhood or campus to see how people actually use 24-hour intents.
