# Salty-Cluster – Battle Royale for Conference Expo Floors

## The problem
At big tech conferences, the biggest sponsors win attention with huge booths, branded staff and great swag. Smaller sponsors and open-source projects get lost on the floor, and attendees miss them.

What we heard today:
- Attendee: "If they have nice swag, then I'm stopping by... you never know who has the coolest swag until you see someone else with the swag."
- Attendee: "You're not going to find people randomly. You find some, but you miss others."
- Sponsor: "You want to be as large as your competitors, even if you're like the underdog."
- Sponsors don't measure foot traffic. They measure demos, then proofs of concept, then customers.

Passport games try to fix this, but they send everyone to the same booths and count scans, not demos.

## Our solution
A web app that turns the expo floor into a battle royale:
- The organizer controls a shrinking circle that guides people to where the conference needs them.
- Attendees check in at booths with a QR code and answer one question about the demo.
- Least-visited booths give bonus points, so traffic spreads across the floor.
- Live leaderboard, with prizes for the top 3 attendee.

## Architecture
- Frontend: [TBD]
- Backend: [TBD]
- Elasticsearch: booths as geo-points, circle as a geo query, leaderboard and bonus points with aggregations
- Kubernetes on Radar, deployed with Argo CD
- OpenTelemetry + Dash0 for traces, logs and metrics
- Gitar reviews every pull request

## How to run it
[Setup steps]

## Tracks
Elastic · Radar · Dash0 · Sonar (Gitar)

## Use of AI tools
[List the AI coding assistants used]

## Team
Salt Cluster: [names]
