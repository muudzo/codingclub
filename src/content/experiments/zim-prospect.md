---
title: "zim-prospect"
description: "National-scale mineral prospectivity mapping for 11 commodities in Zimbabwe using open geospatial data."
published: true
stage: prototype
repositoryUrl: https://github.com/muudzo/zim-prospect
---

## The idea

`zim-prospect` builds national-scale maps showing where 11 mineral commodities are likely to occur in Zimbabwe, ranks target zones, and reports how well each map ranks known deposits. It acts as a first-pass screening tool to decide where to look closer.

## Why it interests me

Geological exploration tools are often locked behind expensive proprietary datasets. I wanted to see how far open data alone—with no API keys—can go toward reproducible, validated prospectivity screening.

## What I’ve tried

- Built a Python pipeline that caches open datasets, extracts terrain and spectral features (including 30 m Copernicus DEM and Sentinel-2 imagery at finer resolutions), and scores target zones.
- Added fuzzy-weight tuning, high-resolution zoom anomalies (`10–20 m`) inside top targets, and `pytest` validation checks.

## What I’m figuring out

Improving validation scores across sparse known-deposit commodities and keeping high-resolution feature builds fast on consumer hardware.

## Next step

Package cleaner visual map exports and share sample commodity reports.
