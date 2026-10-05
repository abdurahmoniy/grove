# Grove simplification

Approved direction: center the app on review changes, commit, and sync; keep advanced Git tools accessible through secondary controls.

The workspace has no permanent sidebar. A compact masthead contains the Grove mark, a searchable repository switcher, a searchable branch switcher, and Fetch, Pull, and Push. The repository switcher shows names and full paths, with Open repository, Clone, and New actions. The branch switcher groups local and remote branches, marks the current branch, and provides Create branch and Manage branches. When a remote exists and the branch has no upstream, Push becomes Publish and enables upstream setup in the existing operation dialog.

One navigation row provides Changes, History, Branches, and Stashes. More contains Tags, Remotes, Activity log, and Git command. Refresh, Preferences, and Help sit alongside navigation. Current-view styling and accessible state identify the active destination, including destinations inside More. Remove the oversized page heading and repeated navigation so files and diffs receive the available workspace height.

Changes is a resizable two-pane review workspace: changed files on the left and the selected diff on the right. Each file has a staging checkbox, status, and directory context. Filtering matches full paths; Stage filtered and Unstage filtered act only on the visible matches in their group. Collapse controls preserve staged and unstaged group boundaries. Arrow keys and Home/End move between file rows and update the diff.

A compact commit bar spans below both review panes, with a composer limited to 1180px wide. A single metadata line contains the summary label, staged count, target branch, explicit amend state, and commit guidance. The summary, stable Details action with a description indicator, and Commit share one baseline below. Details opens a dialog for description and amend. Saved draft details stay visible through the Details button state; drafts remain per repository. Committing requires a summary, staged files or amend, and no unresolved conflicts. The existing confirmation remains for amend.

The diff toolbar provides unified/split mode and line wrapping, both remembered locally. File names and paths remain readable, status does not rely on color alone, and empty states explain the next available action. Narrow windows adapt the navigation and review workspace without introducing a sidebar.

Keep existing Git operations, conflict banners, confirmations, shortcuts, and saved drafts. Validate with the production TypeScript build and real-repository regression suite.

### Branch-specific sync

Pull and Push have separate dropdowns. Pull offers Pull from and Sync with the configured default branch; Push offers Push to, Merge branch, Rebase onto, and Manage remotes. Both menus link to quick-action preferences. Branch rows preselect a remote pull source or local push source. The dedicated sync dialog selects a configured remote and branch, previews From → To, and displays the actual fetch or push URLs. Multiple configured push destinations are all listed.

Sync with main uses a per-repository remote/default-branch setting and updates the current branch with fast-forward only. Workspace preferences control toolbar visibility and optional review before syncing. Hidden actions remain available under More. Selected pulls explicitly disable configured rebasing and automatic stashing so conflicting edits stop the operation without creating a stash or advancing HEAD.

Pull updates only the current local branch with fast-forward-only behavior. Push sends one explicitly selected local branch to one remote branch name without checkout; tracking changes only when requested. Explicit pushes suppress automatic tag following. Validate branch names, configured remotes, local source existence, detached pulls, and active operations in the Git service. Preserve selections and move keyboard focus to inline errors for retry.

## Interface and accessibility

Use neutral charcoal surfaces and a restrained green accent, with legible interface text and a 13 px default diff font. Compact controls leave more space for reviewing changes. Persistent file actions, field labels, selected navigation semantics, commit guidance, clear search feedback, and plain action descriptions make the workflow easier to understand. Advanced commit operations remain expandable in History.

Action menus anchor to their invoking button and support arrows, Home/End, Tab, and Escape. Dialogs use unique accessible names, stable focus trapping, and focus restoration. Searchable switchers focus their search field through the dialog focus manager and support Up/Down between results. A skip link, focus on view changes, and Cmd/Ctrl+1/2/3 for Changes/History/Branches support keyboard navigation. Split diffs include plus/minus signs, and conflict/untracked markers have distinct accessible labels. Existing reduced-motion rules apply.

Native select fields share a 40px rounded control, inset chevron, and restrained border focus. Supporting browsers also use a matching option panel with hover and selected states, a checkmark, and automatic edge-aware positioning. Older browsers retain a native picker; forced-color mode restores the system appearance. Open selects handle their own Escape and Tab before the containing modal applies its keyboard controls. Browser checks verified selection updates, arrow navigation, Escape isolation, Tab movement, Preferences styling, and no overflow at 860 × 620.

Validation must cover the production build, existing real-repository regression suite, pointer and keyboard flows, dialog focus return, filtered staging scope, and desktop/narrow-window overflow. Document outcomes only after running those checks.
