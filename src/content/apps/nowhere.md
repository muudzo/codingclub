---
title: "Nowhere"
description: "A real-time, location-scoped ephemeral third-place app for finding and joining nearby spontaneous gatherings."
published: true
platform: "iOS, Android & Web (Expo + FastAPI)"
logo:
  image: ../../assets/apps/nowhere-logo.png
  alt: "Nowhere app icon"
downloads:
  - label: "View on GitHub"
    url: "https://github.com/muudzo/nowhere"
---

## About the app

Nowhere helps people discover what is happening nearby right now without social graphs, likes, followers, or permanent profiles. Users post a local intent ("I am here doing X") that expires automatically after 24 hours, while others nearby can tap **I'm in** and coordinate in a temporary chat.

## Architecture & stack

- **Frontend:** React Native (Expo) mobile client with anonymous, device-scoped identity.
- **Backend:** FastAPI (Python) backed by Redis for primary storage and geospatial indexing.
- **Design principle:** Time-bound, density over engagement—if nothing is happening nearby, start something.
