import Database from 'better-sqlite3';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AlbumPayload,
  DecemberRollup,
  EventConfig,
  EventType,
  LedgerPayload,
  ModuleKey,
  ModuleRecord,
  PlaylistPayload,
  PotluckPayload,
  RecapStats,
  UtsavEvent,
  VoiceFormPayload,
} from '../src/types.ts';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const uploadsDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'utsav.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    date_start TEXT NOT NULL,
    date_end TEXT NOT NULL,
    host_name TEXT NOT NULL,
    location TEXT NOT NULL,
    modules_enabled TEXT NOT NULL,
    config TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS module_records (
    id TEXT PRIMARY KEY,
    event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_module_records_event_module
    ON module_records(event_id, module);
`);

export const DEFAULT_MODULES_BY_TYPE: Record<EventType, ModuleKey[]> = {
  wedding: ['voiceform', 'ledger', 'album'],
  potluck: ['potluck', 'playlist', 'album'],
  collection: ['ledger'],
  custom: ['voiceform', 'ledger', 'album', 'potluck', 'playlist'],
};

interface RawEventRow {
  id: string;
  name: string;
  type: EventType;
  date_start: string;
  date_end: string;
  host_name: string;
  location: string;
  modules_enabled: string;
  config: string;
  created_at: string;
}

interface RawRecordRow {
  id: string;
  event_id: string;
  module: ModuleKey;
  payload: string;
  created_at: string;
}

function hydrateEvent(row: RawEventRow): UtsavEvent {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    date_start: row.date_start,
    date_end: row.date_end,
    host_name: row.host_name,
    location: row.location,
    modules_enabled: JSON.parse(row.modules_enabled) as ModuleKey[],
    config: JSON.parse(row.config) as EventConfig,
    created_at: row.created_at,
  };
}

function hydrateRecord<T = unknown>(row: RawRecordRow): ModuleRecord<T> {
  return {
    id: row.id,
    event_id: row.event_id,
    module: row.module,
    payload: JSON.parse(row.payload) as T,
    created_at: row.created_at,
  };
}

export function listEvents(): UtsavEvent[] {
  const rows = db.prepare('SELECT * FROM events ORDER BY created_at DESC').all() as RawEventRow[];
  return rows.map(hydrateEvent);
}

export function getEventById(id: string): UtsavEvent | null {
  const row = db.prepare('SELECT * FROM events WHERE id = ?').get(id) as RawEventRow | undefined;
  return row ? hydrateEvent(row) : null;
}

export function createEvent(input: {
  id?: string;
  name: string;
  type: EventType;
  date_start: string;
  date_end: string;
  host_name: string;
  location: string;
  modules_enabled?: ModuleKey[];
  config?: EventConfig;
}): UtsavEvent {
  const id = input.id || crypto.randomUUID().slice(0, 8);
  const modules =
    input.modules_enabled && input.modules_enabled.length > 0
      ? input.modules_enabled
      : DEFAULT_MODULES_BY_TYPE[input.type];
  const now = new Date().toISOString();

  const defaultConfig: EventConfig = {
    functions: input.type === 'wedding' ? ['Mehendi', 'Sangeet', 'Wedding', 'Reception'] : ['Main Gathering'],
    targetAmount: input.type === 'wedding' ? 50000 : input.type === 'collection' ? 15000 : 8000,
    upiId: 'utsav.pool@okicici',
    payeeName: input.host_name,
    ledgerLabel:
      input.type === 'wedding'
        ? 'Shagun & Gift Pool'
        : input.type === 'collection'
          ? 'Group Gift & Farewell Pool'
          : 'Shared Expense Pool',
    expectedHeadcount: input.type === 'wedding' ? 120 : 20,
    ...input.config,
  };

  db.prepare(
    `INSERT INTO events (id, name, type, date_start, date_end, host_name, location, modules_enabled, config, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.type,
    input.date_start,
    input.date_end,
    input.host_name,
    input.location,
    JSON.stringify(modules),
    JSON.stringify(defaultConfig),
    now
  );

  return getEventById(id)!;
}

export function updateEventConfig(id: string, patch: Partial<EventConfig>, modulesEnabled?: ModuleKey[]): UtsavEvent | null {
  const existing = getEventById(id);
  if (!existing) return null;
  const mergedConfig: EventConfig = { ...existing.config, ...patch };
  const mergedModules = modulesEnabled ?? existing.modules_enabled;
  db.prepare('UPDATE events SET config = ?, modules_enabled = ? WHERE id = ?').run(
    JSON.stringify(mergedConfig),
    JSON.stringify(mergedModules),
    id
  );
  return getEventById(id);
}

