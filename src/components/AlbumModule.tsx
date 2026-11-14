import { useMemo, useState } from 'react';
import exifr from 'exifr';
import JSZip from 'jszip';
import { QRCodeSVG } from 'qrcode.react';
import { Camera, Download, Tag, Trash2, Upload, X } from 'lucide-react';
import { api } from '../api';
import type { AlbumPayload, ModuleRecord, UtsavEvent } from '../types';

interface AlbumModuleProps {
  event: UtsavEvent;
  records: ModuleRecord<AlbumPayload>[];
  onRefresh: () => void;
  guestMode?: boolean;
}

interface PendingPhoto {
  file: File;
  previewDataUrl: string;
  exifTimestamp?: string;
  withinEventWindow: boolean;
  exifStatusText: string;
}

export function AlbumModule({ event, records, onRefresh, guestMode = false }: AlbumModuleProps) {
  const [uploaderName, setUploaderName] = useState('');
  const [caption, setCaption] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [strictExifFilter, setStrictExifFilter] = useState(false);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [lightboxRecord, setLightboxRecord] = useState<ModuleRecord<AlbumPayload> | null>(null);
  const [newTagInput, setNewTagInput] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [error, setError] = useState('');

  const guestAlbumUrl = `${window.location.origin}/?view=guest&event=${encodeURIComponent(event.id)}&tab=album`;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) {
      for (const t of r.payload.tags || []) {
        if (t.trim()) set.add(t.trim());
      }
    }
    return Array.from(set).sort();
  }, [records]);

  const filteredPhotos = useMemo(() => {
    if (selectedTag === 'all') return records;
    return records.filter((r) =>
      (r.payload.tags || []).some((t) => t.toLowerCase() === selectedTag.toLowerCase())
    );
  }, [records, selectedTag]);

  const isWithinWindow = (isoDate?: string): boolean => {
    if (!isoDate) return false;
    const ts = new Date(isoDate).getTime();
    const start = new Date(`${event.date_start}T00:00:00`).getTime() - 12 * 3600 * 1000;
    const end = new Date(`${event.date_end}T23:59:59`).getTime() + 12 * 3600 * 1000;
    return ts >= start && ts <= end;
  };

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const prepared: PendingPhoto[] = [];
    for (const file of files.slice(0, 8)) {
      let exifIso: string | undefined;
      try {
        const exifData = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate']);
        const dt = exifData?.DateTimeOriginal || exifData?.CreateDate;
        if (dt instanceof Date && !Number.isNaN(dt.getTime())) {
          exifIso = dt.toISOString();
        }
      } catch {
        exifIso = undefined;
      }

      const inWindow = exifIso ? isWithinWindow(exifIso) : false;
      const previewDataUrl = await resizeImageToDataUrl(file, 1280);

      prepared.push({
        file,
        previewDataUrl,
        exifTimestamp: exifIso,
        withinEventWindow: inWindow,
        exifStatusText: exifIso
          ? inWindow
            ? `EXIF ${exifIso.slice(0, 10)} · Within event window`
            : `EXIF ${exifIso.slice(0, 10)} · Outside ${event.date_start}–${event.date_end}`
          : 'No EXIF capture date found (screenshot or stripped metadata)',
      });
    }

    setPendingPhotos(prepared);
    e.target.value = '';
  };

  const handleUploadAll = async () => {
    const eligible = strictExifFilter
      ? pendingPhotos.filter((p) => p.withinEventWindow)
      : pendingPhotos;

    if (eligible.length === 0) {
      setError(
        strictExifFilter
          ? 'No selected photos matched the strict EXIF event date window. Turn off strict filter to upload anyway.'
          : 'Select at least one photo first.'
      );
      return;
    }

    setUploading(true);
    setError('');
    try {
      const parsedTags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      for (const item of eligible) {
        await api.uploadAlbumPhoto(event.id, {
          dataUrl: item.previewDataUrl,
          uploaderName: uploaderName.trim() || 'Guest',
          caption: caption.trim() || item.file.name.replace(/\.[^.]+$/, ''),
          tags: parsedTags,
          exifTimestamp: item.exifTimestamp,
          withinEventWindow: item.withinEventWindow,
        });
      }

      setPendingPhotos([]);
      setCaption('');
      setTagsInput('');
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleAddTagToRecord = async (rec: ModuleRecord<AlbumPayload>) => {
    const clean = newTagInput.trim();
    if (!clean) return;
    const nextTags = Array.from(new Set([...(rec.payload.tags || []), clean]));
    const updated = await api.updateRecord<AlbumPayload>(rec.id, { tags: nextTags });
    setLightboxRecord(updated);
    setNewTagInput('');
    onRefresh();
  };

  const handleDownloadZip = async () => {
    if (filteredPhotos.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < filteredPhotos.length; i++) {
        const rec = filteredPhotos[i];
        const resp = await fetch(rec.payload.imageUrl);
        const blob = await resp.blob();
        const ext = blob.type.includes('svg') ? 'svg' : blob.type.includes('png') ? 'png' : 'jpg';
        const safeName = `${String(i + 1).padStart(2, '0')}-${(rec.payload.uploaderName || 'guest').replace(/[^a-z0-9]/gi, '_')}.${ext}`;
        zip.file(safeName, blob);
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${event.id}-album.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="rounded-xl border border-[#E7E5E0] bg-white p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-[#E7E5E0] pb-4">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">Shared Event Album</h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Client-side EXIF check verifies capture dates against {event.date_start} – {event.date_end}. No login or face recognition required.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowQr((s) => !s)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E7E5E0] bg-white px-3 py-2 text-xs font-medium text-zinc-800 hover:bg-zinc-50 whitespace-nowrap"
            >
              <Camera className="h-3.5 w-3.5" />
              {showQr ? 'Hide Upload QR' : 'Guest Upload QR'}
            </button>
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={zipping || filteredPhotos.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              {zipping ? 'Preparing Zip...' : `Download All (${filteredPhotos.length})`}
            </button>
          </div>
        </div>

        {showQr && (
          <div className="mt-4 flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-[#E7E5E0] bg-[#FAFAF8] p-4">
            <QRCodeSVG value={guestAlbumUrl} size={132} includeMargin />
            <div className="space-y-1.5 text-xs">
              <div className="font-semibold text-zinc-900">Scan to upload photos without logging in</div>
              <p className="text-zinc-600">
                Print or display this QR at the venue entrance. Guests open the album directly and tag themselves.
              </p>
              <div className="font-mono text-[11px] text-zinc-500 break-all">{guestAlbumUrl}</div>
            </div>
          </div>
        )}

        {/* Upload Dropzone */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-2.5">
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Your Name</label>
              <input
                type="text"
                value={uploaderName}
                onChange={(e) => setUploaderName(e.target.value)}
                placeholder="e.g. Rohan Kulkarni"
                className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-sm focus:border-[#C2410C] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">
                Tag People (comma-separated, for "Photos of me")
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. Meera, Arjun, Rohan"
                className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-sm focus:border-[#C2410C] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-700 mb-1">Caption (optional)</label>
              <input
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Sangeet group photo"
                className="w-full rounded-lg border border-[#E7E5E0] px-3 py-1.5 text-sm focus:border-[#C2410C] focus:outline-none"
              />
            </div>
          </div>

          <div className="lg:col-span-2 flex flex-col justify-between rounded-xl border border-dashed border-[#D6D3CD] bg-[#FAFAF8] p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-zinc-900">Select Event Photos</div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Reads EXIF `DateTimeOriginal` locally in your browser before uploading.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#C2410C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#9A3412] whitespace-nowrap shrink-0">
                <Upload className="h-3.5 w-3.5" />
                Choose Photos
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFilesSelected}
                  className="hidden"
                />
              </label>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-600">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={strictExifFilter}
                  onChange={(e) => setStrictExifFilter(e.target.checked)}
                  className="accent-[#C2410C]"
                />
                <span>Strict mode: only upload photos whose EXIF date falls within event window</span>
              </label>
            </div>

            {pendingPhotos.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-[#E7E5E0] pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pendingPhotos.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-lg border border-[#E7E5E0] bg-white p-2"
                    >
                      <img
                        src={p.previewDataUrl}
                        alt={p.file.name}
                        className="h-11 w-11 rounded object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium text-zinc-900">{p.file.name}</div>
                        <div
                          className={`text-[11px] truncate ${
                            p.withinEventWindow ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {p.exifStatusText}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setPendingPhotos([])}
                    className="rounded-lg border border-[#E7E5E0] bg-white px-3 py-1.5 text-xs font-medium text-zinc-700"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadAll}
                    disabled={uploading}
                    className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : `Upload ${pendingPhotos.length} Photo(s)`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Self-Tag "Photos of me" Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-[#F4F2ED] rounded-lg">
          <button
            type="button"
            onClick={() => setSelectedTag('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              selectedTag === 'all' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            All Photos ({records.length})
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(tag)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                selectedTag === tag ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'
              }`}
            >
              Photos of {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Photo Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="rounded-xl border border-[#E7E5E0] bg-white p-10 text-center text-sm text-zinc-500">
          No photos in this gallery yet. Upload today&apos;s moments above or scan the Guest Upload QR.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPhotos.map((rec) => {
            const p = rec.payload;
            return (
              <div
                key={rec.id}
                className="group rounded-xl border border-[#E7E5E0] bg-white overflow-hidden transition-shadow hover:shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => setLightboxRecord(rec)}
                  className="block w-full aspect-[4/3] bg-zinc-100 overflow-hidden text-left"
                >
                  <img
                    src={p.imageUrl}
                    alt={p.caption || `Uploaded by ${p.uploaderName}`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                </button>
                <div className="p-3.5 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-medium text-zinc-900 truncate">
                      {p.caption || 'Event Moment'}
                    </div>
                    {!guestMode && (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.deleteRecord(rec.id);
                          onRefresh();
                        }}
                        aria-label="Delete photo"
                        className="text-zinc-400 hover:text-red-700 shrink-0"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                    <span>By {p.uploaderName}</span>
                    {p.tags && p.tags.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-zinc-700">Tagged: {p.tags.join(', ')}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Modal with Self-Tagging */}
      {lightboxRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[#E7E5E0] bg-white overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E7E5E0] px-5 py-3">
              <div className="text-sm font-semibold text-zinc-900">
                {lightboxRecord.payload.caption || 'Event Photo'}
              </div>
              <button
                type="button"
                onClick={() => setLightboxRecord(null)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="bg-zinc-950 flex items-center justify-center max-h-[60vh]">
              <img
                src={lightboxRecord.payload.imageUrl}
                alt={lightboxRecord.payload.caption || 'Event photo'}
                className="max-h-[60vh] w-auto object-contain"
              />
            </div>
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-zinc-600 space-y-0.5">
                <div>
                  Uploaded by <span className="font-semibold text-zinc-900">{lightboxRecord.payload.uploaderName}</span>
                  {lightboxRecord.payload.exifTimestamp && (
                    <span className="ml-2 font-mono text-zinc-500">
                      EXIF: {lightboxRecord.payload.exifTimestamp.slice(0, 16).replace('T', ' ')}
                    </span>
                  )}
                </div>
                <div>
                  Tagged:{' '}
                  {lightboxRecord.payload.tags?.length
                    ? lightboxRecord.payload.tags.join(', ')
                    : 'No one tagged yet'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  placeholder="Tag your name..."
                  className="rounded-lg border border-[#E7E5E0] px-2.5 py-1.5 text-xs focus:border-[#C2410C] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAddTagToRecord(lightboxRecord)}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#C2410C] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#9A3412]"
                >
                  <Tag className="h-3 w-3" />
                  Add Tag
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

async function resizeImageToDataUrl(file: File, maxDim: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.84));
      };
      img.onerror = () => resolve(String(reader.result));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(file);
  });
}
