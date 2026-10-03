# Grove simplification

Approved direction: center the app on review changes, commit, and sync; keep advanced Git tools accessible through secondary controls.

The sidebar contains repositories and a single Changes/History navigation. An initially collapsed Git tools section provides branches, stashes, tags, remotes, and activity. The toolbar retains branch switching, Pull, Push, and repository actions; Fetch moves into repository actions. Remove duplicate workspace tabs and decorative heading copy. Commit summary and commit button stay visible; description, amend, and stash move into an expandable section that remains open when a saved draft uses description or amend.

Keep existing Git operations, conflict banners, confirmations, shortcuts, and saved drafts. Validate with the production TypeScript build and existing real-repository regression suite. This is a reversible interface change, with no Git service changes.
