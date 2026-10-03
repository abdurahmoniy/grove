# Grove

A polished desktop home for your local Git repositories. Built with Electron, React, and TypeScript. Files, repository bookmarks, preferences, and commit drafts stay on your computer.

## Run the desktop app

Requires **Node.js 22.12+** and **Git** on your PATH.

```sh
npm install
npm run desktop
```

Use **Open repository** to choose an existing project. The `+` beside Workspace also offers **Clone repository** and **Initialize repository**. Grove uses your existing Git identity, SSH configuration, and credential helpers.

To run the production build:

```sh
npm run build
npm start
```

The macOS build is local and unsigned. To produce a `.app` bundle:

```sh
npm run package
```

Find it under `release/mac-arm64/Grove.app` on Apple Silicon, or `release/mac/Grove.app` on Intel. No signing credentials or distribution service is required for this local build.

## What you can do

- Open, bookmark, clone, and initialize repositories; switch among projects.
- Review staged, unstaged, renamed, deleted, untracked, and conflicted files.
- Browse unified or split diffs, stage or unstage individual files or all changes, discard selected unstaged changes, commit, and amend.
- Browse an all-branch commit graph; search messages, authors, email addresses, and hashes; inspect commit details and changed files.
- Create, switch, rename, and delete branches. Remote branches create or reuse appropriate local tracking branches.
- Fetch, fast-forward pull, push, and configure upstreams and remotes.
- Merge, rebase, cherry-pick, revert, and reset with explicit choices for operations that rewrite or discard work.
- Save, inspect (including untracked files), apply, pop, and delete stashes; create and delete tags.
- Edit text conflicts, stage resolutions, and continue or abort the current operation.
- Run additional Git commands in the command panel and inspect their actual output in Activity log.

Changes and History are the main views. Expand **Git tools** for branches, stashes, tags, remotes, and the activity log. Pull and Push stay in the toolbar; Fetch and additional operations are in the repository actions menu. Expand **Commit options** for a description, amend, or stash. Cmd/Ctrl + Enter also commits from the summary field.

Drag pane dividers to resize the workspace. Preferences offer compact file rows and adjustable code text. Commit drafts are kept per repository when changing views or restarting.

## Keyboard shortcuts

| Shortcut         | Action                            |
| ---------------- | --------------------------------- |
| Cmd/Ctrl + O     | Open repository                   |
| Cmd/Ctrl + R     | Refresh repository                |
| Cmd/Ctrl + F     | Filter changed files              |
| Cmd/Ctrl + K     | Open Git command panel            |
| Cmd/Ctrl + Enter | Commit from the description field |
| Escape           | Close a dialog                    |

## Browser preview

```sh
npm run dev
```

Open `http://127.0.0.1:5173`. This is an **explicitly labeled interactive demo** with sample data. Browsers cannot run local Git commands; use the desktop app for your actual projects. Demo changes reset on reload.

## Validation

```sh
npm test
npm run build
```

The automated suite uses temporary real repositories and a local bare remote. It covers staging, commits, history, searches, branches, remotes, stashes, tags, merges and conflicts, rename behavior, literal filenames, symlink/path protections, large diffs, and diff parsing. It does not mutate your existing repositories.

## Behavior and limits

- Pull uses `--ff-only`; diverged histories require an explicit merge or rebase. Branch deletion uses Git’s safe deletion check. Push never adds a force flag automatically.
- Git commands are executed as argument arrays, without shell interpolation. The command panel accepts Git arguments, not shell pipelines. It remains a powerful interface: review commands before running them.
- Git authentication uses existing non-interactive helpers. Set up credentials in your normal Git environment if a remote operation requires an interactive login. Operations time out after three minutes and report the Git error.
- Diffs initially show up to 1 MiB; the expanded view allows up to 16 MiB. Binary files are identified without a text diff. The conflict editor supports regular text files up to 8 MiB; use your editor or the command panel for binary, deleted-file, or complex structural conflicts.
- The renderer is sandboxed and context-isolated. Local repository access goes through the desktop bridge; navigation to external pages and popup windows are blocked.
- Hosted pull requests, issues, and cloud synchronization are outside this version.

## Source layout

`desktop/` contains the Git service and desktop bridge. `src/components/` contains focused interface views. `src/lib/diff.ts` parses unified diffs. `tests/` contains repository and parser regression tests.

Electron bridge and startup follow the [official IPC documentation](https://www.electronjs.org/docs/latest/tutorial/ipc) and [ES module lifecycle guidance](https://www.electronjs.org/docs/latest/tutorial/esm). The renderer is built with [Vite](https://vite.dev/guide/).
