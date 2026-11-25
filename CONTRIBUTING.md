# Contributing

```bash
pnpm install
pnpm test          # unit tests
pnpm typecheck
pnpm test:e2e      # needs a browser: pnpm exec playwright install chromium (or set PW_CHANNEL=msedge)
pnpm dev           # http://localhost:5173/pitwall/
```

## The one rule that is not negotiable

pitwall only reads. Do not add Mode 04 or any command that changes the car or persists adapter
settings. `packages/obd-core/src/allowlist.ts` is the single list of what may be sent, and its
tests must keep rejecting everything else. A pull request that widens the list needs to explain
why the new command cannot write anything.

## Other notes

- Turkish and English strings live next to each feature (`defineStrings`).
- Trouble code translations go to `packages/dtc-data/data/dtc-tr.json` (CC0, your own words).
  Corrections from people who know the codes are very welcome.
- Real adapter reports help a lot: which adapter, which car, what worked.
- Report security problems privately to the repository owner, not in a public issue.
