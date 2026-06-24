// ┌─────────────────────────────────────────────────────────────────────────┐
// │ NOTE: data source was switched on 2026-06-24.                            │
// │                                                                         │
// │ This file used to scrape linesticker.app (a third-party mirror that     │
// │ only updates once a day). The real ranking now comes straight from      │
// │ LINE's own store (store.line.me), per-country, hourly. The actual       │
// │ scraper lives in scrape-line-official.mjs.                              │
// │                                                                         │
// │ The Windows Task Scheduler job "LINE Sticker Scraper" still calls THIS  │
// │ file (its action couldn't be edited without admin), so this just runs   │
// │ the new scraper. To clean up: point the task at scrape-line-official.mjs│
// │ and delete this shim. The old linesticker code is in git history.       │
// └─────────────────────────────────────────────────────────────────────────┘
import './scrape-line-official.mjs';
