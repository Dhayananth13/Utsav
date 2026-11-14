import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check, Download, Sparkles, ExternalLink } from 'lucide-react';
import { api } from '../api';
import type { RecapStats } from '../types';

interface RecapViewProps {
  eventId: string;
  isPublicStandalone?: boolean;
  onExitStandalone?: () => void;
}

export function RecapView({ eventId, isPublicStandalone = false, onExitStandalone }: RecapViewProps) {
  const [stats, setStats] = useState<RecapStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getRecap(eventId);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load recap');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [eventId]);

  const publicRecapUrl = `${window.location.origin}/recap/${encodeURIComponent(eventId)}`;

  const handleGenerateNarrative = async () => {
    setGenerating(true);
    try {
      const updated = await api.generateRecapNarrative(eventId);
      setStats(updated);
    } finally {
      setGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(publicRecapUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCard = () => {
    if (!stats) return;
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 675;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#FAFAF8';
    ctx.fillRect(0, 0, 1200, 675);
    ctx.strokeStyle = '#E7E5E0';
    ctx.lineWidth = 4;
    ctx.strokeRect(32, 32, 1136, 611);

    ctx.fillStyle = '#C2410C';
    ctx.font = '600 22px system-ui, sans-serif';
    ctx.fillText('UTSAV EVENT RECAP', 72, 92);

    ctx.fillStyle = '#18181B';
    ctx.font = '700 44px system-ui, sans-serif';
    ctx.fillText(stats.event.name.slice(0, 46), 72, 152);

    ctx.fillStyle = '#52525B';
    ctx.font = '400 22px system-ui, sans-serif';
    ctx.fillText(`${stats.event.location} · ${stats.event.date_start} to ${stats.event.date_end}`, 72, 194);

    // Draw wrapped narrative
    ctx.fillStyle = '#27272A';
    ctx.font = '400 24px system-ui, sans-serif';
    const words = stats.narrative.split(' ');
    let line = '';
    let y = 264;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > 1040) {
        ctx.fillText(line, 72, y);
        line = word;
        y += 36;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, 72, y);

    // Stat blocks at bottom
    const statItems: Array<{ label: string; val: string }> = [];
    if (stats.event.modules_enabled.includes('voiceform')) {
      statItems.push({ label: 'CONFIRMED GUESTS', val: String(stats.voiceform.confirmedHeadcount) });
    }
    if (stats.event.modules_enabled.includes('ledger')) {
      statItems.push({
        label: 'POOLED LEDGER',
        val: `₹${stats.ledger.collectedAmount.toLocaleString('en-IN')}`,
      });
    }
    if (stats.event.modules_enabled.includes('album')) {
      statItems.push({ label: 'SHARED PHOTOS', val: String(stats.album.totalPhotos) });
    }
    if (stats.event.modules_enabled.includes('potluck')) {
      statItems.push({ label: 'POTLUCK DISHES', val: String(stats.potluck.totalDishes) });
    }
    if (stats.event.modules_enabled.includes('playlist')) {
      statItems.push({ label: 'PLAYLIST TRACKS', val: String(stats.playlist.totalTracks) });
    }

    statItems.slice(0, 4).forEach((item, idx) => {
      const x = 72 + idx * 270;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x, 460, 244, 128);
      ctx.strokeStyle = '#E7E5E0';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, 460, 244, 128);

      ctx.fillStyle = '#71717A';
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillText(item.label, x + 20, 498);

      ctx.fillStyle = '#18181B';
      ctx.font = '700 36px monospace';
      ctx.fillText(item.val, x + 20, 554);
    });

    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${stats.event.id}-recap.png`;
    a.click();
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-8 text-sm text-zinc-500">
        Querying shared module_records for event recap...
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        {error || 'Recap unavailable'}
      </div>
    );
  }

  const { event } = stats;

  return (
    <div className={isPublicStandalone ? 'mx-auto max-w-4xl px-4 py-10 space-y-6' : 'space-y-6'}>
      {isPublicStandalone && (
        <div className="flex items-center justify-between border-b border-[#E7E5E0] pb-4">
          <div className="text-xl font-bold font-display text-zinc-900">Utsav</div>
          {onExitStandalone && (
            <button
              type="button"
              onClick={onExitStandalone}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Open Event Hub
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* Hero Narrative Card */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-6 space-y-5">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-[#C2410C]">Event Recap · {stats.totalRecords} records pooled</div>
            <h2 className="mt-1 text-2xl sm:text-3xl font-bold text-zinc-900 text-balance">{event.name}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span className="capitalize">{event.type}</span>
              <span aria-hidden="true">·</span>
              <span>{event.location}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {event.date_start} to {event.date_end}
              </span>
              <span aria-hidden="true">·</span>
              <span>Hosted by {event.host_name}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleGenerateNarrative}
              disabled={generating}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#C2410C] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {generating ? 'Writing Summary...' : 'Refresh AI Narrative'}
            </button>
            <button
              type="button"
              onClick={handleDownloadCard}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              Download Card (.png)
            </button>
          </div>
        </div>

        <p className="rounded-xl border border-[#E7E5E0] bg-[#FAFAF8] p-4 text-base leading-relaxed text-zinc-800">
          {stats.narrative}
        </p>
      </div>

      {/* Cross-Module Stat Blocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {event.modules_enabled.includes('voiceform') && (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 space-y-2">
            <div className="text-xs font-medium text-zinc-500">VoiceForm RSVPs</div>
            <div className="text-3xl font-semibold font-mono tabular-nums text-zinc-900">
              {stats.voiceform.confirmedHeadcount} guests
            </div>
            <div className="text-xs text-zinc-600">
              {stats.voiceform.attendingResponses} attending · {stats.voiceform.declinedResponses} declined
            </div>
            <div className="pt-2 border-t border-[#E7E5E0] space-y-1">
              {Object.entries(stats.voiceform.functionBreakdown).map(([fn, count]) => (
                <div key={fn} className="flex justify-between text-xs">
                  <span className="text-zinc-600">{fn}</span>
                  <span className="font-mono tabular-nums font-medium text-zinc-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {event.modules_enabled.includes('ledger') && (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 space-y-2">
            <div className="text-xs font-medium text-zinc-500">
              {event.config.ledgerLabel || 'Pooled Ledger'}
            </div>
            <div className="text-3xl font-semibold font-mono tabular-nums text-zinc-900">
              ₹{stats.ledger.collectedAmount.toLocaleString('en-IN')}
            </div>
            <div className="text-xs text-zinc-600">
              {stats.ledger.paidCount} of {stats.ledger.totalContributors} contributors settled ({stats.ledger.completionPct}%)
            </div>
            <div className="pt-2">
              <div className="h-2 w-full rounded-full bg-[#F4F2ED] overflow-hidden">
                <div className="h-full bg-[#C2410C]" style={{ width: `${stats.ledger.completionPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {event.modules_enabled.includes('album') && (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 space-y-2">
            <div className="text-xs font-medium text-zinc-500">Shared Album</div>
            <div className="text-3xl font-semibold font-mono tabular-nums text-zinc-900">
              {stats.album.totalPhotos} photos
            </div>
            <div className="text-xs text-zinc-600">
              From {stats.album.uniqueContributors} contributors · {stats.album.inWindowCount} EXIF-verified
            </div>
            {stats.album.taggedPeople.length > 0 && (
              <div className="pt-2 border-t border-[#E7E5E0] text-xs text-zinc-600">
                Tagged: {stats.album.taggedPeople.slice(0, 6).join(', ')}
              </div>
            )}
          </div>
        )}

        {event.modules_enabled.includes('potluck') && (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 space-y-2">
            <div className="text-xs font-medium text-zinc-500">Potluck Table</div>
            <div className="text-3xl font-semibold font-mono tabular-nums text-zinc-900">
              {stats.potluck.totalDishes} dishes
            </div>
            <div className="text-xs text-zinc-600">
              {stats.potluck.totalServings} total servings pledged
            </div>
            <div className="pt-2 border-t border-[#E7E5E0] space-y-1">
              {Object.entries(stats.potluck.categoryBreakdown).map(([cat, count]) => (
                <div key={cat} className="flex justify-between text-xs">
                  <span className="text-zinc-600">{cat}</span>
                  <span className="font-mono tabular-nums font-medium text-zinc-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {event.modules_enabled.includes('playlist') && (
          <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 space-y-2">
            <div className="text-xs font-medium text-zinc-500">Playlist Queue</div>
            <div className="text-3xl font-semibold font-mono tabular-nums text-zinc-900">
              {stats.playlist.totalTracks} tracks
            </div>
            <div className="text-xs text-zinc-600">{stats.playlist.totalVotes} total guest upvotes</div>
            {stats.playlist.topTrack && (
              <div className="pt-2 border-t border-[#E7E5E0] text-xs text-zinc-700">
                Top song: <span className="font-semibold text-zinc-900">{stats.playlist.topTrack.trackName}</span> by{' '}
                {stats.playlist.topTrack.artistName} ({stats.playlist.topTrack.votes} votes)
              </div>
            )}
          </div>
        )}
      </div>

      {/* Shareable Public Recap Link + QR */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-5 flex flex-col sm:flex-row items-center justify-between gap-5">
        <div className="space-y-2 min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900">Public Shareable Recap Link (Zero Auth)</div>
          <p className="text-xs text-zinc-500">
            Anyone with this link or QR code can view this live event recap on their phone without signing in.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] px-3 py-2 text-xs font-mono text-zinc-700">
              {publicRecapUrl}
            </code>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? 'Copied' : 'Copy Link'}
            </button>
          </div>
        </div>
        <div className="shrink-0 rounded-xl border border-[#E7E5E0] bg-[#FAFAF8] p-3">
          <QRCodeSVG value={publicRecapUrl} size={96} />
        </div>
      </div>
    </div>
  );
}