export function deleteEvent(id: string): boolean {
  const result = db.prepare('DELETE FROM events WHERE id = ?').run(id);
  return result.changes > 0;
}

export function listModuleRecords<T = unknown>(eventId: string, module?: ModuleKey): ModuleRecord<T>[] {
  const rows = module
    ? (db
        .prepare('SELECT * FROM module_records WHERE event_id = ? AND module = ? ORDER BY created_at DESC')
        .all(eventId, module) as RawRecordRow[])
    : (db
        .prepare('SELECT * FROM module_records WHERE event_id = ? ORDER BY created_at DESC')
        .all(eventId) as RawRecordRow[]);
  return rows.map((row) => hydrateRecord<T>(row));
}

export function insertModuleRecord<T extends object>(
  eventId: string,
  module: ModuleKey,
  payload: T,
  customId?: string
): ModuleRecord<T> {
  const id = customId || crypto.randomUUID().slice(0, 12);
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO module_records (id, event_id, module, payload, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, eventId, module, JSON.stringify(payload), now);

  const row = db.prepare('SELECT * FROM module_records WHERE id = ?').get(id) as RawRecordRow;
  return hydrateRecord<T>(row);
}

export function updateModuleRecord(recordId: string, payloadPatch: Record<string, unknown>): ModuleRecord | null {
  const row = db.prepare('SELECT * FROM module_records WHERE id = ?').get(recordId) as RawRecordRow | undefined;
  if (!row) return null;
  const current = JSON.parse(row.payload) as Record<string, unknown>;
  const next = { ...current, ...payloadPatch };
  db.prepare('UPDATE module_records SET payload = ? WHERE id = ?').run(JSON.stringify(next), recordId);
  const updated = db.prepare('SELECT * FROM module_records WHERE id = ?').get(recordId) as RawRecordRow;
  return hydrateRecord(updated);
}

export function deleteModuleRecord(recordId: string): boolean {
  const result = db.prepare('DELETE FROM module_records WHERE id = ?').run(recordId);
  return result.changes > 0;
}

/**
 * Single-query cross-module recap aggregator.
 * Mirrors: SELECT module, payload, created_at FROM module_records WHERE event_id = ?
 */
