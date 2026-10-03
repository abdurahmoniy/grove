# Grove Simplification Implementation Plan

**Goal:** Make everyday review, commit, and sync the primary interface.
**Architecture:** Use existing views and operations with progressive disclosure in Sidebar and Changes. Simplify App toolbar and heading without changing the desktop bridge.
**Tech Stack:** React, TypeScript, CSS, Electron.

- [x] Replace expanded sidebar resources with a collapsed Git tools section; preserve selected view feedback.
- [x] Remove duplicate workspace tabs, move Fetch into repository actions, and use direct heading copy.
- [x] Collapse optional commit details while keeping saved draft details visible and the commit shortcut available in the summary.
- [x] Update README and format changed files.
- [x] Run `npm run build` and `npm test`; inspect output before reporting completion.

Validation: production build passed; all 35 tests passed. Browser preview verified Changes/History navigation and expandable Git tools and Commit options.
