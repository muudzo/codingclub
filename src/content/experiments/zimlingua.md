---
title: "ZimLingua"
description: "Offline neural machine translation for English, Shona, and Ndebele using NLLB-200 and Int8 CTranslate2."
published: true
stage: prototype
repositoryUrl: https://github.com/muudzo/zimlingua
---

## The idea

ZimLingua is an offline, CPU-friendly neural machine translation tool focused on low-resource Zimbabwean languages (Shona, Ndebele, and English).

## Why it interests me

Most translation tools require constant internet access and prioritize high-resource languages. Running quantized models locally makes translation practical on everyday laptops and offline devices.

## What I’ve tried

- Built a modular Python 3.9+ architecture separating data normalization, LoRA fine-tuning, CTranslate2 Int8 inference, and user interface layers.
- Quantized Meta's NLLB-200 model for fast CPU inference and added an automated test suite.

## What I’m figuring out

Curating higher-quality parallel Shona and Ndebele evaluation datasets to measure translation accuracy reliably across everyday domains.

## Next step

Benchmark LoRA fine-tuning runs on clean community corpora and publish reproducible evaluation metrics.
