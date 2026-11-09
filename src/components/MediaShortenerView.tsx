import React, { useState } from "react";
import {
  Link2,
  Clock,
  ShieldCheck,
  Plus,
  Trash2,
  Image as ImageIcon,
  Tag,
} from "lucide-react";
import {
  ShortenerProvider,
  RotationalPicConfig,
  GENERATED_ASSETS,
} from "../data/botStore";
import { ResilientImage } from "./ResilientImage";

interface MediaShortenerViewProps {
  accessMode: "TIME_PASS" | "PER_POST";
  onSetAccessMode: (mode: "TIME_PASS" | "PER_POST") => void;
  passDurationHours: number;
  onSetPassDurationHours: (hours: number) => void;
  shorteners: ShortenerProvider[];
  onAddShortener: (domain: string, apiUrl: string, apiKey: string) => void;
  onRemoveShortener: (id: string) => void;
  brandWatermark: string;
  onSetBrandWatermark: (val: string) => void;
  brandLogo: string;
  onSetBrandLogo: (val: string) => void;
  supportId: string;
  onSetSupportId: (val: string) => void;
  rotationalPics: RotationalPicConfig;
  onAddRotationalPic: (category: "start" | "absent" | "settings", url: string) => void;
  onRemoveRotationalPic: (category: "start" | "absent" | "settings", index: number) => void;
}

