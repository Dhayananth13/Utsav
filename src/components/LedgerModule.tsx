import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Check, QrCode, Plus, Trash2, X, ExternalLink } from 'lucide-react';
import { api } from '../api';
import type { LedgerPayload, ModuleRecord, UtsavEvent } from '../types';

interface LedgerModuleProps {
  event: UtsavEvent;
  records: ModuleRecord<LedgerPayload>[];
  onRefresh: () => void;
  guestMode?: boolean;
}

export function LedgerModule({ event, records, onRefresh, guestMode = false }: LedgerModuleProps) {
  const [membersInput, setMembersInput] = useState('');
  const [baseAmount, setBaseAmount] = useState(
    String(Math.round((event.config.targetAmount || 10000) / Math.max(records.length + 2, 4)))
  );
  const [adding, setAdding] = useState(false);
  const [activeQrRecord, setActiveQrRecord] = useState<ModuleRecord<LedgerPayload> | null>(null);
  const [editingUtrId, setEditingUtrId] = useState<string | null>(null);
  const [utrValue, setUtrValue] = useState('');
  const [noteValue, setNoteValue] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');

  const upiId = event.config.upiId || 'utsav.pool@okicici';
  const payeeName = event.config.payeeName || event.host_name;
  const poolLabel = event.config.ledgerLabel || 'Pooled Cost Ledger';
  const targetAmount = event.config.targetAmount || 10000;

  const collectedAmount = records
    .filter((r) => r.payload.paid)
    .reduce((sum, r) => sum + Number(r.payload.totalAmount || 0), 0);
  const paidCount = records.filter((r) => r.payload.paid).length;
  const pct = targetAmount > 0 ? Math.min(100, Math.round((collectedAmount / targetAmount) * 100)) : 0;

  const buildUpiLink = (rec: ModuleRecord<LedgerPayload>) => {
    const note = `${event.name.slice(0, 24)} - ${rec.payload.memberName}`;
    return `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(payeeName)}&am=${rec.payload.totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  };

  const handleAddMembers = async (e: React.FormEvent) => {
    e.preventDefault();
    const lines = membersInput
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (lines.length === 0) return;

    setAdding(true);
    try {
      await api.addLedgerMembers(event.id, {
        members: lines.map((name) => ({ name })),
        baseAmount: Number(baseAmount) || 500,
      });
      setMembersInput('');
      onRefresh();
    } finally {
      setAdding(false);
    }
  };

  const togglePaid = async (rec: ModuleRecord<LedgerPayload>) => {
    const nextPaid = !rec.payload.paid;
    await api.updateRecord(rec.id, {
      paid: nextPaid,
      paidAt: nextPaid ? new Date().toISOString() : undefined,
    });
    onRefresh();
  };

  const saveUtr = async (rec: ModuleRecord<LedgerPayload>) => {
    await api.updateRecord(rec.id, {
      utr: utrValue.trim(),
      receiptNote: noteValue.trim(),
      paid: true,
      paidAt: rec.payload.paidAt || new Date().toISOString(),
    });
    setEditingUtrId(null);
    onRefresh();
  };

  const filtered = records.filter((r) => {
    if (filter === 'paid') return r.payload.paid;
    if (filter === 'pending') return !r.payload.paid;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Progress Banner */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-zinc-500">{poolLabel}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold font-mono tabular-nums text-zinc-900">
                ₹{collectedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="text-sm font-mono tabular-nums text-zinc-500">
                / ₹{targetAmount.toLocaleString('en-IN')} target
              </span>
            </div>
          </div>
          <div className="text-xs text-zinc-600 font-mono tabular-nums">
            {paidCount} of {records.length} contributors settled · {pct}%
          </div>
        </div>

        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[#F4F2ED]">
          <div
            className="h-full bg-[#C2410C] transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
          <span>
            Payee UPI: <span className="font-mono text-zinc-800">{upiId}</span> ({payeeName})
          </span>
          <span>Unique paise offsets (.07, .13, .19…) identify each payer cleanly in bank statements.</span>
        </div>
      </div>

      {/* Add Members Form (Host View) */}
      {!guestMode && (
        <form onSubmit={handleAddMembers} className="rounded-xl border border-[#E7E5E0] bg-white p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Add Contributors to Pool</h3>
              <p className="text-xs text-zinc-500">
                Enter comma- or line-separated names. Each member gets a unique fractional UPI amount automatically.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-700 mb-1">Member Names</label>
              <input
                type="text"
                value={membersInput}
                onChange={(e) => setMembersInput(e.target.value)}
                placeholder="e.g. Aditya, Meenakshi, Tarun"
                className="w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Base Share (₹)</label>
              <input
                type="number"
                min="1"
                value={baseAmount}
                onChange={(e) => setBaseAmount(e.target.value)}
                className="w-full rounded-lg border border-[#E7E5E0] px-3 py-2 text-sm font-mono tabular-nums text-zinc-900 focus:border-[#C2410C] focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={adding || !membersInput.trim()}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] disabled:opacity-40 whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                {adding ? 'Generating...' : 'Assign UPI Links'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Contributor Ledger Table */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-[#E7E5E0] p-4">
          <div className="flex items-center gap-1 p-1 bg-[#F4F2ED] rounded-lg">
            {(['all', 'paid', 'pending'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors ${
                  filter === tab ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="text-xs text-zinc-500 font-mono tabular-nums">{filtered.length} entries</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            No contributors in this view yet. Add members above to generate unique UPI payment links.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E7E5E0] text-[11px] font-medium text-zinc-500 bg-[#FAFAF8]">
                  <th className="py-2.5 px-4">Contributor</th>
                  <th className="py-2.5 px-4 text-right">Unique Amount</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">UTR / Receipt Note</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7E5E0] text-sm">
                {filtered.map((rec) => {
                  const p = rec.payload;
                  const upiHref = buildUpiLink(rec);
                  const isEditing = editingUtrId === rec.id;

                  return (
                    <tr key={rec.id} className="hover:bg-[#FAFAF8] transition-colors">
                      <td className="py-3 px-4 font-medium text-zinc-900">{p.memberName}</td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-zinc-900">
                        ₹{p.totalAmount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4">
                        {p.paid ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <Check className="h-3.5 w-3.5" />
                            Paid
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-amber-700">Pending</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-zinc-600">
                        {isEditing ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              type="text"
                              value={utrValue}
                              onChange={(e) => setUtrValue(e.target.value)}
                              placeholder="UTR ref #"
                              className="w-32 rounded border border-[#E7E5E0] px-2 py-1 font-mono text-xs"
                            />
                            <input
                              type="text"
                              value={noteValue}
                              onChange={(e) => setNoteValue(e.target.value)}
                              placeholder="Screenshot / app note"
                              className="w-36 rounded border border-[#E7E5E0] px-2 py-1 text-xs"
                            />
                            <button
                              type="button"
                              onClick={() => saveUtr(rec)}
                              className="rounded bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUtrId(null)}
                              className="rounded border border-[#E7E5E0] px-2 py-1 text-xs text-zinc-600"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {p.utr ? (
                              <span className="font-mono text-zinc-800">{p.utr}</span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                            {p.receiptNote && <span className="text-zinc-500">· {p.receiptNote}</span>}
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUtrId(rec.id);
                                setUtrValue(p.utr || '');
                                setNoteValue(p.receiptNote || '');
                              }}
                              className="text-xs text-[#C2410C] hover:underline ml-1"
                            >
                              {p.utr ? 'Edit' : 'Add UTR'}
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <a
                            href={upiHref}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E5E0] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                          >
                            Pay UPI
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            type="button"
                            onClick={() => setActiveQrRecord(rec)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#E7E5E0] bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
                          >
                            <QrCode className="h-3.5 w-3.5" />
                            QR
                          </button>
                          {!guestMode && (
                            <>
                              <button
                                type="button"
                                onClick={() => togglePaid(rec)}
                                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium whitespace-nowrap ${
                                  p.paid
                                    ? 'border border-[#E7E5E0] text-zinc-600 hover:bg-zinc-50'
                                    : 'bg-zinc-900 text-white hover:bg-zinc-800'
                                }`}
                              >
                                {p.paid ? 'Unmark' : 'Mark Paid'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await api.deleteRecord(rec.id);
                                  onRefresh();
                                }}
                                aria-label={`Remove ${p.memberName}`}
                                className="rounded-lg border border-[#E7E5E0] p-1.5 text-zinc-400 hover:text-red-700"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Scannable UPI QR Modal */}
      {activeQrRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4">
          <div className="w-full max-w-sm rounded-xl border border-[#E7E5E0] bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="text-base font-semibold text-zinc-900">
                  UPI Payment QR · {activeQrRecord.payload.memberName}
                </h4>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Prefills exact unique amount to match bank reconciliation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveQrRecord(null)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 flex flex-col items-center rounded-xl border border-[#E7E5E0] bg-[#FAFAF8] p-5">
              <QRCodeSVG value={buildUpiLink(activeQrRecord)} size={184} includeMargin />
              <div className="mt-3 text-xl font-semibold font-mono tabular-nums text-zinc-900">
                ₹{activeQrRecord.payload.totalAmount.toFixed(2)}
              </div>
              <div className="text-xs font-mono text-zinc-500 mt-0.5">{upiId}</div>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <a
                href={buildUpiLink(activeQrRecord)}
                className="flex-1 text-center rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412]"
              >
                Open UPI App
              </a>
              <button
                type="button"
                onClick={async () => {
                  await togglePaid(activeQrRecord);
                  setActiveQrRecord(null);
                }}
                className="rounded-lg border border-[#E7E5E0] px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                {activeQrRecord.payload.paid ? 'Mark Unpaid' : 'Mark Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
