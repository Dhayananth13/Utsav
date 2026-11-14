import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Plus, QrCode, Share2, Trash2, X } from 'lucide-react';
import { api } from './api';
import { AlbumModule } from './components/AlbumModule';
import { ArchitectureView } from './components/ArchitectureView';
import { DecemberRollupView } from './components/DecemberRollupView';
import { LedgerModule } from './components/LedgerModule';
import { NewEventModal } from './components/NewEventModal';
import { PotluckPlaylistModule } from './components/PotluckPlaylistModule';
import { RecapView } from './components/RecapView';
import { VoiceFormModule } from './components/VoiceFormModule';
import type {
  AlbumPayload,
  LedgerPayload,
  ModuleKey,
  ModuleRecord,
  PlaylistPayload,
  PotluckPayload,
  UtsavEvent,
  VoiceFormPayload,
} from './types';

type TopSection = 'workspace' | 'guest' | 'rollup' | 'architecture';
type EventTab = 'voiceform' | 'ledger' | 'album' | 'potluck_playlist' | 'recap';

export default function App() {
  const [standaloneRecapId, setStandaloneRecapId] = useState<string | null>(() => {
    const match = window.location.pathname.match(/^\/recap\/([^/]+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  });

  const [section, setSection] = useState<TopSection>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'guest' ? 'guest' : 'workspace';
  });

  const [events, setEvents] = useState<UtsavEvent[]>([]);
  const [activeEventId, setActiveEventId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('event') || '';
  });
  const [activeTab, setActiveTab] = useState<EventTab>('voiceform');
  const [records, setRecords] = useState<ModuleRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);

  const activeEvent = useMemo(
    () => events.find((e) => e.id === activeEventId) || events[0] || null,
    [events, activeEventId]
  );

  const loadEvents = useCallback(async (preferId?: string) => {
    setLoadingEvents(true);
    try {
      const list = await api.listEvents();
      setEvents(list);
      setActiveEventId((prev) => {
        if (preferId && list.some((e) => e.id === preferId)) return preferId;
        if (prev && list.some((e) => e.id === prev)) return prev;
        if (list.some((e) => e.id === 'meera-arjun-26')) return 'meera-arjun-26';
        return list[0]?.id || '';
      });
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const loadRecords = useCallback(async (eventId: string) => {
    if (!eventId) return;
    setLoadingRecords(true);
    try {
      const rows = await api.listRecords(eventId);
      setRecords(rows);
    } finally {
      setLoadingRecords(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (activeEvent) {
      loadRecords(activeEvent.id);

      // Ensure activeTab belongs to an enabled module on this event
      const enabled = activeEvent.modules_enabled;
      const params = new URLSearchParams(window.location.search);
      const urlTab = params.get('tab');
      if (urlTab === 'album' && enabled.includes('album')) {
        setActiveTab('album');
        return;
      }

      const validTabs: EventTab[] = [];
      if (enabled.includes('voiceform')) validTabs.push('voiceform');
      if (enabled.includes('ledger')) validTabs.push('ledger');
      if (enabled.includes('album')) validTabs.push('album');
      if (enabled.includes('potluck') || enabled.includes('playlist')) validTabs.push('potluck_playlist');
      validTabs.push('recap');

      setActiveTab((current) => (validTabs.includes(current) ? current : validTabs[0]));
    }
  }, [activeEvent?.id, loadRecords]);

  // Public Standalone Recap Route (/recap/:eventId)
  if (standaloneRecapId) {
    return (
      <div className="min-h-screen bg-[#FAFAF8] text-zinc-900">
        <RecapView
          eventId={standaloneRecapId}
          isPublicStandalone
          onExitStandalone={() => {
            window.history.pushState({}, '', '/');
            setStandaloneRecapId(null);
            setActiveEventId(standaloneRecapId);
          }}
        />
      </div>
    );
  }

  const voiceRecords = records.filter((r) => r.module === 'voiceform') as unknown as ModuleRecord<VoiceFormPayload>[];
  const ledgerRecords = records.filter((r) => r.module === 'ledger') as unknown as ModuleRecord<LedgerPayload>[];
  const albumRecords = records.filter((r) => r.module === 'album') as unknown as ModuleRecord<AlbumPayload>[];
  const potluckRecords = records.filter((r) => r.module === 'potluck') as unknown as ModuleRecord<PotluckPayload>[];
  const playlistRecords = records.filter((r) => r.module === 'playlist') as unknown as ModuleRecord<PlaylistPayload>[];

  const availableTabs: Array<{ key: EventTab; label: string }> = activeEvent
    ? [
        ...(activeEvent.modules_enabled.includes('voiceform')
          ? [{ key: 'voiceform' as EventTab, label: `VoiceForm (${voiceRecords.length})` }]
          : []),
        ...(activeEvent.modules_enabled.includes('ledger')
          ? [{ key: 'ledger' as EventTab, label: `Ledger (${ledgerRecords.length})` }]
          : []),
        ...(activeEvent.modules_enabled.includes('album')
          ? [{ key: 'album' as EventTab, label: `Album (${albumRecords.length})` }]
          : []),
        ...(activeEvent.modules_enabled.includes('potluck') || activeEvent.modules_enabled.includes('playlist')
          ? [
              {
                key: 'potluck_playlist' as EventTab,
                label:
                  activeEvent.modules_enabled.includes('potluck') && activeEvent.modules_enabled.includes('playlist')
                    ? `Potluck & Playlist (${potluckRecords.length + playlistRecords.length})`
                    : activeEvent.modules_enabled.includes('potluck')
                      ? `Potluck (${potluckRecords.length})`
                      : `Playlist (${playlistRecords.length})`,
              },
            ]
          : []),
        { key: 'recap' as EventTab, label: 'Recap' },
      ]
    : [];

  const handleToggleModule = async (mod: ModuleKey) => {
    if (!activeEvent) return;
    const exists = activeEvent.modules_enabled.includes(mod);
    const next = exists
      ? activeEvent.modules_enabled.filter((m) => m !== mod)
      : [...activeEvent.modules_enabled, mod];
    if (next.length === 0) return;
    const updated = await api.updateEvent(activeEvent.id, { modules_enabled: next });
    setEvents((prev) => prev.map((ev) => (ev.id === updated.id ? updated : ev)));
  };

  const handleDeleteEvent = async (ev: UtsavEvent) => {
    if (events.length <= 1) return;
    await api.deleteEvent(ev.id);
    await loadEvents();
  };

  const guestShareUrl = activeEvent
    ? `${window.location.origin}/?view=guest&event=${encodeURIComponent(activeEvent.id)}`
    : '';
  const recapShareUrl = activeEvent
    ? `${window.location.origin}/recap/${encodeURIComponent(activeEvent.id)}`
    : '';

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF8] text-zinc-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-[#E7E5E0] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 py-3.5">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setSection('workspace');
            }}
            className="text-xl font-bold font-display tracking-tight text-zinc-900 whitespace-nowrap shrink-0"
          >
            Utsav
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600">
            <button
              type="button"
              onClick={() => setSection('workspace')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-900 ${
                section === 'workspace' ? 'text-zinc-900 underline decoration-[#C2410C] decoration-2 underline-offset-8' : ''
              }`}
            >
              Workspace
            </button>
            <button
              type="button"
              onClick={() => setSection('guest')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-900 ${
                section === 'guest' ? 'text-zinc-900 underline decoration-[#C2410C] decoration-2 underline-offset-8' : ''
              }`}
            >
              Guest View
            </button>
            <button
              type="button"
              onClick={() => setSection('rollup')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-900 ${
                section === 'rollup' ? 'text-zinc-900 underline decoration-[#C2410C] decoration-2 underline-offset-8' : ''
              }`}
            >
              December Rollup
            </button>
            <button
              type="button"
              onClick={() => setSection('architecture')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-zinc-900 ${
                section === 'architecture' ? 'text-zinc-900 underline decoration-[#C2410C] decoration-2 underline-offset-8' : ''
              }`}
            >
              Architecture
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
              New Event
            </button>
          </div>
        </div>

        {/* Mobile Secondary Nav */}
        <div className="flex md:hidden items-center gap-4 overflow-x-auto border-t border-[#E7E5E0] px-4 py-2 text-xs font-medium text-zinc-600">
          {(
            [
              ['workspace', 'Workspace'],
              ['guest', 'Guest View'],
              ['rollup', 'December Rollup'],
              ['architecture', 'Architecture'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key)}
              className={`whitespace-nowrap shrink-0 ${
                section === key ? 'text-[#C2410C] font-semibold' : ''
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 py-6">
        {loadingEvents ? (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-8 text-sm text-zinc-500">
            Loading Utsav events...
          </div>
        ) : section === 'rollup' ? (
          <DecemberRollupView
            onSelectEvent={(id) => {
              setActiveEventId(id);
              setSection('workspace');
              setActiveTab('ledger');
            }}
          />
        ) : section === 'architecture' && activeEvent ? (
          <ArchitectureView eventId={activeEvent.id} />
        ) : activeEvent ? (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Sidebar (Host Workspace Only) */}
            {section === 'workspace' && (
              <aside className="w-full lg:w-[272px] shrink-0 space-y-5">
                <div className="rounded-xl border border-[#E7E5E0] bg-white p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Active Events
                    </h2>
                    <span className="text-xs font-mono text-zinc-400">{events.length}</span>
                  </div>

                  <div className="space-y-1.5">
                    {events.map((ev) => {
                      const isSelected = ev.id === activeEvent.id;
                      return (
                        <div
                          key={ev.id}
                          className={`group flex items-start justify-between gap-2 rounded-lg border p-2.5 transition-colors ${
                            isSelected
                              ? 'border-zinc-900 bg-[#FAFAF8]'
                              : 'border-transparent hover:border-[#E7E5E0] hover:bg-[#FAFAF8]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setActiveEventId(ev.id)}
                            className="text-left min-w-0 flex-1"
                          >
                            <div className="text-sm font-semibold text-zinc-900 truncate">{ev.name}</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5 capitalize">
                              {ev.type} · {ev.date_start}
                            </div>
                          </button>
                          {events.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleDeleteEvent(ev)}
                              aria-label={`Delete ${ev.name}`}
                              className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-700 transition-opacity"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Module Activation Toggles */}
                <div className="rounded-xl border border-[#E7E5E0] bg-white p-4 space-y-3">
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                      Event Modules
                    </h3>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      Toggle modules on this event; all write to the shared record table.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    {(
                      [
                        ['voiceform', 'VoiceForm RSVP'],
                        ['ledger', 'Pooled UPI Ledger'],
                        ['album', 'Shared Album'],
                        ['potluck', 'Potluck Table'],
                        ['playlist', 'Playlist Queue'],
                      ] as Array<[ModuleKey, string]>
                    ).map(([mod, label]) => {
                      const enabled = activeEvent.modules_enabled.includes(mod);
                      return (
                        <label
                          key={mod}
                          className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs hover:bg-[#FAFAF8] cursor-pointer"
                        >
                          <span className="font-medium text-zinc-800">{label}</span>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleToggleModule(mod)}
                            className="accent-[#C2410C]"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              </aside>
            )}

            {/* Main Event Workspace */}
            <div className="min-w-0 flex-1 space-y-6 w-full">
              {/* Event Header */}
              <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                      <span className="capitalize font-medium text-[#C2410C]">{activeEvent.type}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">
                        {activeEvent.date_start}
                        {activeEvent.date_end !== activeEvent.date_start ? ` to ${activeEvent.date_end}` : ''}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{activeEvent.location}</span>
                      <span aria-hidden="true">·</span>
                      <span>Host: {activeEvent.host_name}</span>
                    </div>
                    <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-zinc-900 text-balance">
                      {activeEvent.name}
                    </h1>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      Guest QR &amp; Links
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        window.history.pushState({}, '', `/recap/${encodeURIComponent(activeEvent.id)}`);
                        setStandaloneRecapId(activeEvent.id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      Open Public Recap
                    </button>
                  </div>
                </div>

                {/* Module Segmented Tabs */}
                <div className="mt-5 flex flex-wrap items-center gap-1 p-1 bg-[#F4F2ED] rounded-lg w-fit max-w-full overflow-x-auto">
                  {availableTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        activeTab === tab.key
                          ? 'bg-white text-zinc-900 shadow-sm'
                          : 'text-zinc-600 hover:text-zinc-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Module Body */}
              {loadingRecords ? (
                <div className="rounded-xl border border-[#E7E5E0] bg-white p-8 text-sm text-zinc-500">
                  Loading module records...
                </div>
              ) : activeTab === 'voiceform' ? (
                <VoiceFormModule
                  event={activeEvent}
                  records={voiceRecords}
                  onRefresh={() => loadRecords(activeEvent.id)}
                  guestMode={section === 'guest'}
                />
              ) : activeTab === 'ledger' ? (
                <LedgerModule
                  event={activeEvent}
                  records={ledgerRecords}
                  onRefresh={() => loadRecords(activeEvent.id)}
                  guestMode={section === 'guest'}
                />
              ) : activeTab === 'album' ? (
                <AlbumModule
                  event={activeEvent}
                  records={albumRecords}
                  onRefresh={() => loadRecords(activeEvent.id)}
                  guestMode={section === 'guest'}
                />
              ) : activeTab === 'potluck_playlist' ? (
                <PotluckPlaylistModule
                  event={activeEvent}
                  potluckRecords={potluckRecords}
                  playlistRecords={playlistRecords}
                  showPotluck={activeEvent.modules_enabled.includes('potluck')}
                  showPlaylist={activeEvent.modules_enabled.includes('playlist')}
                  onRefresh={() => loadRecords(activeEvent.id)}
                  guestMode={section === 'guest'}
                />
              ) : (
                <RecapView eventId={activeEvent.id} />
              )}
            </div>
          </div>
        ) : null}
      </main>

      <footer className="border-t border-[#E7E5E0] bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 text-xs text-zinc-500">
          <span>Utsav — Unified Festive Event Platform</span>
          <span>GenOS Team · MIT License</span>
        </div>
      </footer>

      <NewEventModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        onCreated={async (created) => {
          await loadEvents(created.id);
          setSection('workspace');
        }}
      />

      {/* Invite & QR Share Modal */}
      {inviteModalOpen && activeEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E7E5E0] bg-white p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Share Event &amp; QR Code</h3>
                <p className="text-xs text-zinc-500 mt-0.5">{activeEvent.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col items-center rounded-xl border border-[#E7E5E0] bg-[#FAFAF8] p-5">
              <QRCodeSVG value={guestShareUrl} size={172} includeMargin />
              <div className="mt-3 text-xs font-medium text-zinc-700">
                Scan to open Guest View (RSVP, UPI Pay, Album, Playlist)
              </div>
            </div>

            <div className="space-y-2.5 text-xs">
              <div>
                <div className="font-medium text-zinc-700 mb-1">Guest Hub Link</div>
                <div className="font-mono text-[11px] rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-2 break-all text-zinc-700">
                  {guestShareUrl}
                </div>
              </div>
              <div>
                <div className="font-medium text-zinc-700 mb-1">Public Zero-Auth Recap Link</div>
                <div className="font-mono text-[11px] rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-2 break-all text-zinc-700">
                  {recapShareUrl}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Join ${activeEvent.name} on Utsav — RSVP, photos & pool all in one place: ${guestShareUrl}`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412]"
              >
                Share on WhatsApp
              </a>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="rounded-lg border border-[#E7E5E0] px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
