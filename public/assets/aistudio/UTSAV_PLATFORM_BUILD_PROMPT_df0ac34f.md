# Utsav — unified festive-event platform, build prompt for an AI coding agent

**Event:** WeMakeDevs Festive Hacks, BIEC Bengaluru, Wed 25 Nov 2026, 9:00 AM–~5:00 PM IST, single on-site sitting.
**Compliance guardrail:** rule 4 — main coding/design starts only after 9:00 AM 25 Nov. Pre-event work is research/notes/design/rehearsal ONLY, never shipped code.
**Eligibility fact, non-negotiable:** rule 1 caps the submitting team at 4 people. Only 4 names are on the roster, present at BIEC, and eligible for the prize. A 10+ person group's real leverage is pre-event prep (allowed) feeding a fast, rehearsed 4-person build (the only legal on-floor execution). Anyone outside the 4 who wants to physically attend must individually apply on Luma under their own team and will not be credited on this submission — say this to the group before the day, not after.

Team attribution: **GenOS Team** everywhere. MIT license.

---

## 1. The pitch (lead with this, not a feature list)

*"Every festive-season event — a wedding, a farewell, a Secret Santa, a potluck — runs on the same broken tool: a WhatsApp group chat and five different forms nobody fills. Utsav is the event hub that replaces all five."*

A host creates ONE event, picks a type, and Utsav activates the right modules automatically:
- **Wedding / big function** → voice RSVP (VoiceForm) + shagun ledger + shared album.
- **Potluck / house party** → dish sign-up + playlist voting + shared album.
- **Secret Santa / group gift / farewell collection** → pooled-cost ledger only.

Every event, regardless of type, ends with an auto-generated **recap** — the Year-in-review bullet, built once, reused everywhere: "This wedding: 640 RSVPs, ₹48,000 shagun from 86 contributors, 312 photos from 40 guests."

**Say this explicitly in the demo, out loud, in the first 15 seconds:** this is not five apps. It's one event hub with one coordinator persona and one shared data model. The breadth is the point — it's what "actually used this season" looks like for someone who runs more than one of these events — but the demo must open on ONE concrete event (pick a real one happening that week) so judges see a moment, not a menu.

## 2. Judge-fit framing

- **Kunal:** one open-source platform, not five unrelated repos; real floor traction across multiple module types in one day is a stronger community story than one narrow app.
- **Hitesh:** the risk he'll flag first is "this is five AI wrappers duct-taped together." Counter it explicitly in the README and the demo narration: show the ONE shared event/module schema every feature writes to, and the ONE recap engine that reads across all of them — that's the architectural reason it's a platform, not a grab bag.
- **Saiyam:** one deployable unit, one Postgres schema, modules as route groups not separate services — don't over-engineer into microservices for a one-day hack; a monolith with clean module boundaries is the right scale here.

## 3. Stack (revised from the single-module VoiceForm prompt — upgraded storage)

- **Framework:** Next.js 14 App Router + TypeScript, one repo, one deploy (Vercel).
- **Database:** Supabase Postgres (not Upstash Redis — a recap engine querying across four modules needs real relational/JSON queries, not Redis list scans). Use Supabase's JS client; store module-specific payloads in `jsonb` columns against a shared `events` / `event_modules` / `module_records` table shape (section 6).
- **Audio capture (VoiceForm module):** browser `MediaRecorder`, as before.
- **STT + extraction:** Groq REST via `fetch` (not the SDK), as before — already-verified key, read from env, never pasted in chat.
- **Photo upload (Shared Album module):** direct-to-Supabase-Storage upload from the browser (signed URL), EXIF read client-side via `exifr` to filter to the event time window before upload — **no face-recognition pipeline.** That CV pipeline was roasted out for a one-day build already; do not reintroduce it here under a bigger team's confidence. A bigger team still has the same 8-hour clock.
- **Playlist module:** a public music API for track metadata/audio features (verify exact provider and field names as a Day-1 spike — don't assume a specific API's tempo/energy fields are still available under its current free tier; APIs in this space have changed access terms before).
- **QR codes, `wa.me` links, UPI deep links:** same zero-dependency tricks as the VoiceForm/Gullak prompts.
- **Repo:** public, name `utsav`, root `LICENSE` (MIT).

## 4. Env vars

```
GROQ_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_BASE_URL=
MUSIC_API_KEY=         # whichever provider the Day-1 spike confirms
```

## 5. Day-1 spikes — run first, each can flip a module's scope

