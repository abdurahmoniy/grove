# Git Tool — proposed design

Status: approved by the user and implemented as Grove. See the implementation plan and README for verification and operating limits.

## Product

A polished desktop client for real local Git repositories. Users can switch projects, understand commit history, inspect changes, and perform everyday and advanced Git operations without leaving the app. The initial target is macOS, with a portable Electron architecture.

## Approach

Recommended: Electron, React, and TypeScript, using the installed Git executable through a narrow desktop API. This supports native folder selection, local files, and existing Git authentication.

Alternatives: a local web app is easy to preview but requires a companion server; Tauri produces a smaller application but adds a Rust toolchain. Electron offers the most direct path to a complete local client here.

## Interface

- A charcoal interface with restrained green accents, fine borders, crisp icons, readable sans-serif labels, and monospaced code and hashes. No decorative dashboard cards.
- Left sidebar: recent projects, active repository, local and remote branches, tags, stashes, and settings.
- Top toolbar: active branch, fetch, pull, push, and repository action menu. Show upstream status and operation progress.
- Changes workspace: staged and unstaged files, searchable file list, unified or split diff, commit title and description, and a clear commit action.
- History workspace: connected commit graph, branch labels, searchable commit list, author and date, and commit detail with changed files and diffs.
- Empty states explain how to open, clone, or initialize a repository. Sample content must be explicitly identified as a demo and kept separate from real projects.
- Keyboard navigation, labeled controls, visible focus, reduced motion, and resizable panes.

## Git operations

Repository management: open, remember, remove from recent projects, clone, and initialize.

Changes: refresh, inspect tracked and untracked files, stage and unstage files or all changes, discard selected changes with confirmation, commit, and amend.

Branches and history: create, switch, rename, and delete branches; merge, rebase, cherry-pick, revert, reset, inspect commits, and manage tags. Operations that rewrite history or discard work explain their effect before execution.

Remote collaboration: list and manage remotes, fetch, pull, push, and set upstream. Use existing Git credential helpers and SSH configuration. Never silently force-push.

Stashes and conflicts: save, list, inspect, apply, pop, and drop stashes. Identify conflicted files, provide editable conflict resolution, mark resolved, and continue or abort the applicable operation.

Expose operation output and errors in an activity panel. Provide a Git command panel for operations without dedicated forms, with the active repository prominently displayed and no automatic execution of suggested commands.

## Architecture and behavior

The Electron main process owns repository access and Git execution. A context-isolated preload exposes validated operations; the renderer does not receive unrestricted Node or shell access. Invoke Git with argument arrays, validate references and file paths, and serialize mutations per repository.

Keep repository access, Git parsing, desktop integration, and UI components separate. Persist project bookmarks and interface preferences locally. Refresh after operations and when the app regains focus; debounce filesystem changes.

Report actual command results. Keep user edits when an operation fails. Handle empty repositories, detached HEAD, missing upstreams, renamed files, binary files, large diffs, and active merge or rebase states explicitly. Paginate history and cap initial diff rendering with a clear way to request more.

## Verification

Exercise Git operations against temporary repositories, including staged and unstaged changes, filenames with spaces, branches, stashes, merge conflicts, and a temporary local remote. Never use the user's unrelated repositories as mutation fixtures.

Run type checking and a production build. Inspect the rendered interface and verify project selection, history selection, diff display, staging, committing, and error feedback. Confirm the desktop bridge accesses real repositories and that preview or demo mode is clearly labeled.

## Scope boundary

This is a local Git client. Hosted pull request reviews, issue tracking, accounts, and cloud synchronization are outside this version. Existing remote Git authentication is supported; the app does not introduce a credential vault.
