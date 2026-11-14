# Utsav — Unified Festive Event Platform

Built by **GenOS Team** · MIT License

> *"Every festive-season event — a wedding, a farewell, a Secret Santa, a potluck — runs on the same broken tool: a WhatsApp group chat and five different forms nobody fills. Utsav is the event hub that replaces all five."*

---

## Architecture: One Shared Data Model, Five Modules

Utsav is **one platform**, not five duct-taped wrappers. Every module reads from and writes to the **same `module_records` table**, and the Recap engine runs **one query** (`SELECT module, payload, created_at FROM module_records WHERE event_id = ?`) fanned out by module type.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             events (SQLite)                             │
│  id | name | type | date_start | date_end | modules_enabled | config    │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ 1 : N (event_id)
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         module_records (SQLite)                         │
│         id | event_id | module | payload (JSON) | created_at            │
└───────┬──────────────────┬─────────────────┬──────────────┬─────────────┘
        │                  │                 │              │
        ▼                  ▼                 ▼              ▼
  [ voiceform ]       [ ledger ]        [ album ]     [ potluck / playlist ]
  Audio RSVP +        Unique .XX        EXIF-window   AI Dish Balance +
  Gemini JSON         UPI QR + UTR      Photo Grid    Vibe-Sorted Queue
        │                  │                 │              │
        └──────────────────┴────────┬────────┴──────────────┘
                                    ▼
                           [ recap engine ]
        Single query across module_records → stats + Gemini narrative
```

---

## Modules & Honest Scope Status

| Module | Shipped Features | Scope Notes |
| --- | --- | --- |
| **VoiceForm** | Browser `MediaRecorder` capture, Gemini audio transcription (`gemini-3.5-transcribe`), structured JSON extraction (`gemini-4-hydrogen`), ambiguous-headcount follow-up resolution, function-wise RSVP dashboard, `wa.me` follow-up links | Shipped |
| **Ledger (Gullak)** | Target amount + member list, deterministic unique fractional rupee amounts (`₹5000.07`), `upi://pay` deep links + QR codes, manual Mark Paid + UTR/note reconciliation, generic pooled-cost framing, December Rollup across all events | Android SMS listener deliberately out of scope |
| **Shared Album** | Event invite QR, client-side EXIF timestamp verification via `exifr`, self-tagging & "Photos of me" filter, Download All (`.zip`) | Face recognition / liveness CV pipeline deliberately cut |
| **Potluck & Playlist** | Dish sign-up, Gemini AI near-duplicate detection & headcount category gap analysis, iTunes Search API track lookup with 30s audio preview, upvote queue, vibe-balanced re-sequencing + energy curve | Shipped |
| **Recap** | Public zero-auth `/recap/:eventId` link, single-query cross-module stats, Gemini plain-language narrative, downloadable Recap Card (`.png`) | Shipped |

### Starting-Point Categories
- **Covered:** Wedding (VoiceForm + Shagun Ledger + Album), Gifting / Collections (Pooled Cost Ledger + December Rollup), Get-togethers (Potluck + Playlist + Shared Album), Year-in-review (Recap Engine), Money-in-December (Cross-event Ledger Rollup).
- **Deliberately Not Attempted:** Going Home / commute coordination — cut deliberately due to lack of reliable open public transit and ride-hailing APIs.

---

## Local Development

```bash
npm install
# Ensure GEMINI_API_KEY is set in your environment
npm run dev
```