export const MediaShortenerView: React.FC<MediaShortenerViewProps> = ({
  accessMode,
  onSetAccessMode,
  passDurationHours,
  onSetPassDurationHours,
  shorteners,
  onAddShortener,
  onRemoveShortener,
  brandWatermark,
  onSetBrandWatermark,
  brandLogo,
  onSetBrandLogo,
  supportId,
  onSetSupportId,
  rotationalPics,
  onAddRotationalPic,
  onRemoveRotationalPic,
}) => {
  const [newDomain, setNewDomain] = useState("");
  const [newApiUrl, setNewApiUrl] = useState("");
  const [newApiKey, setNewApiKey] = useState("");

  const [picCategory, setPicCategory] = useState<"start" | "absent" | "settings">("start");
  const [newPicUrl, setNewPicUrl] = useState("");

  const handleAddShortenerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim() || !newApiKey.trim()) return;
    const cleanDomain = newDomain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const apiUrl = newApiUrl.trim() || `https://${cleanDomain}/api`;
    onAddShortener(cleanDomain, apiUrl, newApiKey.trim());
    setNewDomain("");
    setNewApiUrl("");
    setNewApiKey("");
  };

  const handleAddPicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPicUrl.trim()) return;
    onAddRotationalPic(picCategory, newPicUrl.trim());
    setNewPicUrl("");
  };

  return (
    <div className="space-y-8">
      {/* Section 1: Dual Exclusive Link Shortener Access Modes + Dynamic API Providers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Exclusive Access Mode Selector (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  01. Exclusive Link Shortener Access Modes
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Modes operate with strict mutual exclusivity; only one mode can be active per bot instance.
                </p>
              </div>
              <ShieldCheck className="w-5 h-5 text-sky-400 shrink-0" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Mode 1: Time-Based Pass */}
              <button
                type="button"
                onClick={() => onSetAccessMode("TIME_PASS")}
                className={`p-4 rounded-xl border text-left transition-colors flex flex-col justify-between ${
                  accessMode === "TIME_PASS"
                    ? "bg-sky-500/10 border-sky-500 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      Mode 1: Time-Based Pass
                    </span>
                    <Clock className="w-4 h-4 text-sky-400" />
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Users bypass the shortener once and gain unrestricted download access for a configured duration ({passDurationHours}h).
                  </p>
                </div>
                <div className="mt-4 pt-2.5 border-t border-slate-800/80 text-xs font-mono">
                  {accessMode === "TIME_PASS" ? (
                    <span className="text-emerald-400 font-semibold">ACTIVE EXCLUSIVE MODE</span>
                  ) : (
                    <span className="text-slate-500">Click to Activate</span>
                  )}
                </div>
              </button>

              {/* Mode 2: Per-Post Protection */}
              <button
                type="button"
                onClick={() => onSetAccessMode("PER_POST")}
                className={`p-4 rounded-xl border text-left transition-colors flex flex-col justify-between ${
                  accessMode === "PER_POST"
                    ? "bg-amber-500/10 border-amber-500 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      Mode 2: Per-Post Protection
                    </span>
                    <Link2 className="w-4 h-4 text-amber-400" />
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    A freshly generated shortener verification link is mandatory for every individual file or batch requested.
                  </p>
                </div>
                <div className="mt-4 pt-2.5 border-t border-slate-800/80 text-xs font-mono">
                  {accessMode === "PER_POST" ? (
                    <span className="text-amber-400 font-semibold">ACTIVE EXCLUSIVE MODE</span>
                  ) : (
                    <span className="text-slate-500">Click to Activate</span>
                  )}
                </div>
              </button>
            </div>
          </div>

          {/* Pass Duration Slider / Selector for Mode 1 */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-slate-200">
                Time-Based Pass Duration (Hours)
              </div>
              <div className="text-xs text-slate-400">
                Unrestricted download window after 1 verification
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {[1, 3, 6, 12, 24].map((hr) => (
                <button
                  key={hr}
                  type="button"
                  onClick={() => onSetPassDurationHours(hr)}
                  className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    passDurationHours === hr
                      ? "bg-sky-500 text-slate-950 font-semibold"
                      : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                  }`}
                >
                  {hr}h
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Dynamic Link Shortener Domains & Dashboard APIs (6 cols) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  02. Dynamic Shortener Domains & Dashboard APIs
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Add or remove link shortener domains and API endpoints dynamically without restarting the bot.
                </p>
              </div>
              <Link2 className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>

            <div className="divide-y divide-slate-800">
              {shorteners.map((sh) => (
                <div
                  key={sh.id}
                  className="py-3 first:pt-1 last:pb-1 flex items-center justify-between gap-4"
                >
                  <div>
                    <div className="text-sm font-semibold text-white font-mono">
                      {sh.domain}
                    </div>
                    <div className="text-xs text-slate-400 font-mono tabular-nums">
                      API: {sh.dashboardApiUrl} · Key: {sh.apiKeyMasked} ·{" "}
                      {sh.clicksHandled.toLocaleString()} verifications
                    </div>
                  </div>
                  <button
                    onClick={() => onRemoveShortener(sh.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-400 transition-colors"
                    title="Remove Shortener Domain"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleAddShortenerSubmit} className="pt-4 border-t border-slate-800 space-y-3">
            <div className="text-xs font-semibold text-slate-200">
              Add Shortener Domain & Dashboard API
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="Domain (e.g. adrinolinks.in)"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
              />
              <input
                type="text"
                value={newApiUrl}
                onChange={(e) => setNewApiUrl(e.target.value)}
                placeholder="https://adrinolinks.in/api"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
              />
              <input
                type="text"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="Dashboard API Key"
                className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
              />
            </div>
            <button
              type="submit"
              className="w-full py-2 px-4 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach Shortener Provider</span>
            </button>
          </form>
        </div>
      </div>

      {/* Section 2: Custom Branding Watermark & /setpic Image Rotation */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Custom Document Branding & Missing File Support ID (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  03. Document Branding & Support Desk
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Every file is sent as a Document appended with your custom channel logo and watermark.
                </p>
              </div>
              <Tag className="w-5 h-5 text-amber-400 shrink-0" />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Custom Channel Username Watermark
                </label>
                <input
                  type="text"
                  value={brandWatermark}
                  onChange={(e) => onSetBrandWatermark(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Custom Channel Logo Prefix Tag
                </label>
                <input
                  type="text"
                  value={brandLogo}
                  onChange={(e) => onSetBrandLogo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">
                  Missing File "Get Support" Handle (Without @)
                </label>
                <input
                  type="text"
                  value={supportId}
                  onChange={(e) => onSetSupportId(e.target.value.replace(/^@/, ""))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-100"
                />
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <div className="text-[11px] text-slate-400">
              Live Outgoing Document Caption Template:
            </div>
            <div className="text-xs font-mono text-sky-300">
              {brandLogo} · Kalki 2898 AD 2024 2160p IMAX · Archive: {brandWatermark}
            </div>
          </div>
        </div>

        {/* Right: /setpic Visual Customization Rotation Pool (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-lg font-semibold text-white">
                  04. Visual Customization (/setpic Rotation Pools)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure rotating artwork for Start, Absent (Missing File), and Settings (/admin) panels.
                </p>
              </div>
              <ImageIcon className="w-5 h-5 text-sky-400 shrink-0" />
            </div>

            {/* Category Selector Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800 w-fit">
              {(["start", "absent", "settings"] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPicCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap shrink-0 ${
                    picCategory === cat
                      ? "bg-sky-500 text-slate-950 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {cat} Panel ({rotationalPics[cat].length})
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {rotationalPics[picCategory].map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative rounded-lg overflow-hidden border border-slate-800 bg-slate-950 group"
                >
                  <ResilientImage
                    src={url}
                    alt={`${picCategory} rotation ${idx + 1}`}
                    className="w-full h-28 object-cover"
                  />
                  <div className="p-2 flex items-center justify-between text-[11px] font-mono text-slate-400">
                    <span>Slot #{idx + 1}</span>
                    {rotationalPics[picCategory].length > 1 && (
                      <button
                        type="button"
                        onClick={() => onRemoveRotationalPic(picCategory, idx)}
                        className="text-rose-400 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <form onSubmit={handleAddPicSubmit} className="pt-4 border-t border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-200">
                Add Image to /{picCategory} Rotation (/setpic {picCategory})
              </span>
              <button
                type="button"
                onClick={() => setNewPicUrl(GENERATED_ASSETS.kalkiPoster)}
                className="text-xs text-sky-400 hover:underline whitespace-nowrap shrink-0"
              >
                Use Sample Studio Artwork
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPicUrl}
                onChange={(e) => setNewPicUrl(e.target.value)}
                placeholder="Paste image path or Telegram file_id..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
              />
              <button
                type="submit"
                className="px-4 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                Add to Rotation
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
