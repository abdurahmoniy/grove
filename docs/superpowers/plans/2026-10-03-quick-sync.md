# Configurable quick sync implementation plan

**Goal:** Make Pull from discoverable beside Pull and provide a configurable one-click Sync with main action.

**Design:** Keep the existing quick pull to the current upstream. Give Pull a separate menu for Pull from, Sync with the configured default branch, and quick-action settings. Keep Push to beside Push. Sync uses the existing validated selected-pull operation, fast-forward only as the user requested; it never pushes or switches branches. Its label follows the configured branch. Default remote resolution prefers origin, then the current upstream remote, then the first configured remote. Explicit removed remotes block the action.

**Configuration:** Save default branch and remote per repository. Save visible Fetch, Pull, Push, and Sync buttons and the optional review-before-sync choice for the workspace. Start with all four visible, main as the default branch, automatic remote selection, and direct sync. Use the existing local preferences storage. Validate branch edits before saving. Hidden actions remain accessible from More, and configuration is always available from Preferences.

**Implementation:**

- Add pure configuration normalization and remote selection helpers with focused tests, plus an accessible QuickActionSettings component.
- Integrate persisted settings in App and invoke the existing pull flow for configured sync; optional review opens the existing Pull commits dialog with the target preselected.
- Add Pull split button, configurable toolbar visibility, Sync with branch label, menu fallbacks, and direct access to configuration.
- Keep toolbar layout usable at minimum desktop width and with long branch names. Verify keyboard navigation, focus return, invalid settings, persistence, and hidden-action recovery.
- Verify existing Git semantics using temporary repos, run the complete test/build checks, rebuild the macOS app, and inspect the updated native toolbar when available.

**Verification:** All 56 tests passed, including configuration normalization, remote resolution, branch validation, and real-repository checks for fast-forward behavior under rebase/autostash configuration. TypeScript, production build, macOS packaging, and whitespace checks passed. Browser verification covered Pull-to-Push switching with one click, same-caret toggling, keyboard/Escape focus return, configured review routing, direct sync dispatch, invalid branch save rejection, hidden-action recovery, persistence across reloads, and isolation between repositories. At 860 × 620, a long configured branch caused no horizontal overflow. Native relaunch verification follows packaging.

The rebuilt native Grove app was reopened successfully. Its toolbar shows separate Pull and Push carets and Sync with main; the Pull menu shows Pull from, Sync with main, and Configure quick actions. The native inspection ran no pull or push against user remotes.
