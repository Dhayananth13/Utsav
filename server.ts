import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  analyzePotluckMenu,
  classifyTrackEnergy,
  extractVoiceRsvp,
  generateRecapNarrative,
  transcribeAudioBuffer,
} from './server/ai.ts';
import {
  buildRecapStats,
  createEvent,
  deleteEvent,
  deleteModuleRecord,
  getDecemberRollup,
  getEventById,
  insertModuleRecord,
  listEvents,
  listModuleRecords,
  seedInitialDataIfEmpty,
  updateEventConfig,
  updateModuleRecord,
  uploadsDir,
} from './server/db.ts';
import type {
  AlbumPayload,
  EventConfig,
  EventType,
  LedgerPayload,
  ModuleKey,
  ModuleRecord,
  PlaylistPayload,
  PotluckPayload,
  VoiceFormPayload,
} from './src/types.ts';

dotenv.config();
seedInitialDataIfEmpty();

const PRIME_CENTS = [7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97];

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '25mb' }));
  app.use('/uploads', express.static(uploadsDir));

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'utsav' });
  });

  // Events CRUD
  app.get('/api/events', (_req, res) => {
    res.json(listEvents());
  });

  app.post('/api/events', (req, res) => {
    try {
      const { name, type, date_start, date_end, host_name, location, modules_enabled, config } = req.body as {
        name: string;
        type: EventType;
        date_start: string;
        date_end: string;
        host_name: string;
        location: string;
        modules_enabled?: ModuleKey[];
        config?: EventConfig;
      };

      if (!name?.trim() || !type || !date_start || !host_name?.trim()) {
        res.status(400).json({ error: 'Event name, type, start date, and host name are required.' });
        return;
      }

      const event = createEvent({
        name: name.trim(),
        type,
        date_start,
        date_end: date_end || date_start,
        host_name: host_name.trim(),
        location: location?.trim() || 'Bengaluru',
        modules_enabled,
        config,
      });
      res.status(201).json(event);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create event' });
    }
  });

  app.get('/api/events/:id', (req, res) => {
    const event = getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(event);
  });

  app.patch('/api/events/:id', (req, res) => {
    const { config, modules_enabled } = req.body as {
      config?: Partial<EventConfig>;
      modules_enabled?: ModuleKey[];
    };
    const updated = updateEventConfig(req.params.id, config ?? {}, modules_enabled);
    if (!updated) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/events/:id', (req, res) => {
    const ok = deleteEvent(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // Generic Module Records endpoints
  app.get('/api/events/:id/records', (req, res) => {
    const event = getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    const mod = req.query.module as ModuleKey | undefined;
    res.json(listModuleRecords(event.id, mod));
  });

  app.post('/api/events/:id/records', (req, res) => {
    const event = getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    const { module, payload } = req.body as { module: ModuleKey; payload: Record<string, unknown> };
    if (!module || !payload) {
      res.status(400).json({ error: 'module and payload are required.' });
      return;
    }
    const record = insertModuleRecord(event.id, module, payload);
    res.status(201).json(record);
  });

  app.patch('/api/records/:recordId', (req, res) => {
    const updated = updateModuleRecord(req.params.recordId, req.body as Record<string, unknown>);
    if (!updated) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.json(updated);
  });

  app.delete('/api/records/:recordId', (req, res) => {
    const ok = deleteModuleRecord(req.params.recordId);
    if (!ok) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    res.json({ deleted: true });
  });

  // Module 1: VoiceForm Audio Transcription + Structured RSVP Extraction
  app.post('/api/events/:id/voiceform/extract', async (req, res) => {
    try {
      const event = getEventById(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const { audioBase64, mimeType, transcriptInput } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        transcriptInput?: string;
      };

      let transcript = (transcriptInput ?? '').trim();
      let source: 'voice' | 'text' = 'text';

      if (audioBase64 && !transcript) {
        source = 'voice';
        transcript = await transcribeAudioBuffer(audioBase64, mimeType || 'audio/webm');
      }

      if (!transcript) {
        res.status(400).json({ error: 'Please record a voice note or enter a transcript.' });
        return;
      }

      const availableFunctions = event.config.functions?.length
        ? event.config.functions
        : ['Main Event'];

      const extracted = await extractVoiceRsvp(transcript, availableFunctions);
      const payload: VoiceFormPayload = {
        ...extracted,
        transcript,
        source,
      };

      const record = insertModuleRecord(event.id, 'voiceform', payload);
      res.status(201).json(record);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to process voice RSVP',
      });
    }
  });

  // Module 2: Ledger batch member creation with unique fractional rupee amounts
  app.post('/api/events/:id/ledger/add-members', (req, res) => {
    const event = getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }

    const { members, baseAmount } = req.body as {
      members: Array<{ name: string; phone?: string }>;
      baseAmount: number;
    };

    if (!Array.isArray(members) || members.length === 0 || !baseAmount || baseAmount <= 0) {
      res.status(400).json({ error: 'Provide at least one member and a positive base amount.' });
      return;
    }

    const existing = listModuleRecords<LedgerPayload>(event.id, 'ledger');
    const usedCents = new Set(existing.map((r) => r.payload.fractionCents));

    const created: ModuleRecord<LedgerPayload>[] = [];
    for (const m of members) {
      if (!m.name.trim()) continue;
      let fraction = PRIME_CENTS.find((c) => !usedCents.has(c));
      if (!fraction) {
        let candidate = 11;
        while (usedCents.has(candidate) && candidate < 99) candidate += 2;
        fraction = candidate % 100;
      }
      usedCents.add(fraction);
      const totalAmount = Number((Number(baseAmount) + fraction / 100).toFixed(2));
      const payload: LedgerPayload = {
        memberName: m.name.trim(),
        phone: m.phone?.trim() || '',
        baseAmount: Number(baseAmount),
        fractionCents: fraction,
        totalAmount,
        paid: false,
      };
      created.push(insertModuleRecord(event.id, 'ledger', payload));
    }

    res.status(201).json(created);
  });

  // Module 3: Shared Album photo upload
  app.post('/api/events/:id/album/upload', (req, res) => {
    try {
      const event = getEventById(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }

      const { dataUrl, uploaderName, caption, tags, exifTimestamp, withinEventWindow } = req.body as {
        dataUrl: string;
        uploaderName: string;
        caption?: string;
        tags?: string[];
        exifTimestamp?: string;
        withinEventWindow?: boolean;
      };

      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
        res.status(400).json({ error: 'Valid image data is required.' });
        return;
      }

      const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: 'Invalid base64 image encoding.' });
        return;
      }

      const ext = match[1] === 'jpeg' ? 'jpg' : match[1].replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'png';
      const filename = `${event.id}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));

      const payload: AlbumPayload = {
        imageUrl: `/uploads/${filename}`,
        uploaderName: uploaderName?.trim() || 'Guest',
        caption: caption?.trim() || '',
        tags: Array.isArray(tags) ? tags.map((t) => t.trim()).filter(Boolean) : [],
        exifTimestamp,
        withinEventWindow: withinEventWindow ?? true,
      };

      const record = insertModuleRecord(event.id, 'album', payload);
      res.status(201).json(record);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to upload photo' });
    }
  });

  // Module 4a: Potluck AI Dish Deduplication & Gap Check
  app.post('/api/events/:id/potluck/analyze', async (req, res) => {
    try {
      const event = getEventById(req.params.id);
      if (!event) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const rows = listModuleRecords<PotluckPayload>(event.id, 'potluck');
      const analysis = await analyzePotluckMenu(
        rows.map((r) => r.payload),
        event.config.expectedHeadcount ?? 20
      );
      res.json(analysis);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to analyze potluck menu' });
    }
  });

  // Module 4b: Music Search (iTunes public API + energy classification)
  app.get('/api/music/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (!query) {
      res.json([]);
      return;
    }

    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=8`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Music search failed with ${response.status}`);
      }
      const data = (await response.json()) as {
        results: Array<{
          trackId: number;
          trackName: string;
          artistName: string;
          collectionName?: string;
          artworkUrl100?: string;
          previewUrl?: string;
          trackTimeMillis?: number;
          primaryGenreName?: string;
        }>;
      };

      const tracks = (data.results ?? []).map((item) => {
        const energy = classifyTrackEnergy(item.trackName, item.primaryGenreName);
        return {
          trackId: String(item.trackId),
          trackName: item.trackName,
          artistName: item.artistName,
          albumName: item.collectionName || '',
          artworkUrl: item.artworkUrl100 || '',
          previewUrl: item.previewUrl || '',
          durationSec: item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : 200,
          genre: item.primaryGenreName || 'Pop',
          estimatedBpm: energy.bpm,
          energyTier: energy.energyTier,
        };
      });

      res.json(tracks);
    } catch {
      res.json([]);
    }
  });

  // Module 4b: Vibe-balanced re-sequencing (prevents two slow/chill tracks back-to-back)
  app.post('/api/events/:id/playlist/resequence', (req, res) => {
    const event = getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    const rows = listModuleRecords<PlaylistPayload>(event.id, 'playlist');
    const sorted = [...rows].sort((a, b) => (b.payload.votes || 0) - (a.payload.votes || 0));

    const remaining = [...sorted];
    const sequenced: ModuleRecord<PlaylistPayload>[] = [];

    while (remaining.length > 0) {
      const prev = sequenced[sequenced.length - 1];
      let pickIndex = 0;
      if (prev && prev.payload.energyTier === 'chill') {
        const nonChillIdx = remaining.findIndex((r) => r.payload.energyTier !== 'chill');
        if (nonChillIdx !== -1) {
          pickIndex = nonChillIdx;
        }
      }
      const [picked] = remaining.splice(pickIndex, 1);
      sequenced.push(picked);
    }

    sequenced.forEach((rec, index) => {
      updateModuleRecord(rec.id, { vibeOrder: index + 1 });
    });

    res.json(
      sequenced.map((rec, index) => ({
        ...rec,
        payload: { ...rec.payload, vibeOrder: index + 1 },
      }))
    );
  });

  // Module 5: Single-Query Cross-Module Recap + AI Narrative
  app.get('/api/events/:id/recap', (req, res) => {
    const stats = buildRecapStats(req.params.id);
    if (!stats) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    res.json(stats);
  });

  app.post('/api/events/:id/recap/narrative', async (req, res) => {
    try {
      const stats = buildRecapStats(req.params.id);
      if (!stats) {
        res.status(404).json({ error: 'Event not found' });
        return;
      }
      const narrative = await generateRecapNarrative(stats);
      updateEventConfig(stats.event.id, {
        recapNarrative: narrative,
        recapGeneratedAt: new Date().toISOString(),
      });
      res.json({ ...stats, narrative });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate narrative' });
    }
  });

  // December Rollup across all host events
  app.get('/api/rollup/december', (_req, res) => {
    res.json(getDecemberRollup());
  });

  // Live Architecture Inspector (shows ONE shared events + module_records schema)
  app.get('/api/events/:id/architecture', (req, res) => {
    const event = getEventById(req.params.id);
    if (!event) {
      res.status(404).json({ error: 'Event not found' });
      return;
    }
    const records = listModuleRecords(event.id);
    const countsByModule: Record<string, number> = {};
    for (const r of records) {
      countsByModule[r.module] = (countsByModule[r.module] || 0) + 1;
    }
    res.json({
      event,
      totalRows: records.length,
      countsByModule,
      sampleRows: records.slice(0, 8),
    });
  });

  // Vite / Static Middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Utsav platform running on http://0.0.0.0:${port}`);
  });
}

startServer();
