## What and why

<!-- One or two sentences: what changes for students or staff, and why. -->

## How it was verified

- [ ] Tests added first (RED → GREEN) for new behaviour or fixed bugs
- [ ] `pnpm turbo run type-check test` passes (CI runs the same)
- [ ] ECC review run for the changed surface (react / typescript / security / database) and findings fixed
- [ ] UI changes follow DESIGN.md tokens and the accessibility floor; checked at phone and desktop widths
- [ ] Supabase migrations (if any) numbered, idempotent, applied and verified

## Risk and rollback

<!-- What could break, and how to undo it (revert the squash commit; migration down steps if any). -->
