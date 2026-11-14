import { useState } from 'react';
import { X } from 'lucide-react';
import { api } from '../api';
import type { EventType, ModuleKey, UtsavEvent } from '../types';

interface NewEventModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (event: UtsavEvent) => void;
}

const PRESETS: Record<
  EventType,
  {
    label: string;
    subtitle: string;
    modules: ModuleKey[];
    ledgerLabel: string;
    defaultTarget: number;
    defaultFunctions: string;
  }
> = {
  wedding: {
    label: 'Wedding / Big Function',
    subtitle: 'VoiceForm RSVP + Shagun Ledger + Shared Album',
    modules: ['voiceform', 'ledger', 'album'],
    ledgerLabel: 'Shagun & Gift Pool',
    defaultTarget: 50000,
    defaultFunctions: 'Mehendi, Sangeet, Wedding, Reception',
  },
  potluck: {
    label: 'Potluck / House Party',
    subtitle: 'Dish Sign-up + Playlist Voting + Shared Album',
    modules: ['potluck', 'playlist', 'album'],
    ledgerLabel: 'Drinks & Supplies Pool',
    defaultTarget: 8000,
    defaultFunctions: 'Main Gathering',
  },
  collection: {
    label: 'Secret Santa / Group Pool',
    subtitle: 'Pooled-Cost UPI Ledger only',
    modules: ['ledger'],
    ledgerLabel: 'Secret Santa Pooled Fund',
    defaultTarget: 12000,
    defaultFunctions: 'Gift Exchange',
  },
  custom: {
    label: 'Custom Event',
    subtitle: 'Choose any combination of modules',
    modules: ['voiceform', 'ledger', 'album', 'potluck', 'playlist'],
    ledgerLabel: 'Pooled Expense Ledger',
    defaultTarget: 15000,
    defaultFunctions: 'Main Session',
  },
};

const ALL_MODULES: Array<{ key: ModuleKey; label: string; detail: string }> = [
  { key: 'voiceform', label: 'VoiceForm RSVP', detail: 'Voice note transcription & structured extraction' },
  { key: 'ledger', label: 'Pooled Ledger', detail: 'Unique fractional UPI links, QR & UTR tracking' },
  { key: 'album', label: 'Shared Album', detail: 'EXIF-window photo gallery & self-tagging' },
  { key: 'potluck', label: 'Potluck Table', detail: 'Dish sign-up with AI dedupe & balance check' },
  { key: 'playlist', label: 'Playlist Queue', detail: 'Song search, upvotes & vibe-balanced ordering' },
];