export function buildRecapStats(eventId: string): RecapStats | null {
  const event = getEventById(eventId);
  if (!event) return null;

  const rows = db
    .prepare('SELECT module, payload, created_at FROM module_records WHERE event_id = ?')
    .all(eventId) as Array<{ module: ModuleKey; payload: string; created_at: string }>;

  const voiceRecords: VoiceFormPayload[] = [];
  const ledgerRecords: LedgerPayload[] = [];
  const albumRecords: AlbumPayload[] = [];
  const potluckRecords: PotluckPayload[] = [];
  const playlistRecords: PlaylistPayload[] = [];

  for (const row of rows) {
    const payload = JSON.parse(row.payload);
    switch (row.module) {
      case 'voiceform':
        voiceRecords.push(payload as VoiceFormPayload);
        break;
      case 'ledger':
        ledgerRecords.push(payload as LedgerPayload);
        break;
      case 'album':
        albumRecords.push(payload as AlbumPayload);
        break;
      case 'potluck':
        potluckRecords.push(payload as PotluckPayload);
        break;
      case 'playlist':
        playlistRecords.push(payload as PlaylistPayload);
        break;
    }
  }

  const functionBreakdown: Record<string, number> = {};
  for (const fn of event.config.functions ?? []) {
    functionBreakdown[fn] = 0;
  }

  let confirmedHeadcount = 0;
  let attendingResponses = 0;
  let declinedResponses = 0;
  let ambiguousCount = 0;

  for (const r of voiceRecords) {
    if (r.ambiguousHeadcount) ambiguousCount += 1;
    if (r.attending) {
      attendingResponses += 1;
      confirmedHeadcount += r.headcount || 1;
      for (const fn of r.functions || []) {
        functionBreakdown[fn] = (functionBreakdown[fn] || 0) + (r.headcount || 1);
      }
    } else {
      declinedResponses += 1;
    }
  }

  const targetAmount = event.config.targetAmount ?? 0;
  const collectedAmount = ledgerRecords
    .filter((l) => l.paid)
    .reduce((sum, l) => sum + Number(l.totalAmount || 0), 0);
  const paidCount = ledgerRecords.filter((l) => l.paid).length;
  const completionPct = targetAmount > 0 ? Math.min(100, Math.round((collectedAmount / targetAmount) * 100)) : 0;

  const contributorSet = new Set<string>();
  const taggedSet = new Set<string>();
  let inWindowCount = 0;
  for (const a of albumRecords) {
    if (a.uploaderName) contributorSet.add(a.uploaderName.trim());
    for (const tag of a.tags || []) {
      if (tag.trim()) taggedSet.add(tag.trim());
    }
    if (a.withinEventWindow) inWindowCount += 1;
  }

  const categoryBreakdown: Record<string, number> = {};
  let totalServings = 0;
  for (const p of potluckRecords) {
    categoryBreakdown[p.category] = (categoryBreakdown[p.category] || 0) + 1;
    totalServings += Number(p.servings || 0);
  }

  const sortedTracks = [...playlistRecords].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  const totalVotes = playlistRecords.reduce((sum, t) => sum + Number(t.votes || 0), 0);
  const topTrack = sortedTracks[0]
    ? {
        trackName: sortedTracks[0].trackName,
        artistName: sortedTracks[0].artistName,
        votes: sortedTracks[0].votes,
      }
    : null;

  const fallbackNarrative = buildDeterministicNarrative(event, {
    confirmedHeadcount,
    attendingResponses,
    collectedAmount,
    paidCount,
    totalPhotos: albumRecords.length,
    uniqueContributors: contributorSet.size,
    totalDishes: potluckRecords.length,
    topTrack,
  });

  return {
    event,
    totalRecords: rows.length,
    voiceform: {
      totalResponses: voiceRecords.length,
      attendingResponses,
      declinedResponses,
      confirmedHeadcount,
      ambiguousCount,
      functionBreakdown,
    },
    ledger: {
      targetAmount,
      collectedAmount: Number(collectedAmount.toFixed(2)),
      paidCount,
      totalContributors: ledgerRecords.length,
      completionPct,
    },
    album: {
      totalPhotos: albumRecords.length,
      uniqueContributors: contributorSet.size,
      taggedPeople: Array.from(taggedSet),
      inWindowCount,
    },
    potluck: {
      totalDishes: potluckRecords.length,
      totalServings,
      categoryBreakdown,
    },
    playlist: {
      totalTracks: playlistRecords.length,
      totalVotes,
      topTrack,
    },
    narrative: event.config.recapNarrative || fallbackNarrative,
  };
}

function buildDeterministicNarrative(
  event: UtsavEvent,
  metrics: {
    confirmedHeadcount: number;
    attendingResponses: number;
    collectedAmount: number;
    paidCount: number;
    totalPhotos: number;
    uniqueContributors: number;
    totalDishes: number;
    topTrack: { trackName: string; artistName: string; votes: number } | null;
  }
): string {
  const parts: string[] = [];
  if (event.modules_enabled.includes('voiceform')) {
    parts.push(`${metrics.confirmedHeadcount} confirmed guests across ${metrics.attendingResponses} voice & form RSVPs`);
  }
  if (event.modules_enabled.includes('ledger')) {
    parts.push(
      `₹${metrics.collectedAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })} pooled from ${metrics.paidCount} contributors`
    );
  }
  if (event.modules_enabled.includes('album')) {
    parts.push(`${metrics.totalPhotos} photos shared by ${Math.max(metrics.uniqueContributors, metrics.totalPhotos > 0 ? 1 : 0)} guests`);
  }
  if (event.modules_enabled.includes('potluck')) {
    parts.push(`${metrics.totalDishes} dishes pledged for the table`);
  }
  if (event.modules_enabled.includes('playlist') && metrics.topTrack) {
    parts.push(`crowd favorite "${metrics.topTrack.trackName}" by ${metrics.topTrack.artistName} leading the queue`);
  }

  if (parts.length === 0) {
    return `${event.name} is ready for guests in ${event.location}. As RSVPs, contributions, photos, and songs arrive, this recap updates automatically from one shared event log.`;
  }

  return `${event.name} in ${event.location} brought everyone together around one shared hub: ${parts.join(', ')}.`;
}

