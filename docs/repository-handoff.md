# Repository Coordination

User requested commits and pushes to https://github.com/Austin-Senna/astra-hackathon.

Root initialized this workspace on `main`, configured `origin`, and verified the remote was initially empty. The backend commit includes engine, contracts, server, original asset catalog, integration scaffold, and backend docs. UI work is concurrently owned by another agent and must not be accidentally swept into a backend commit.

UI-owned paths currently include `apps/client`, `packages/presentation`, `packages/client-sdk`, `public/tabletop`, `docs/tabletop*`, and `scripts/import-tabletop-assets.py`. Shared dependency manifests retain the UI agent's additions rather than reverting them.

Stage explicit paths, inspect the staged set, and use normal non-force pushes. Never reset the shared worktree to clean up another agent's files. See `HANDOFF.md` for the latest backend verification and push status.