export function NewEventModal({ open, onClose, onCreated }: NewEventModalProps) {
  const [type, setType] = useState<EventType>('wedding');
  const [name, setName] = useState('');
  const [hostName, setHostName] = useState('');
  const [location, setLocation] = useState('Bengaluru');
  const [dateStart, setDateStart] = useState('2026-11-25');
  const [dateEnd, setDateEnd] = useState('2026-11-26');
  const [modules, setModules] = useState<ModuleKey[]>(PRESETS.wedding.modules);
  const [ledgerLabel, setLedgerLabel] = useState(PRESETS.wedding.ledgerLabel);
  const [targetAmount, setTargetAmount] = useState(String(PRESETS.wedding.defaultTarget));
  const [upiId, setUpiId] = useState('utsav.pool@okicici');
  const [functionsCsv, setFunctionsCsv] = useState(PRESETS.wedding.defaultFunctions);
  const [expectedHeadcount, setExpectedHeadcount] = useState('40');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleTypeSelect = (nextType: EventType) => {
    setType(nextType);
    const preset = PRESETS[nextType];
    setModules(preset.modules);
    setLedgerLabel(preset.ledgerLabel);
    setTargetAmount(String(preset.defaultTarget));
    setFunctionsCsv(preset.defaultFunctions);
  };

  const toggleModule = (mod: ModuleKey) => {
    setModules((prev) => (prev.includes(mod) ? prev.filter((m) => m !== mod) : [...prev, mod]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !hostName.trim()) {
      setError('Please enter both an event name and host name.');
      return;
    }
    if (modules.length === 0) {
      setError('Select at least one module to activate.');
      return;
    }

    setSubmitting(true);
    try {
      const created = await api.createEvent({
        name: name.trim(),
        type,
        date_start: dateStart,
        date_end: dateEnd || dateStart,
        host_name: hostName.trim(),
        location: location.trim() || 'Bengaluru',
        modules_enabled: modules,
        config: {
          functions: functionsCsv
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          targetAmount: Number(targetAmount) || 10000,
          upiId: upiId.trim() || 'utsav.pool@okicici',
          payeeName: hostName.trim(),
          ledgerLabel: ledgerLabel.trim() || 'Pooled Fund',
          expectedHeadcount: Number(expectedHeadcount) || 25,
        },
      });
      onCreated(created);
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create event');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-2xl rounded-xl border border-[#E7E5E0] bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[#E7E5E0] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Create Event Hub</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Pick an event type and Utsav activates the right modules automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-2">Event Type</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(PRESETS) as EventType[]).map((key) => {
                const active = type === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleTypeSelect(key)}
                    className={`text-left rounded-lg border p-3 transition-colors ${
                      active
                        ? 'border-[#C2410C] bg-[#FFF7ED]'
                        : 'border-[#E7E5E0] bg-white hover:bg-[#FAFAF8]'
                    }`}
                  >
                    <div className="text-sm font-semibold text-zinc-900">{PRESETS[key].label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{PRESETS[key].subtitle}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 mb-1">Event Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Priya & Siddharth Reception or Winter Secret Santa"
                className="w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#C2410C] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Host / Coordinator</label>
              <input
                type="text"
                value={hostName}
                onChange={(e) => setHostName(e.target.value)}
                placeholder="e.g. Aditi Sharma"
                className="w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#C2410C] focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Bengaluru"
                className="w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Start Date</label>
              <input
                type="date"
                value={dateStart}
                onChange={(e) => setDateStart(e.target.value)}
                className="w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">End Date</label>
              <input
                type="date"
                value={dateEnd}
                onChange={(e) => setDateEnd(e.target.value)}
                className="w-full rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-sm font-mono text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-2">Active Modules</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ALL_MODULES.map((item) => {
                const checked = modules.includes(item.key);
                return (
                  <label
                    key={item.key}
                    className={`flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors ${
                      checked ? 'border-zinc-900 bg-[#FAFAF8]' : 'border-[#E7E5E0] bg-white'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModule(item.key)}
                      className="mt-0.5 accent-[#C2410C]"
                    />
                    <div>
                      <div className="text-xs font-semibold text-zinc-900">{item.label}</div>
                      <div className="text-[11px] text-zinc-500">{item.detail}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[#E7E5E0] pt-4">
            {modules.includes('ledger') && (
              <>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Pool Framing Label</label>
                  <input
                    type="text"
                    value={ledgerLabel}
                    onChange={(e) => setLedgerLabel(e.target.value)}
                    className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs text-zinc-900 focus:border-[#C2410C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Target Amount (₹)</label>
                  <input
                    type="number"
                    min="100"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs font-mono tabular-nums text-zinc-900 focus:border-[#C2410C] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-700 mb-1">Host UPI ID</label>
                  <input
                    type="text"
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs font-mono text-zinc-900 focus:border-[#C2410C] focus:outline-none"
                  />
                </div>
              </>
            )}

            {modules.includes('voiceform') && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-zinc-700 mb-1">
                  Functions (comma-separated)
                </label>
                <input
                  type="text"
                  value={functionsCsv}
                  onChange={(e) => setFunctionsCsv(e.target.value)}
                  className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs text-zinc-900 focus:border-[#C2410C] focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Expected Headcount</label>
              <input
                type="number"
                min="1"
                value={expectedHeadcount}
                onChange={(e) => setExpectedHeadcount(e.target.value)}
                className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-xs font-mono tabular-nums text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-[#E7E5E0] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#E7E5E0] px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 whitespace-nowrap shrink-0"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {submitting ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
