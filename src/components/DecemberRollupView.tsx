import { useEffect, useState } from 'react';
import { api } from '../api';
import type { DecemberRollup } from '../types';

interface DecemberRollupViewProps {
  onSelectEvent: (eventId: string) => void;
}

export function DecemberRollupView({ onSelectEvent }: DecemberRollupViewProps) {
  const [rollup, setRollup] = useState<DecemberRollup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getDecemberRollup()
      .then(setRollup)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-8 text-sm text-zinc-500">
        Loading cross-event December ledger rollup...
      </div>
    );
  }

  if (!rollup) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">Your Season &amp; December Rollup</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Read-only summary summing pooled ledger collections across all events using the same shared engine.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
          <div className="text-xs text-zinc-500">Total Collected Across Events</div>
          <div className="mt-1 text-3xl font-semibold font-mono tabular-nums text-zinc-900">
            ₹{rollup.totalCollected.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
          <div className="text-xs text-zinc-500">Combined Pool Targets</div>
          <div className="mt-1 text-3xl font-semibold font-mono tabular-nums text-zinc-900">
            ₹{rollup.totalTarget.toLocaleString('en-IN')}
          </div>
        </div>
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
          <div className="text-xs text-zinc-500">Settled Contributions</div>
          <div className="mt-1 text-3xl font-semibold font-mono tabular-nums text-zinc-900">
            {rollup.totalPaidContributors}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#E7E5E0] bg-white overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#E7E5E0] bg-[#FAFAF8] text-[11px] font-medium text-zinc-500">
              <th className="py-3 px-4">Event</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Date</th>
              <th className="py-3 px-4 text-right">Collected</th>
              <th className="py-3 px-4 text-right">Target</th>
              <th className="py-3 px-4 text-right">Contributors</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E7E5E0] text-sm">
            {rollup.events.map((ev) => (
              <tr key={ev.id} className="hover:bg-[#FAFAF8]">
                <td className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => onSelectEvent(ev.id)}
                    className="font-semibold text-zinc-900 hover:text-[#C2410C] text-left"
                  >
                    {ev.name}
                  </button>
                </td>
                <td className="py-3 px-4 text-xs capitalize text-zinc-600">{ev.type}</td>
                <td className="py-3 px-4 text-xs font-mono text-zinc-500">{ev.date_start}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-zinc-900">
                  ₹{ev.collectedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-500">
                  ₹{ev.targetAmount.toLocaleString('en-IN')}
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-zinc-700">
                  {ev.paidCount} / {ev.totalContributors}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
