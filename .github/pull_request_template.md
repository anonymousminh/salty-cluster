## What & why
<!-- Which attendee / sponsor / organizer problem does this solve? -->

## Area
- [ ] game (apps/web)  - [ ] console  - [ ] api  - [ ] venue rules  - [ ] elastic  - [ ] otel  - [ ] k8s / argo  - [ ] docs

## Checklist
- [ ] Game rules changed in `packages/venue` only (shared by game, console and server), with tests
- [ ] The server still recomputes XP, zone and quiz; nothing new is trusted from the client
- [ ] No QR codes or session ids in responses, logs, spans or metrics
- [ ] New endpoints have spans/`game.*` metrics and structured logs
- [ ] Mapping change? Migration note (docs/elasticsearch.md)
- [ ] K8s: requests/limits, probes, no `latest` tags
- [ ] UI change passes `pnpm e2e` (axe)

## Evidence
<!-- Screenshots: game, console, Dash0, Radar -->