1. VoiceForm's two spikes from `VOICEFORM_BUILD_PROMPT.md` (Groq Whisper model id + webm acceptance; JSON-mode reliability) — unchanged, still the riskiest single piece.
2. Supabase project provisioning speed + signed-upload-URL flow for Storage — confirm it's fast enough to not eat the first hour.
3. The chosen music API's current auth model and whether audio-feature fields (tempo/energy) are still exposed on a free/dev tier — if not, cut the "re-sequence by vibe" feature and fall back to plain vote-count ordering (still shippable, just less impressive).
4. UPI deep-link (`upi://pay?...`) behavior on at least 2 real UPI apps on real phones — confirm the parameter set that actually prefills amount + payee reliably, per the Gullak risk already on file.
5. Confirm Vercel function timeout against the heaviest chained call (VoiceForm's transcribe+extract, or a recap generation call touching 4 tables) — set `maxDuration` per-route as needed.

## 6. Shared data model (the thing that makes this ONE platform, not five apps — this is the artifact to point to when Hitesh asks "is this just five wrappers?")

```sql
events (
  id uuid primary key,
  name text,
  type text, -- 'wedding' | 'potluck' | 'collection' | custom
  modules_enabled text[], -- which of voiceform/ledger/album/potluck/playlist are active
  created_at timestamptz
);

module_records (
  id uuid primary key,
  event_id uuid references events(id),
  module text, -- 'voiceform' | 'ledger' | 'album' | 'potluck' | 'playlist'
  payload jsonb, -- module-specific shape, validated per-module in app code, not in SQL
  created_at timestamptz
);
```

Every module writes rows into the SAME `module_records` table with its own `payload` shape. The recap engine (section 9) is ONE query (`select module, payload from module_records where event_id = ?`) fanned out by module type — this single shared table is the concrete answer to "why is this a platform and not five apps," and it should be in the README's architecture section verbatim, not just implied.

## 7. Modules — scope, Must/Should/Could per module

### 7.1 VoiceForm (Wedding/RSVP)
Reuse `VOICEFORM_BUILD_PROMPT.md` almost unchanged — swap its Redis storage for a `module_records` row with `module='voiceform'`. Must: record→transcribe→extract→store→event-scoped dashboard view. Should: ambiguous-number follow-up. Could: second schema preset (less important now that Utsav itself is the "it's generic" proof — don't duplicate the argument).

### 7.2 Ledger (Gullak — shagun/gifts/collections/trip-splits/December budget)
**Must:** host sets a target amount + member list, each member gets a unique fractional amount (₹500.07) and a `upi://pay` deep link + QR, manual "mark paid" + UTR/screenshot field, live collected-vs-target bar.
**Should:** a generic "pooled cost" framing in the UI copy so the same engine visibly serves shagun, Secret Santa pooling, and a trip split without code changes — demo this by creating two differently-named events live and showing the same engine under both.
**Could:** a read-only "your December" rollup view summing collected totals across all of a host's past events (covers the Money-in-December bullet cheaply, no new engine).
**Out of scope:** the Android SMS-notification-listener automation from the original Gullak idea — still too fragile for one day, same reasoning as before, a bigger team doesn't buy back that specific risk (it's a permissions/OS-version/bank-app-format problem, not a headcount problem).

### 7.3 Shared Album (Get-togethers)
**Must:** event QR → guest uploads today's photos (EXIF-filtered client-side to the event window) → simple grid gallery, no login, no face search.
**Should:** a guest can tag themselves by typing a name (manual, not face-detected) so the gallery can filter "photos of me" without any CV pipeline.
**Could:** download-all as a zip.
**Out of scope:** face detection/matching/liveness/hide-me — this is the full BhejDe pipeline that was roasted out for being undeliverable in 8 hours; it is equally undeliverable with 4 people in 8 hours. Don't resurrect it because the team got bigger; the clock didn't.

### 7.4 Potluck + Playlist (Get-togethers)
**Must — potluck side:** guests tag what they're bringing (free text), an LLM pass dedupes near-duplicate dish names and flags category gaps (too many desserts, no mains) against headcount.
**Must — playlist side:** guests add a song via search, a simple upvote count orders the queue.
**Should:** if the Day-1 music-API spike confirms tempo/energy fields are available, re-sequence the queue to avoid two slow songs back to back — this is the one piece of real technical depth in this module, worth the spike time. If the spike fails, ship vote-count ordering only and say so honestly in the README rather than claiming a feature that silently doesn't work.
**Could:** a "vibe graph" visualization of the queue's energy over time.

### 7.5 Recap (Year in review — the capstone, build this last, by whoever finishes their module first)
**Must:** one page, one event, pulls every `module_records` row for that event, renders a simple stat block per active module (RSVP counts per function, ₹ collected, photos pooled, top-voted song) plus one LLM-written paragraph narrating it in plain language. This is also your demo's closing beat.
**Should:** a shareable public recap link (`/recap/:eventId`), no auth, so judges can open it themselves on their own phones.
**Could:** an auto-generated shareable image (not video) of the recap stats for a "send to the family group" moment.

## 8. Team roster (4 on-floor, officially credited)

- **A — Platform/infra lead:** repo scaffold, Supabase schema + client, event creation flow, module-activation UI, deploy, the Day-1 spikes in section 5 at 9:00 sharp, and the integration glue that makes B/C/D's modules actually write to the shared table correctly.
- **B — VoiceForm + Ledger backend:** both modules own the "real AI / real money" demo beats; highest technical-risk owner, gets first claim on help if something slips.
- **C — Album + Potluck/Playlist frontend:** both are lighter-weight, UI-heavy, good pairing for one person; owns the Day-1 music-API spike.
- **D — Recap engine + demo + README + submission:** starts the recap page skeleton early (against mock data) so it's not a last-hour scramble, owns the floor-testing push, the video, and the secret-scan/submission checklist.

**Pre-event prep squad (everyone else, off-roster, non-code):** wireframes for all 5 screens, the `events`/`module_records` schema reviewed and agreed on paper before the 25th, the music-API choice researched and written up (not integrated), the demo script and narration drafted, 15-20 real floor-testers recruited and briefed on when/where to show up at BIEC, the README skeleton and comparison-table research (Weddingkart, MoiApp/ShagunBook, Kwikpic, DrawNames/Elfster, Spotify Wrapped) done in advance as notes.

## 9. Hour-by-hour plan, 9:00–17:00 (tight — four modules in one day is real pressure, protect the Must list ruthlessly)

- **9:00–9:45:** Day-1 spikes (section 5) run live, all four people in parallel on their own spike. Platform lead also scaffolds the repo + schema during this slot.
- **9:45–10:30:** Event-creation flow + module-activation UI working end to end against the real schema (blocks everyone else — prioritize ruthlessly).
- **10:30–13:00:** Each of B, C, D builds their module's Must-have scope in parallel against the now-working schema. Platform lead floats between them unblocking integration issues.
- **13:00–13:30:** First end-to-end rehearsal: create one real event, exercise every Must-have module once, fix what's broken.
- **13:30–14:30:** Mandatory floor-testing slot — get real strangers to RSVP, pay into the ledger, upload photos, vote on a song, for ONE real or staged event. This is your usage evidence for the video and README; there's no week left to gather it any other way.
- **14:30–15:30:** Should-have features per module, triaged live based on what actually has time (ambiguous-number follow-up, playlist re-sequencing, pooled-cost generic framing demo) — cut anything not done by 15:30, no exceptions.
- **15:30–16:00:** Recap engine finished and pointed at the real event's real data from the floor test.
- **16:00–16:30:** README (architecture section must show the shared-table diagram from section 6 explicitly), secret-scan, LICENSE check, comparison table.
- **16:30–16:50:** Record the demo video.
- **16:50–17:00:** Submit. Do not wait for the literal deadline.

## 10. Demo video outline (≤3 min)

- 0:00–0:15: the one-persona pitch from section 1, stated plainly, not five features listed.
- 0:15–0:40: create one real event live, show module auto-activation.
- 0:40–1:40: one beat per module, each ~15s, each showing a REAL person (a judge, a stranger from the floor-test) doing the action — voice RSVP, paying into the ledger, uploading a photo, voting a song — not a staged click-through.
- 1:40–2:10: the shared-table architecture diagram, 10 seconds, visual not verbal — this is the direct answer to "is this just five wrappers."
- 2:10–2:40: the recap page, opened live on a judge's own phone via a shared link, populated with real numbers from the floor test.
- 2:40–2:50: "Open source, self-host it, bring your own event type."

## 11. Acceptance criteria

- [ ] One event, created live, with at least 3 of the 4 feature modules active and exercised by real people (not the builders) during the floor-test slot.
- [ ] The recap page renders correctly from real floor-test data, reachable by a public link with no auth.
- [ ] The shared `module_records` architecture is visible in the README as an explicit diagram, not just prose.
- [ ] Every module's Must-have bar from section 7 is met; any Should/Could not finished is stated honestly in the README as "not shipped," not silently absent.
- [ ] Fresh clone → `npm install` → `.env.local` filled → `npm run dev` works with no undocumented step.
- [ ] No secrets in the tracked tree (same grep check as the VoiceForm prompt, now also covering the Supabase service-role key pattern).
- [ ] Demo video under 3 minutes, real people in it, tested in incognito.
- [ ] MIT `LICENSE` at repo root, "GenOS Team" attribution, no personal name anywhere.
- [ ] README states plainly which starting-point categories are covered (wedding, gifting, get-togethers, year-in-review, money-in-December) and which is explicitly NOT attempted (going home — no reliable public transit/ride API, stated as a deliberate scope cut, not an oversight).
