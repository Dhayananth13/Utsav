import { useMemo, useRef, useState } from 'react';
import { ArrowUp, Music, Play, Pause, Plus, Search, Sparkles, Trash2, Utensils } from 'lucide-react';
import { api } from '../api';
import type {
  EnergyTier,
  ModuleRecord,
  PlaylistPayload,
  PotluckAnalysis,
  PotluckPayload,
  UtsavEvent,
} from '../types';

interface PotluckPlaylistModuleProps {
  event: UtsavEvent;
  potluckRecords: ModuleRecord<PotluckPayload>[];
  playlistRecords: ModuleRecord<PlaylistPayload>[];
  showPotluck: boolean;
  showPlaylist: boolean;
  onRefresh: () => void;
  guestMode?: boolean;
}

export function PotluckPlaylistModule({
  event,
  potluckRecords,
  playlistRecords,
  showPotluck,
  showPlaylist,
  onRefresh,
  guestMode = false,
}: PotluckPlaylistModuleProps) {
  // Potluck state
  const [guestName, setGuestName] = useState('');
  const [dishName, setDishName] = useState('');
  const [category, setCategory] = useState<PotluckPayload['category']>('Main');
  const [servings, setServings] = useState('6');
  const [dietary, setDietary] = useState<PotluckPayload['dietary']>('Veg');
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<PotluckAnalysis | null>(null);

  // Playlist state
  const [songQuery, setSongQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
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
      energyTier: EnergyTier;
    }>
  >([]);
  const [customTrack, setCustomTrack] = useState('');
  const [customArtist, setCustomArtist] = useState('');
  const [addedBy, setAddedBy] = useState('');
  const [orderMode, setOrderMode] = useState<'votes' | 'vibe'>('votes');
  const [resequencing, setResequencing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleAddDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dishName.trim() || !guestName.trim()) return;
    await api.insertRecord<PotluckPayload>(event.id, 'potluck', {
      guestName: guestName.trim(),
      dishName: dishName.trim(),
      category,
      servings: Number(servings) || 4,
      dietary,
    });
    setDishName('');
    setAnalysis(null);
    onRefresh();
  };

  const handleAnalyzeMenu = async () => {
    setAnalyzing(true);
    try {
      const result = await api.analyzePotluck(event.id);
      setAnalysis(result);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSearchSongs = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!songQuery.trim()) return;
    setSearching(true);
    try {
      const results = await api.searchMusic(songQuery.trim());
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  const handleAddSearchedTrack = async (track: (typeof searchResults)[number]) => {
    await api.insertRecord<PlaylistPayload>(event.id, 'playlist', {
      trackName: track.trackName,
      artistName: track.artistName,
      albumName: track.albumName,
      artworkUrl: track.artworkUrl,
      previewUrl: track.previewUrl,
      durationSec: track.durationSec,
      genre: track.genre,
      estimatedBpm: track.estimatedBpm,
      energyTier: track.energyTier,
      addedBy: addedBy.trim() || 'Guest',
      votes: 1,
    });
    setSearchResults([]);
    setSongQuery('');
    onRefresh();
  };

  const handleAddCustomTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTrack.trim()) return;
    await api.insertRecord<PlaylistPayload>(event.id, 'playlist', {
      trackName: customTrack.trim(),
      artistName: customArtist.trim() || 'Unknown Artist',
      genre: 'Party Mix',
      estimatedBpm: 112,
      energyTier: 'mid',
      addedBy: addedBy.trim() || 'Guest',
      votes: 1,
    });
    setCustomTrack('');
    setCustomArtist('');
    onRefresh();
  };

  const handleUpvote = async (rec: ModuleRecord<PlaylistPayload>) => {
    await api.updateRecord(rec.id, { votes: (rec.payload.votes || 0) + 1 });
    onRefresh();
  };

  const handleToggleOrderMode = async (mode: 'votes' | 'vibe') => {
    setOrderMode(mode);
    if (mode === 'vibe') {
      setResequencing(true);
      try {
        await api.resequencePlaylist(event.id);
        onRefresh();
      } finally {
        setResequencing(false);
      }
    }
  };

  const togglePreview = (rec: ModuleRecord<PlaylistPayload>) => {
    if (!rec.payload.previewUrl) return;
    if (playingId === rec.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(rec.payload.previewUrl);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => setPlayingId(null));
    audioRef.current = audio;
    setPlayingId(rec.id);
  };

  const orderedTracks = useMemo(() => {
    const copy = [...playlistRecords];
    if (orderMode === 'vibe') {
      return copy.sort((a, b) => (a.payload.vibeOrder ?? 999) - (b.payload.vibeOrder ?? 999));
    }
    return copy.sort((a, b) => (b.payload.votes || 0) - (a.payload.votes || 0));
  }, [playlistRecords, orderMode]);

  const totalServings = potluckRecords.reduce((s, r) => s + (r.payload.servings || 0), 0);

  return (
    <div className="space-y-8">
      {/* Potluck Section */}
      {showPotluck && (
        <section className="space-y-4">
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E7E5E0] pb-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Potluck Dish Table</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {potluckRecords.length} dishes pledged · {totalServings} servings for ~{event.config.expectedHeadcount || 20} expected guests
                </p>
              </div>
              <button
                type="button"
                onClick={handleAnalyzeMenu}
                disabled={analyzing || potluckRecords.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5" />
                {analyzing ? 'Checking Balance...' : 'AI Dedupe & Balance Check'}
              </button>
            </div>

            {analysis && (
              <div className="mt-4 rounded-xl border border-[#E7E5E0] bg-[#FAFAF8] p-4 space-y-3">
                <div className="text-sm font-semibold text-zinc-900">{analysis.summary}</div>

                {analysis.duplicateGroups.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-amber-800">Near-Duplicate Dishes Detected</div>
                    {analysis.duplicateGroups.map((dup, i) => (
                      <div key={i} className="text-xs text-zinc-700">
                        <span className="font-medium">{dup.canonicalName}:</span> {dup.dishes.join(' + ')} — {dup.reason}
                      </div>
                    ))}
                  </div>
                )}

                {analysis.gaps.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-red-800">Menu Gaps vs Headcount</div>
                    <ul className="list-disc pl-4 text-xs text-zinc-700 space-y-0.5">
                      {analysis.gaps.map((g, i) => (
                        <li key={i}>{g}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis.suggestions.length > 0 && (
                  <div className="text-xs text-zinc-700">
                    <span className="font-semibold text-zinc-900">Suggested additions: </span>
                    {analysis.suggestions.join(' · ')}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleAddDish} className="mt-4 grid grid-cols-1 sm:grid-cols-6 gap-2.5">
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Your name"
                className="rounded-lg border border-[#E7E5E0] px-3 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                required
              />
              <input
                type="text"
                value={dishName}
                onChange={(e) => setDishName(e.target.value)}
                placeholder="Dish (e.g. Dal Makhani)"
                className="sm:col-span-2 rounded-lg border border-[#E7E5E0] px-3 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                required
              />
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as PotluckPayload['category'])}
                className="rounded-lg border border-[#E7E5E0] bg-white px-2.5 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
              >
                <option value="Starter">Starter</option>
                <option value="Main">Main</option>
                <option value="Side">Side</option>
                <option value="Dessert">Dessert</option>
                <option value="Drink">Drink</option>
              </select>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                  aria-label="Servings"
                  className="w-16 rounded-lg border border-[#E7E5E0] px-2.5 py-2 text-xs font-mono tabular-nums focus:border-[#C2410C] focus:outline-none"
                />
                <select
                  value={dietary}
                  onChange={(e) => setDietary(e.target.value as PotluckPayload['dietary'])}
                  className="flex-1 rounded-lg border border-[#E7E5E0] bg-white px-2 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                >
                  <option value="Veg">Veg</option>
                  <option value="Vegan">Vegan</option>
                  <option value="Non-Veg">Non-Veg</option>
                  <option value="Jain">Jain</option>
                  <option value="Gluten-Free">GF</option>
                </select>
              </div>
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-1 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Dish
              </button>
            </form>
          </div>

          <div className="rounded-xl border border-[#E7E5E0] bg-white overflow-hidden">
            {potluckRecords.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                No dishes added yet. Add what you&apos;re bringing above.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E7E5E0] bg-[#FAFAF8] text-[11px] font-medium text-zinc-500">
                    <th className="py-2.5 px-4">Dish</th>
                    <th className="py-2.5 px-4">Category</th>
                    <th className="py-2.5 px-4">Dietary</th>
                    <th className="py-2.5 px-4">Brought By</th>
                    <th className="py-2.5 px-4 text-right">Servings</th>
                    {!guestMode && <th className="py-2.5 px-4 text-right">Remove</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E7E5E0] text-sm">
                  {potluckRecords.map((rec) => {
                    const p = rec.payload;
                    return (
                      <tr key={rec.id} className="hover:bg-[#FAFAF8]">
                        <td className="py-2.5 px-4 font-medium text-zinc-900 flex items-center gap-2">
                          <Utensils className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                          <span>{p.dishName}</span>
                        </td>
                        <td className="py-2.5 px-4 text-xs text-zinc-700">{p.category}</td>
                        <td className="py-2.5 px-4 text-xs text-zinc-600">{p.dietary}</td>
                        <td className="py-2.5 px-4 text-xs text-zinc-700">{p.guestName}</td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs text-zinc-900">
                          {p.servings}
                        </td>
                        {!guestMode && (
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                await api.deleteRecord(rec.id);
                                onRefresh();
                              }}
                              className="text-zinc-400 hover:text-red-700"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* Playlist Section */}
      {showPlaylist && (
        <section className="space-y-4">
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E7E5E0] pb-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900">Collaborative Playlist Queue</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Search songs, upvote favorites, or switch to Vibe-Balanced order so two slow tracks never play back-to-back.
                </p>
              </div>
              <div className="flex items-center gap-1 p-1 bg-[#F4F2ED] rounded-lg shrink-0">
                <button
                  type="button"
                  onClick={() => handleToggleOrderMode('votes')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    orderMode === 'votes' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
                  }`}
                >
                  Top Voted
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleOrderMode('vibe')}
                  disabled={resequencing}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    orderMode === 'vibe' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'
                  }`}
                >
                  {resequencing ? 'Balancing...' : 'Vibe-Balanced'}
                </button>
              </div>
            </div>

            {/* Vibe Energy Curve Visualization (Could-have) */}
            {orderedTracks.length > 1 && (
              <div className="rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-500 mb-2">
                  <span>Queue Energy Curve ({orderMode === 'vibe' ? 'No back-to-back chill tracks' : 'Pure vote order'})</span>
                  <span className="font-mono">BPM ~75 (Chill) → ~130 (High)</span>
                </div>
                <div className="flex items-end gap-1.5 h-12">
                  {orderedTracks.map((rec, idx) => {
                    const heightPct =
                      rec.payload.energyTier === 'high' ? 95 : rec.payload.energyTier === 'mid' ? 62 : 30;
                    const barColor =
                      rec.payload.energyTier === 'high'
                        ? 'bg-[#C2410C]'
                        : rec.payload.energyTier === 'mid'
                          ? 'bg-amber-600'
                          : 'bg-zinc-400';
                    return (
                      <div key={rec.id} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div
                          title={`${idx + 1}. ${rec.payload.trackName} (${rec.payload.estimatedBpm} BPM · ${rec.payload.energyTier})`}
                          className={`w-full max-w-[44px] rounded-t ${barColor} transition-all`}
                          style={{ height: `${heightPct}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Track Search */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <form onSubmit={handleSearchSongs} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={songQuery}
                    onChange={(e) => setSongQuery(e.target.value)}
                    placeholder="Search Apple Music / iTunes catalog..."
                    className="w-full rounded-lg border border-[#E7E5E0] pl-8 pr-3 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                  />
                </div>
                <input
                  type="text"
                  value={addedBy}
                  onChange={(e) => setAddedBy(e.target.value)}
                  placeholder="Your name"
                  className="w-28 rounded-lg border border-[#E7E5E0] px-2.5 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={searching}
                  className="rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 whitespace-nowrap"
                >
                  {searching ? 'Searching...' : 'Search'}
                </button>
              </form>

              <form onSubmit={handleAddCustomTrack} className="flex gap-2">
                <input
                  type="text"
                  value={customTrack}
                  onChange={(e) => setCustomTrack(e.target.value)}
                  placeholder="Or add song title manually..."
                  className="flex-1 rounded-lg border border-[#E7E5E0] px-3 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                />
                <input
                  type="text"
                  value={customArtist}
                  onChange={(e) => setCustomArtist(e.target.value)}
                  placeholder="Artist"
                  className="w-28 rounded-lg border border-[#E7E5E0] px-2.5 py-2 text-xs focus:border-[#C2410C] focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                >
                  Add Song
                </button>
              </form>
            </div>

            {searchResults.length > 0 && (
              <div className="rounded-lg border border-[#E7E5E0] divide-y divide-[#E7E5E0] bg-[#FAFAF8]">
                {searchResults.map((track) => (
                  <div key={track.trackId} className="flex items-center justify-between gap-3 p-2.5">
                    <div className="flex items-center gap-3 min-w-0">
                      {track.artworkUrl ? (
                        <img src={track.artworkUrl} alt={track.trackName} className="h-9 w-9 rounded object-cover" />
                      ) : (
                        <div className="h-9 w-9 rounded bg-zinc-200 flex items-center justify-center">
                          <Music className="h-4 w-4 text-zinc-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-zinc-900 truncate">{track.trackName}</div>
                        <div className="text-[11px] text-zinc-500 truncate">
                          {track.artistName} · {track.genre} · {track.energyTier} (~{track.estimatedBpm} BPM)
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddSearchedTrack(track)}
                      className="rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412] whitespace-nowrap shrink-0"
                    >
                      Add to Queue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-[#E7E5E0] bg-white divide-y divide-[#E7E5E0]">
            {orderedTracks.length === 0 ? (
              <div className="p-8 text-center text-sm text-zinc-500">
                Queue is empty. Search a song above to kick off the playlist.
              </div>
            ) : (
              orderedTracks.map((rec, idx) => {
                const p = rec.payload;
                return (
                  <div key={rec.id} className="flex items-center justify-between gap-3 p-3.5 hover:bg-[#FAFAF8]">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 text-xs font-mono tabular-nums text-zinc-400 text-right shrink-0">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {p.artworkUrl ? (
                        <img src={p.artworkUrl} alt={p.trackName} className="h-10 w-10 rounded object-cover shrink-0" />
                      ) : (
                        <div className="h-10 w-10 rounded bg-[#F4F2ED] flex items-center justify-center shrink-0">
                          <Music className="h-4 w-4 text-zinc-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 truncate">{p.trackName}</div>
                        <div className="text-xs text-zinc-500 truncate">
                          {p.artistName} · {p.energyTier} energy (~{p.estimatedBpm} BPM) · Added by {p.addedBy}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {p.previewUrl && (
                        <button
                          type="button"
                          onClick={() => togglePreview(rec)}
                          aria-label={playingId === rec.id ? 'Pause preview' : 'Play 30s preview'}
                          className="rounded-lg border border-[#E7E5E0] bg-white p-2 text-zinc-700 hover:bg-zinc-50"
                        >
                          {playingId === rec.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleUpvote(rec)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#E7E5E0] bg-white px-3 py-1.5 text-xs font-mono tabular-nums font-semibold text-zinc-900 hover:border-[#C2410C] hover:text-[#C2410C]"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                        {p.votes}
                      </button>
                      {!guestMode && (
                        <button
                          type="button"
                          onClick={async () => {
                            await api.deleteRecord(rec.id);
                            onRefresh();
                          }}
                          className="rounded-lg p-1.5 text-zinc-400 hover:text-red-700"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
    </div>
  );
}
