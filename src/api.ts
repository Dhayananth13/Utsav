import type {
  AlbumPayload,
  DecemberRollup,
  EventConfig,
  EventType,
  LedgerPayload,
  ModuleKey,
  ModuleRecord,
  PlaylistPayload,
  PotluckAnalysis,
  PotluckPayload,
  RecapStats,
  UtsavEvent,
  VoiceFormPayload,
} from './types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  listEvents: () => request<UtsavEvent[]>('/api/events'),

  getEvent: (id: string) => request<UtsavEvent>(`/api/events/${encodeURIComponent(id)}`),

  createEvent: (body: {
    name: string;
    type: EventType;
    date_start: string;
    date_end: string;
    host_name: string;
    location: string;
    modules_enabled: ModuleKey[];
    config: EventConfig;
  }) => request<UtsavEvent>('/api/events', { method: 'POST', body: JSON.stringify(body) }),

  updateEvent: (id: string, body: { config?: Partial<EventConfig>; modules_enabled?: ModuleKey[] }) =>
    request<UtsavEvent>(`/api/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }),

  deleteEvent: (id: string) =>
    request<{ deleted: boolean }>(`/api/events/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listRecords: <T = Record<string, unknown>>(eventId: string, module?: ModuleKey) => {
    const qs = module ? `?module=${encodeURIComponent(module)}` : '';
    return request<ModuleRecord<T>[]>(`/api/events/${encodeURIComponent(eventId)}/records${qs}`);
  },

  insertRecord: <T extends object>(eventId: string, module: ModuleKey, payload: T) =>
    request<ModuleRecord<T>>(`/api/events/${encodeURIComponent(eventId)}/records`, {
      method: 'POST',
      body: JSON.stringify({ module, payload }),
    }),

  updateRecord: <T = Record<string, unknown>>(recordId: string, patch: Record<string, unknown>) =>
    request<ModuleRecord<T>>(`/api/records/${encodeURIComponent(recordId)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  deleteRecord: (recordId: string) =>
    request<{ deleted: boolean }>(`/api/records/${encodeURIComponent(recordId)}`, { method: 'DELETE' }),

  extractVoiceRsvp: (
    eventId: string,
    body: { audioBase64?: string; mimeType?: string; transcriptInput?: string }
  ) =>
    request<ModuleRecord<VoiceFormPayload>>(`/api/events/${encodeURIComponent(eventId)}/voiceform/extract`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  addLedgerMembers: (
    eventId: string,
    body: { members: Array<{ name: string; phone?: string }>; baseAmount: number }
  ) =>
    request<ModuleRecord<LedgerPayload>[]>(`/api/events/${encodeURIComponent(eventId)}/ledger/add-members`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  uploadAlbumPhoto: (
    eventId: string,
    body: {
      dataUrl: string;
      uploaderName: string;
      caption?: string;
      tags?: string[];
      exifTimestamp?: string;
      withinEventWindow?: boolean;
    }
  ) =>
    request<ModuleRecord<AlbumPayload>>(`/api/events/${encodeURIComponent(eventId)}/album/upload`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  analyzePotluck: (eventId: string) =>
    request<PotluckAnalysis>(`/api/events/${encodeURIComponent(eventId)}/potluck/analyze`, {
      method: 'POST',
    }),

  searchMusic: (query: string) =>
    request<
      Array<{
        trackId: string;
        trackName: string;
        artistName: string;
        albumName: string;
        artworkUrl: string;
        previewUrl: string;
        durationSec: number;
        genre: string;
        estimatedBpm: number;
        energyTier: 'chill' | 'mid' | 'high';
      }>
    >(`/api/music/search?q=${encodeURIComponent(query)}`),

  resequencePlaylist: (eventId: string) =>
    request<ModuleRecord<PlaylistPayload>[]>(`/api/events/${encodeURIComponent(eventId)}/playlist/resequence`, {
      method: 'POST',
    }),

  getRecap: (eventId: string) => request<RecapStats>(`/api/events/${encodeURIComponent(eventId)}/recap`),

  generateRecapNarrative: (eventId: string) =>
    request<RecapStats>(`/api/events/${encodeURIComponent(eventId)}/recap/narrative`, { method: 'POST' }),

  getDecemberRollup: () => request<DecemberRollup>('/api/rollup/december'),

  getArchitecture: (eventId: string) =>
    request<{
      event: UtsavEvent;
      totalRows: number;
      countsByModule: Record<string, number>;
      sampleRows: ModuleRecord[];
    }>(`/api/events/${encodeURIComponent(eventId)}/architecture`),
};
