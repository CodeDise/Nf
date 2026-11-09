import React, { useState } from "react";
import { Database, Plus, UploadCloud, ArrowRight, CheckCircle2 } from "lucide-react";
import {
  MongoShard,
  TmdbMediaEntry,
  SUPPORTED_LANGUAGES,
  sanitizeCaptionText,
} from "../data/botStore";

interface MultiMongoViewProps {
  shards: MongoShard[];
  onRegisterShard: (uri: string, name?: string) => { ok: boolean; message: string };
  onSimulateShardFill: (shardId: number, addMb: number) => void;
  catalog: TmdbMediaEntry[];
  onIngestNewMediaFile: (
    entryId: string,
    fileName: string,
    fileSizeMb: number,
    quality: string,
    languages: string[],
    rawCaption: string,
    season?: number,
    episode?: number
  ) => void;
  brandWatermark: string;
  brandLogo: string;
}

export const MultiMongoView: React.FC<MultiMongoViewProps> = ({
  shards,
  onRegisterShard,
  onSimulateShardFill,
  catalog,
  onIngestNewMediaFile,
  brandWatermark,
  brandLogo,
}) => {
  const [newUri, setNewUri] = useState("");
  const [newClusterName, setNewClusterName] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Ingestion simulator state
  const [selectedEntryId, setSelectedEntryId] = useState(catalog[0]?.id || "");
  const [fileName, setFileName] = useState(
    "Kalki.2898.AD.2024.1080p.BluRay.Bengali.Marathi.Hindi.mkv"
  );
  const [fileSizeMb, setFileSizeMb] = useState(1450);
  const [quality, setQuality] = useState("1080p BluRay");
  const [selectedLangs, setSelectedLangs] = useState<string[]>([
    "Hindi",
    "Bengali",
    "Marathi",
  ]);
  const [rawCaption, setRawCaption] = useState(
    "Kalki.2898.AD.2024.1080p.BluRay.Bengali.Marathi.Hindi [Joined @SpamChannel99] https://t.me/pirate_links_dl Uploaded by @FastUploader"
  );
  const [ingestNotice, setIngestNotice] = useState<string | null>(null);

  const handleAddShard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUri.trim()) return;
    const res = onRegisterShard(newUri.trim(), newClusterName.trim() || undefined);
    setFeedback({ ok: res.ok, text: res.message });
    if (res.ok) {
      setNewUri("");
      setNewClusterName("");
    }
  };

  const toggleLang = (lang: string) => {
    setSelectedLangs((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]
    );
  };

  const handleIngestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntryId || !fileName.trim()) return;
    onIngestNewMediaFile(
      selectedEntryId,
      fileName.trim(),
      Number(fileSizeMb) || 850,
      quality,
      selectedLangs.length ? selectedLangs : ["English"],
      rawCaption
    );
    const activeShard = shards.find((s) => s.role === "ACTIVE_WRITE") || shards[shards.length - 1];
    setIngestNotice(
      `File ingested into Master DB (-1001982347100), sanitized of external URLs/handles, mirrored to Backup DB (-1001982347199), and indexed in Shard #${activeShard.id}.`
    );
  };

  const totalUsedMb = shards.reduce((acc, s) => acc + s.usedMb, 0);
  const totalCapMb = shards.reduce((acc, s) => acc + s.capacityMb, 0);
  const totalFiles = shards.reduce((acc, s) => acc + s.filesCount, 0);

  return (
    <div className="space-y-8">
      {/* Top KPI Strip (Full-Width 4-Column Row) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400">Registered MongoDB Shards</div>
          <div className="text-2xl font-bold text-white mt-1 font-mono tabular-nums">
            {shards.length} Clusters
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Sequential write spillover at 480 MB
          </div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400">Aggregate Storage Consumed</div>
          <div className="text-2xl font-bold text-sky-400 mt-1 font-mono tabular-nums">
            {totalUsedMb.toFixed(1)} / {totalCapMb.toFixed(0)} MB
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
            {((totalUsedMb / totalCapMb) * 100).toFixed(1)}% total pool utilization
          </div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400">Total Indexed Media Documents</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1 font-mono tabular-nums">
            {totalFiles.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            Mirrored across Master & Backup channels
          </div>
        </div>

        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="text-xs text-slate-400">Active Sequential Write Target</div>
          <div className="text-2xl font-bold text-amber-400 mt-1 font-mono tabular-nums">
            Shard #{shards.find((s) => s.role === "ACTIVE_WRITE")?.id || shards.length}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            All shards queried in parallel on search
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Live /db_status Table + /set_db Registration & Ingestion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Live /db_status Storage Monitor (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  01. Sequential Multi-MongoDB Pool (/db_status)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  When the active write shard reaches 480 MB, new channel uploads automatically spill over to the next registered database.
                </p>
              </div>
              <Database className="w-5 h-5 text-sky-400 shrink-0" />
            </div>

            <div className="divide-y divide-slate-800">
              {shards.map((shard) => {
                const pct = Math.min(100, (shard.usedMb / shard.capacityMb) * 100);
                const barColor =
                  shard.role === "READ_FULL"
                    ? "bg-amber-500"
                    : shard.role === "ACTIVE_WRITE"
                    ? "bg-emerald-500"
                    : "bg-sky-500";
                return (
                  <div key={shard.id} className="py-4 first:pt-1 last:pb-1 space-y-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Shard #{shard.id}: {shard.name}
                        </div>
                        <div className="text-xs font-mono text-slate-400 mt-0.5">
                          {shard.maskedUri}
                        </div>
                      </div>
                      <div className="text-right font-mono tabular-nums">
                        <div
                          className={`text-xs font-semibold ${
                            shard.role === "ACTIVE_WRITE"
                              ? "text-emerald-400"
                              : shard.role === "READ_FULL"
                              ? "text-amber-400"
                              : "text-sky-400"
                          }`}
                        >
                          {shard.role === "ACTIVE_WRITE"
                            ? "ACTIVE WRITE TARGET"
                            : shard.role === "READ_FULL"
                            ? "THRESHOLD FULL (READ-ONLY)"
                            : "STANDBY OVERFLOW SHARD"}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {shard.filesCount.toLocaleString()} indexed files · Added {shard.addedAt}
                        </div>
                      </div>
                    </div>

                    {/* Storage Progress Bar */}
                    <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                      <div
                        className={`h-full transition-transform duration-150 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                      <span>
                        Storage: {shard.usedMb.toFixed(1)} MB / {shard.capacityMb.toFixed(0)} MB (
                        {pct.toFixed(1)}%)
                      </span>
                      {shard.role === "ACTIVE_WRITE" && (
                        <button
                          onClick={() => onSimulateShardFill(shard.id, 275)}
                          className="text-xs text-amber-400 hover:text-amber-300 underline transition-colors whitespace-nowrap shrink-0"
                        >
                          Simulate +275 MB Burst (Test Spillover →)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dynamic /set_db Registration Form */}
          <form onSubmit={handleAddShard} className="pt-4 border-t border-slate-800 space-y-3">
            <div className="text-sm font-semibold text-white">
              Register Additional MongoDB URI (/set_db)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                value={newClusterName}
                onChange={(e) => setNewClusterName(e.target.value)}
                placeholder="Cluster label (e.g. us-east-1)"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
              <input
                type="text"
                value={newUri}
                onChange={(e) => setNewUri(e.target.value)}
                placeholder="mongodb+srv://user:pass@cluster3.mongodb.net/cinepulse_shard_04"
                className="sm:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => {
                  setNewClusterName(`Overflow Cluster ap-south-${shards.length + 1}`);
                  setNewUri(
                    `mongodb+srv://admin:secret@cluster${shards.length}.m1.mongodb.net/cinepulse_shard_0${
                      shards.length + 1
                    }`
                  );
                }}
                className="text-xs text-slate-400 hover:text-slate-200 underline whitespace-nowrap shrink-0"
              >
                Auto-fill Sample MongoDB URI
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Register Shard (/set_db)</span>
              </button>
            </div>
            {feedback && (
              <div
                className={`text-xs font-mono ${
                  feedback.ok ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {feedback.text}
              </div>
            )}
          </form>
        </div>

        {/* Right: Master Database Channel Ingestion & Caption Sanitizer (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <form onSubmit={handleIngestSubmit} className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  02. Master DB Ingestion & Sanitizer
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Strips external URLs & handles, appends {brandWatermark}, and mirrors to Backup DB.
                </p>
              </div>
              <UploadCloud className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-300 block">
                Target TMDB Title in Repository
              </label>
              <select
                value={selectedEntryId}
                onChange={(e) => setSelectedEntryId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                {catalog.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({c.category} · {c.releaseDate})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2 space-y-1">
                <label className="text-xs text-slate-400 block">Document Filename</label>
                <input
                  type="text"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400 block">Size (MB)</label>
                <input
                  type="number"
                  value={fileSizeMb}
                  onChange={(e) => setFileSizeMb(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums text-slate-100"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 block">
                Detected Indian & Global Audio Tracks
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => toggleLang(lang)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors whitespace-nowrap shrink-0 ${
                      selectedLangs.includes(lang)
                        ? "bg-sky-500 text-slate-950 font-semibold"
                        : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-slate-400 block">
                Raw Ingested Caption (with external URLs & @handles to strip)
              </label>
              <textarea
                rows={2}
                value={rawCaption}
                onChange={(e) => setRawCaption(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
            </div>

            {/* Live Sanitized Preview */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                <ArrowRight className="w-3 h-3 text-emerald-400" />
                <span>Live Sanitized & Watermarked Output:</span>
              </div>
              <div className="text-xs font-mono text-emerald-400 break-words">
                {sanitizeCaptionText(rawCaption, brandWatermark, brandLogo)}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Ingest to Master DB & Mirror to Backup Channel</span>
            </button>
          </form>

          {ingestNotice && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{ingestNotice}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
