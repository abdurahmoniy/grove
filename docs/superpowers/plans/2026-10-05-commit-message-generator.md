# Commit message generator

Add a compact Generate action beside the commit summary. It opens an editable
preview based exclusively on staged changes. Generation runs locally without an
API key or network request. Suggestions describe file operations; they do not
claim to infer the intent of code changes.

The preview leaves the current draft untouched until Use message (or Replace
draft) is selected. Applying preserves amend mode and returns focus to the main
summary. Commit remains a separate action. Escape and Cancel discard the preview,
including while a request is pending.

## Implementation

1. Add a read-only Git service method and IPC allowlist entry. Read one staged
   raw diff with blob identities, modes, status, and paths. Bound output, serialize
   with repository operations, reject conflicts and empty staging, and return a
   stable staged fingerprint with a factual summary and file breakdown.
2. Add matching browser demo behavior and a shared response type.
3. Add the generator control and accessible preview dialog with loading/error
   states, editable summary/description, and preservation of existing drafts.
4. Recheck the staged fingerprint before applying; keep preview edits on errors
   and request regeneration if staging changed. Ignore results after closing or
   switching repositories.
5. Test real temporary repositories for partial staging, renames, deletions,
   binary paths, unborn HEAD, conflicts, empty staging, and read-only behavior.
   Verify keyboard interaction, draft replacement/cancellation, and narrow layout
   in the browser. Run the suite/build, package, and verify native Grove.

## Validation

- Automated suite: 69 passing tests, including 13 new generator tests using real
  temporary Git repositories. Index bytes, HEAD, and working files remain intact.
- TypeScript, production build, scoped formatting, and whitespace checks pass.
- Browser checks: editable preview, separate commit action, blank-summary guard,
  cancellation, existing-draft replacement, amend preservation, empty staging,
  focus after applying/regenerating, and modal keyboard focus containment.
- Minimum desktop window (860 × 620): no commit-bar horizontal overflow; dialog
  actions stay visible while its content scrolls.
- macOS app packaging succeeded.
