---
title: "MooMetrics"
description: "Offline-first, multi-tenant farm animal record-keeping PWA with role-based access and fraud-auditable death reporting."
published: true
platform: "Web PWA (React + FastAPI)"
logo:
  image: ../../assets/apps/moometrics-logo.svg
  alt: "MooMetrics app icon"
downloads:
  - label: "View on GitHub"
    url: "https://github.com/muudzo/moometrics"
---

## About the app

MooMetrics is built for livestock farms operating in low-connectivity environments. Managers and employees can log cattle, sheep, goats, pigs, horses, and poultry offline; writes queue in IndexedDB and sync automatically when connectivity returns.

## Key capabilities

- **Multi-tenant farm isolation:** Self-serve farm creation with *manager* and *employee* roles.
- **Auditable death reporting:** Mandatory photo evidence with client-side SHA-256 duplicate detection and an append-only audit trail.
- **Stack:** React 18, TypeScript, Vite, Tailwind CSS, Radix UI, FastAPI, SQLAlchemy 2, and Alembic.
- **Exports:** CSV downloads for animals and death reports.
