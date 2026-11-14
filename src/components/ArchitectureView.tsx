import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ModuleRecord, UtsavEvent } from '../types';

interface ArchitectureViewProps {
  eventId: string;
}

export function ArchitectureView({ eventId }: ArchitectureViewProps) {
  const [data, setData] = useState<{
    event: UtsavEvent;
    totalRows: number;
    countsByModule: Record<string, number>;
    sampleRows: ModuleRecord[];
  } | null>(null);

  useEffect(() => {
    api.getArchitecture(eventId).then(setData);
  }, [eventId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-900">One Platform, One Shared Data Model</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Every module writes to the same <code className="font-mono text-zinc-800">module_records</code> table. The Recap engine runs one query across all modules.
        </p>
      </div>

      {/* Visual Schema Diagram */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-4">
            <div className="text-xs font-semibold text-[#C2410C]">Table 1 · events</div>
            <pre className="mt-2 text-xs font-mono text-zinc-800 overflow-x-auto leading-relaxed">
{`id               TEXT PRIMARY KEY
name             TEXT
type             'wedding' | 'potluck' | 'collection'
modules_enabled  TEXT[] (JSON)
config           JSON (functions, target, upiId)`}
            </pre>
          </div>

          <div className="rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-4">
            <div className="text-xs font-semibold text-[#C2410C]">Table 2 · module_records</div>
            <pre className="mt-2 text-xs font-mono text-zinc-800 overflow-x-auto leading-relaxed">
{`id               TEXT PRIMARY KEY
event_id         TEXT REFERENCES events(id)
module           'voiceform' | 'ledger' | 'album' | 'potluck' | 'playlist'
payload          JSON (module-specific shape)
created_at       TIMESTAMPTZ`}
            </pre>
          </div>
        </div>

        <div className="rounded-lg border border-[#E7E5E0] bg-zinc-900 p-4 text-zinc-100">
          <div className="text-[11px] font-mono text-zinc-400">Recap Fan-Out Query</div>
          <code className="mt-1 block text-xs font-mono text-amber-300">
            SELECT module, payload, created_at FROM module_records WHERE event_id = &apos;{eventId}&apos;;
          </code>
        </div>
      </div>

      {data && (
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E7E5E0] pb-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Live Rows for “{data.event.name}”
              </h3>
              <div className="text-xs text-zinc-500 mt-0.5">
                {data.totalRows} total rows in <code className="font-mono">module_records</code>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-mono text-zinc-700">
              {Object.entries(data.countsByModule).map(([mod, cnt]) => (
                <span key={mod}>
                  {mod}: {cnt}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {data.sampleRows.map((row) => (
              <div key={row.id} className="rounded-lg border border-[#E7E5E0] bg-[#FAFAF8] p-3">
                <div className="flex items-center justify-between text-xs font-mono text-zinc-600 mb-1">
                  <span>
                    id={row.id} · module=<strong className="text-[#C2410C]">{row.module}</strong>
                  </span>
                  <span>{row.created_at.slice(0, 19).replace('T', ' ')}</span>
                </div>
                <pre className="text-[11px] font-mono text-zinc-800 overflow-x-auto">
                  {JSON.stringify(row.payload)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
