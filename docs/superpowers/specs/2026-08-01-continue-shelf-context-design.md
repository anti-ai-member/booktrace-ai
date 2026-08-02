# Design: Continue-shelf context column

**Status:** Approved 2026-08-01 (investigation-based; not catalog recommendations).

## Goal

Fill the empty right of the home「继续阅读」band with **this book’s resume context**, after fixing the cramped 2-column layout.

## Layout

Three columns: cover | continue copy | context panel.  
Context column uses `minmax(240px, 360px)`; middle column may grow (`1fr`). No hard 430px cap that leaves a void.

## Context content (sync, no API)

1. Leave-off: chapter title + page if known  
2. Absence label from last activity (localized)  
3. Up to 2 local memory / bridge titles when available (cached recovery or `prepareSituationRecovery` manual)  
4. Optional one recent note or bookmark line (open book only in v1)

Empty anchors → still show leave-off + absence; never invent catalog recommendations.

## Out of scope

Discovery feed, same-author store suggestions, LLM calls on shelf paint.
