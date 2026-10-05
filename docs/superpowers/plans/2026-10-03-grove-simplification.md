# Grove Simplification Implementation Plan

**Goal:** Make everyday review, commit, and sync the primary interface, with more room for files and diffs.
**Architecture:** Replace the sidebar and stacked headers with WorkspaceHeader. Keep Changes focused on file review and staging, use a separate CommitComposer beneath the review panes, and preserve existing Git operations through the current desktop bridge.
**Tech Stack:** React, TypeScript, CSS, Electron.

## Implementation

- Replace the permanent sidebar with a compact masthead and one navigation row.
- Add searchable repository and branch switchers using the existing accessible Modal. Show repository paths, local/remote branch groups, current selections, and direct open/clone/new/create actions.
- Keep Fetch, fast-forward Pull, and Push accessible in the masthead. Offer Publish when an upstream is missing and a remote exists. Retain the existing operation dialog and safe Git semantics.
- Provide Changes, History, Branches, and Stashes navigation, plus More for Tags, Remotes, Activity, and Git command. Retain Preferences, Refresh, and Help.
- Let the file list and diff use the available height. Move staged count, summary, Details, and commit action to a separate footer bar.
- Add explicit staging checkboxes, directory context, filter-aware batch staging and unstaging, clear filter-empty feedback, and arrow/Home/End navigation through changed files.
- Keep commit descriptions and amend in a Details dialog. Preserve saved drafts and existing confirmation for amend.
- Remember diff wrapping and unified/split preferences. Keep code-size and compact-row settings.
- Preserve visible focus, skip navigation, accessible labels and current states, dialog focus trapping and restoration, conflict markers, reduced motion, and narrow-window layouts.
- Update README and format affected files.

## Verification results — October 3, 2026

- Production build and TypeScript checks passed.
- All 35 Git/parser regression tests passed.
- Native macOS package completed. The packaged index and desktop entry match the current files; the rebuilt app was launched and visually verified against the real local repository.
- Browser checks at 1280 × 800 and the desktop minimum of 860 × 620 found no page overflow in Changes. History, Branches, Stashes, Tags, Remotes, Activity, and Preferences were also reviewed at desktop width.
- Repository filtering and Escape focus return passed. Branch filtering, arrow-key navigation, current-branch selection, and return focus passed.
- Keyboard staging into a collapsed destination group expanded the group and retained focus on the file. Unstaging returned focus to its original group. File labels announce change type and staged state.
- Filtered batch staging and unstaging changed only the matching README in the interactive demo; the staged count returned to its original value afterward.
- Commit descriptions return focus to Details. Draft summary and description survive view navigation. Cmd+Enter created a demo commit and cleared the successful draft.
- Arrow-key file review and keyboard pane resizing passed. Unified and split diffs wrapped within the viewport, and the wrap preference survived reload.
- No warning or error logs appeared after the final preview reload.

Git mutations for UI checks ran only in the interactive demo. The native app was inspected without staging or committing user repository files. Browser semantics and keyboard checks do not constitute screen-reader certification.

### Commit bar refinement

- Replaced the separate status column with one bounded composer: summary label, staged count, target branch, and guidance above aligned controls. Desktop height is 83px.
- Kept Details text stable, added a description indicator and explicit amend badge, and linked the staged count to the input and commit button for assistive technology.
- Verified the 1280px and 860px layouts, disabled zero-staged guidance, description persistence, amend with no staged files and its confirmation, and successful Cmd+Enter commits in the demo. A successful commit clears the draft while keeping focus in the summary.
- TypeScript, production build, desktop packaging, and diff whitespace checks passed.

### Branch-specific sync refinement

- Added Pull from and Push to dialogs with configured remote selection, branch suggestions, explicit source/destination previews, optional upstream tracking, and actual push destination URLs. Added toolbar menu entries and branch-row shortcuts; merge and rebase remain explicit choices.
- Extended the Git service with validated, fully qualified branch refs. Pull is fast-forward only; push leaves checkout intact, rejects non-fast-forward changes, and suppresses configured automatic tag following.
- All 45 tests passed, including real local bare-remote fixtures for differing source/destination names, tracking preservation, detached state, divergence, active operations, invalid inputs, tag suppression, and multiple push URLs.
- Browser checks passed at 1280 × 800 and 860 × 620: no horizontal overflow, branch-row defaults, menu keyboard navigation, route updates, validation, Escape focus return, preserved error selections, and focused inline errors. No browser warnings or errors after reload.
- TypeScript, production build, macOS packaging, and diff whitespace checks passed. The Mac locked during the final native relaunch, so this refinement's rebuilt native bundle could not be visually rechecked. All sync mutations used temporary test repositories; no user remote was pushed or pulled.