export function getDecemberRollup(): DecemberRollup {
  const events = listEvents();
  const rollupEvents = events
    .filter((ev) => ev.modules_enabled.includes('ledger'))
    .map((ev) => {
      const records = listModuleRecords<LedgerPayload>(ev.id, 'ledger');
      const collectedAmount = records
        .filter((r) => r.payload.paid)
        .reduce((sum, r) => sum + Number(r.payload.totalAmount || 0), 0);
      const paidCount = records.filter((r) => r.payload.paid).length;
      return {
        id: ev.id,
        name: ev.name,
        type: ev.type,
        date_start: ev.date_start,
        targetAmount: ev.config.targetAmount ?? 0,
        collectedAmount: Number(collectedAmount.toFixed(2)),
        paidCount,
        totalContributors: records.length,
      };
    });

  return {
    totalCollected: Number(rollupEvents.reduce((s, e) => s + e.collectedAmount, 0).toFixed(2)),
    totalTarget: Number(rollupEvents.reduce((s, e) => s + e.targetAmount, 0).toFixed(2)),
    totalPaidContributors: rollupEvents.reduce((s, e) => s + e.paidCount, 0),
    events: rollupEvents,
  };
}

function createSampleSvgPhoto(title: string, subtitle: string, bg: string, accent: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="url(#g)"/>
    <circle cx="620" cy="140" r="130" fill="#ffffff" fill-opacity="0.14"/>
    <circle cx="170" cy="470" r="180" fill="#ffffff" fill-opacity="0.10"/>
    <rect x="64" y="420" width="672" height="116" rx="12" fill="#18181B" fill-opacity="0.62"/>
    <text x="92" y="472" fill="#FAFAF8" font-family="system-ui, sans-serif" font-size="30" font-weight="600">${title}</text>
    <text x="92" y="508" fill="#E4E4E7" font-family="system-ui, sans-serif" font-size="18">${subtitle}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function seedInitialDataIfEmpty(): void {
  const existing = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
  if (existing.count > 0) return;

  // Event 1: Concrete Featured Wedding Event (Bengaluru, Nov 2026)
  const wedding = createEvent({
    id: 'meera-arjun-26',
    name: 'Meera & Arjun — Sangeet & Wedding',
    type: 'wedding',
    date_start: '2026-11-25',
    date_end: '2026-11-27',
    host_name: 'Kavita Rao',
    location: 'BIEC Courtyard, Bengaluru',
    modules_enabled: ['voiceform', 'ledger', 'album'],
    config: {
      functions: ['Mehendi', 'Sangeet', 'Wedding', 'Reception'],
      targetAmount: 25000,
      upiId: 'kavita.utsav@okicici',
      payeeName: 'Kavita Rao (Shagun Pool)',
      ledgerLabel: 'Shagun & Gift Pool',
      expectedHeadcount: 140,
    },
  });

  const voiceSeeds: VoiceFormPayload[] = [
    {
      guestName: 'Rohan Kulkarni',
      phone: '9845011223',
      attending: true,
      headcount: 3,
      ambiguousHeadcount: false,
      functions: ['Sangeet', 'Wedding', 'Reception'],
      dietaryNotes: '2 Veg, 1 Jain (no onion/garlic)',
      arrivalNote: 'Landing BLR Nov 25, 11:30 AM',
      transcript:
        'Hi Kavita! Rohan here. Three of us are flying in on the 25th morning at 11:30. We will attend Sangeet, Wedding, and Reception. One Jain meal needed please.',
      source: 'voice',
    },
    {
      guestName: 'Ananya & Vikram Nair',
      phone: '9880244510',
      attending: true,
      headcount: 2,
      ambiguousHeadcount: false,
      functions: ['Mehendi', 'Sangeet', 'Wedding'],
      dietaryNotes: 'Vegetarian',
      arrivalNote: 'Driving from Indiranagar',
      transcript:
        'Namaste, Ananya and Vikram confirming for two people for Mehendi, Sangeet, and the morning Wedding. Both vegetarian.',
      source: 'voice',
    },
    {
      guestName: 'Suresh Uncle (Mysuru)',
      phone: '9900188732',
      attending: true,
      headcount: 4,
      ambiguousHeadcount: true,
      clarificationQuestion: 'Transcript said "4 or maybe 5 if cousins join" — confirm exact headcount?',
      functions: ['Wedding', 'Reception'],
      dietaryNotes: 'No restrictions',
      arrivalNote: 'Arriving by Shatabdi Express',
      transcript:
        'Kavita, Suresh speaking from Mysuru. Me and the family will come for the Wedding and Reception, 4 or maybe 5 if cousins join from Mandya.',
      source: 'voice',
    },
    {
      guestName: 'Deepika Menon',
      phone: '9741099201',
      attending: false,
      headcount: 0,
      ambiguousHeadcount: false,
      functions: [],
      dietaryNotes: '',
      arrivalNote: 'Out of town for conference',
      transcript:
        'So sorry to miss it! Deepika here, traveling to Singapore that week so I cannot make it, sending shagun via UPI.',
      source: 'voice',
    },
  ];
  for (const v of voiceSeeds) {
    insertModuleRecord(wedding.id, 'voiceform', v);
  }

  const ledgerSeeds: LedgerPayload[] = [
    {
      memberName: 'Rohan Kulkarni',
      phone: '9845011223',
      baseAmount: 5000,
      fractionCents: 7,
      totalAmount: 5000.07,
      paid: true,
      utr: 'UTR631940281944',
      receiptNote: 'GPay confirmed',
      paidAt: '2026-11-12T10:15:00Z',
    },
    {
      memberName: 'Deepika Menon',
      phone: '9741099201',
      baseAmount: 5000,
      fractionCents: 13,
      totalAmount: 5000.13,
      paid: true,
      utr: 'UTR631952810023',
      receiptNote: 'PhonePe transfer',
      paidAt: '2026-11-12T14:40:00Z',
    },
    {
      memberName: 'Ananya Nair',
      phone: '9880244510',
      baseAmount: 5000,
      fractionCents: 19,
      totalAmount: 5000.19,
      paid: true,
      utr: 'UTR631971294511',
      receiptNote: 'Paid at rehearsal dinner',
      paidAt: '2026-11-13T08:05:00Z',
    },
    {
      memberName: 'Karthik Hegde',
      phone: '9845177320',
      baseAmount: 5000,
      fractionCents: 23,
      totalAmount: 5000.23,
      paid: false,
    },
    {
      memberName: 'Priya Subramanian',
      phone: '9986011498',
      baseAmount: 5000,
      fractionCents: 29,
      totalAmount: 5000.29,
      paid: false,
    },
  ];
  for (const l of ledgerSeeds) {
    insertModuleRecord(wedding.id, 'ledger', l);
  }

  const albumSeeds: AlbumPayload[] = [
    {
      imageUrl: createSampleSvgPhoto(
        'Marigold Mandap Setup',
        'Captured Nov 25 · 09:42 AM · EXIF Verified',
        '#9A3412',
        '#EA580C'
      ),
      uploaderName: 'Ananya Nair',
      caption: 'Morning marigold garland prep before guests arrive',
      tags: ['Ananya', 'Meera', 'Mandap'],
      exifTimestamp: '2026-11-25T09:42:00',
      withinEventWindow: true,
    },
    {
      imageUrl: createSampleSvgPhoto(
        'Sangeet Soundcheck',
        'Captured Nov 25 · 06:15 PM · EXIF Verified',
        '#1E293B',
        '#B45309'
      ),
      uploaderName: 'Rohan Kulkarni',
      caption: 'Cousins practicing the finale medley on stage',
      tags: ['Rohan', 'Arjun', 'Sangeet'],
      exifTimestamp: '2026-11-25T18:15:00',
      withinEventWindow: true,
    },
    {
      imageUrl: createSampleSvgPhoto(
        'Mehendi Courtyard',
        'Captured Nov 25 · 02:10 PM · EXIF Verified',
        '#14532D',
        '#CA8A04'
      ),
      uploaderName: 'Kavita Rao',
      caption: 'Afternoon chai & mehendi corner in the courtyard',
      tags: ['Meera', 'Kavita'],
      exifTimestamp: '2026-11-25T14:10:00',
      withinEventWindow: true,
    },
  ];
  for (const a of albumSeeds) {
    insertModuleRecord(wedding.id, 'album', a);
  }

  // Event 2: Potluck + Playlist
  const potluck = createEvent({
    id: 'indiranagar-potluck',
    name: 'Indiranagar Terrace Potluck & Vinyl Night',
    type: 'potluck',
    date_start: '2026-11-28',
    date_end: '2026-11-28',
    host_name: 'Siddharth Verma',
    location: '12th Main Terrace, Indiranagar',
    modules_enabled: ['potluck', 'playlist', 'album'],
    config: {
      functions: ['Terrace Gathering'],
      expectedHeadcount: 18,
      targetAmount: 6000,
      ledgerLabel: 'Drinks & Ice Pool',
    },
  });

  const potluckSeeds: PotluckPayload[] = [
    { guestName: 'Maya', dishName: 'Paneer Butter Masala', category: 'Main', servings: 8, dietary: 'Veg' },
    { guestName: 'Nikhil', dishName: 'Butter Paneer & Naan', category: 'Main', servings: 6, dietary: 'Veg' },
    { guestName: 'Tanya', dishName: 'Tiramisu Tray', category: 'Dessert', servings: 10, dietary: 'Veg' },
    { guestName: 'Kabir', dishName: 'Gulab Jamun Box', category: 'Dessert', servings: 12, dietary: 'Veg' },
    { guestName: 'Zoya', dishName: 'Mango Cheesecake Cups', category: 'Dessert', servings: 8, dietary: 'Veg' },
    { guestName: 'Dev', dishName: 'Spiced Masala Peanuts', category: 'Starter', servings: 10, dietary: 'Vegan' },
  ];
  for (const p of potluckSeeds) {
    insertModuleRecord(potluck.id, 'potluck', p);
  }

  const playlistSeeds: PlaylistPayload[] = [
    {
      trackName: 'Ilahi',
      artistName: 'Arijit Singh',
      albumName: 'Yeh Jawaani Hai Deewani',
      genre: 'Bollywood Indie',
      durationSec: 213,
      estimatedBpm: 118,
      energyTier: 'high',
      addedBy: 'Siddharth',
      votes: 9,
    },
    {
      trackName: 'Kun Faya Kun',
      artistName: 'A.R. Rahman',
      albumName: 'Rockstar',
      genre: 'Sufi Acoustic',
      durationSec: 472,
      estimatedBpm: 76,
      energyTier: 'chill',
      addedBy: 'Maya',
      votes: 8,
    },
    {
      trackName: 'Chaand Baaliyan',
      artistName: 'Aditya A',
      albumName: 'Single',
      genre: 'Indie Pop',
      durationSec: 103,
      estimatedBpm: 84,
      energyTier: 'chill',
      addedBy: 'Tanya',
      votes: 7,
    },
    {
      trackName: 'Gallan Goodiyaan',
      artistName: 'Shankar-Ehsaan-Loy',
      albumName: 'Dil Dhadakne Do',
      genre: 'Dance Pop',
      durationSec: 295,
      estimatedBpm: 128,
      energyTier: 'high',
      addedBy: 'Kabir',
      votes: 6,
    },
    {
      trackName: 'Khaabon Ke Parinday',
      artistName: 'Mohit Chauhan',
      albumName: 'Zindagi Na Milegi Dobara',
      genre: 'Roadtrip Acoustic',
      durationSec: 252,
      estimatedBpm: 104,
      energyTier: 'mid',
      addedBy: 'Zoya',
      votes: 5,
    },
  ];
  for (const pl of playlistSeeds) {
    insertModuleRecord(potluck.id, 'playlist', pl);
  }

  // Event 3: Secret Santa / Collection Event (Demonstrating generic pooled-cost ledger framing)
  const collection = createEvent({
    id: 'genos-secret-santa',
    name: 'GenOS Team — Secret Santa & Year-End Gift Pool',
    type: 'collection',
    date_start: '2026-12-18',
    date_end: '2026-12-20',
    host_name: 'GenOS Team',
    location: 'Bengaluru Studio',
    modules_enabled: ['ledger'],
    config: {
      functions: ['Gift Exchange'],
      targetAmount: 12000,
      upiId: 'genos.pool@okicici',
      payeeName: 'GenOS Team Pool',
      ledgerLabel: 'Secret Santa Pooled Fund',
      expectedHeadcount: 10,
    },
  });

  const collectionLedgerSeeds: LedgerPayload[] = [
    {
      memberName: 'Aarav',
      baseAmount: 1500,
      fractionCents: 7,
      totalAmount: 1500.07,
      paid: true,
      utr: 'UTR632011849201',
      paidAt: '2026-11-13T09:10:00Z',
    },
    {
      memberName: 'Ishita',
      baseAmount: 1500,
      fractionCents: 13,
      totalAmount: 1500.13,
      paid: true,
      utr: 'UTR632011899412',
      paidAt: '2026-11-13T09:45:00Z',
    },
    {
      memberName: 'Pranav',
      baseAmount: 1500,
      fractionCents: 19,
      totalAmount: 1500.19,
      paid: false,
    },
    {
      memberName: 'Neha',
      baseAmount: 1500,
      fractionCents: 23,
      totalAmount: 1500.23,
      paid: false,
    },
  ];
  for (const cl of collectionLedgerSeeds) {
    insertModuleRecord(collection.id, 'ledger', cl);
  }
}
