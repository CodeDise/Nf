import React, { useState } from "react";
import JSZip from "jszip";
import {
  INITIAL_SHARDS,
  INITIAL_CATALOG,
  INITIAL_USERS,
  INITIAL_CLONES,
  INITIAL_SHORTENERS,
  INITIAL_TRENDING_SEARCHES,
  GENERATED_ASSETS,
  MongoShard,
  TmdbMediaEntry,
  BotUserRecord,
  ClonedBotInstance,
  ShortenerProvider,
  RotationalPicConfig,
  WeeklyPollRecord,
  sanitizeCaptionText,
} from "./data/botStore";
import { BotSimulatorView } from "./components/BotSimulatorView";
import { MultiMongoView } from "./components/MultiMongoView";
import { AdminClonesView } from "./components/AdminClonesView";
import { MediaShortenerView } from "./components/MediaShortenerView";
import { RenderPackageView } from "./components/RenderPackageView";

type ActiveTab =
  | "simulator"
  | "mongodb"
  | "admin"
  | "shortener"
  | "render";

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("simulator");

  // 1. Multi-MongoDB Shards State
  const [shards, setShards] = useState<MongoShard[]>(INITIAL_SHARDS);

  // 2. TMDB Media Catalog State
  const [catalog, setCatalog] = useState<TmdbMediaEntry[]>(INITIAL_CATALOG);

  // 3. Users & Subscriptions State
  const [users, setUsers] = useState<BotUserRecord[]>(INITIAL_USERS);
  const [activeUserId, setActiveUserId] = useState<number>(612094811); // Default to Premium user Riya to showcase AI Spellcheck immediately

  // 4. Cloned Bots State
  const [clones, setClones] = useState<ClonedBotInstance[]>(INITIAL_CLONES);

  // 5. Exclusive Link Shortener Mode & Providers State
  const [accessMode, setAccessMode] = useState<"TIME_PASS" | "PER_POST">("TIME_PASS");
  const [passDurationHours, setPassDurationHours] = useState<number>(1);
  const [shorteners, setShorteners] = useState<ShortenerProvider[]>(INITIAL_SHORTENERS);

  // 6. Branding, Support & /setpic Rotation Pools State
  const [brandWatermark, setBrandWatermark] = useState<string>("@CinePulseMain");
  const [brandLogo, setBrandLogo] = useState<string>("[CINEPULSE OFFICIAL]");
  const [supportId, setSupportId] = useState<string>("CinePulseSupport");
  const [rotationalPics, setRotationalPics] = useState<RotationalPicConfig>({
    start: [GENERATED_ASSETS.startBanner, GENERATED_ASSETS.kalkiPoster],
    absent: [GENERATED_ASSETS.thrillerPoster, GENERATED_ASSETS.animePoster],
    settings: [GENERATED_ASSETS.startBanner, GENERATED_ASSETS.animePoster],
  });

  // 7. Trending Searches & Weekly Sunday Polls State
  const [trendingSearches, setTrendingSearches] = useState(INITIAL_TRENDING_SEARCHES);
  const [weeklyPolls, setWeeklyPolls] = useState<WeeklyPollRecord[]>([
    {
      id: "poll-sun-1",
      sundayDate: "2026-11-08 (Sunday)",
      question:
        "Sunday Trending Poll: Which movie or series should we encode in 2160p 4K IMAX Multi-Audio next?",
      options: [
        { label: "Kalki 2898 AD (Hindi / Telugu / Tamil)", votes: 642 },
        { label: "Solo Leveling Season 2 (Multi Audio)", votes: 518 },
        { label: "Mirzapur Season 3 Bonus Cut", votes: 394 },
        { label: "Manjummel Boys (Malayalam / Marathi)", votes: 286 },
      ],
      totalVotes: 1840,
      pinnedGroupsCount: 14,
      forwardedToMasterLock: true,
      masterLockMsgId: 40912,
    },
  ]);

  // Handlers
  const handleRegisterShard = (uri: string, customName?: string) => {
    if (!uri.startsWith("mongodb")) {
      return {
        ok: false,
        message: "Invalid URI: Must begin with mongodb:// or mongodb+srv://",
      };
    }
    if (shards.some((s) => s.uri === uri)) {
      return {
        ok: false,
        message: "Duplicate URI: This MongoDB cluster is already registered in the sequential pool.",
      };
    }
    const nextId = shards.length + 1;
    const masked = uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:****@");
    const hasActiveWrite = shards.some((s) => s.role === "ACTIVE_WRITE");
    const newShard: MongoShard = {
      id: nextId,
      name: customName || `Overflow Cluster #${nextId}`,
      uri,
      maskedUri: masked,
      usedMb: 0.4,
      capacityMb: 512.0,
      filesCount: 0,
      role: hasActiveWrite ? "STANDBY_READ" : "ACTIVE_WRITE",
      addedAt: new Date().toISOString().slice(0, 10),
    };
    setShards((prev) => [...prev, newShard]);
    return {
      ok: true,
      message: `Shard #${nextId} (${newShard.name}) verified and registered in sequential pool via /set_db.`,
    };
  };

  const handleSimulateShardFill = (shardId: number, addMb: number) => {
    setShards((prev) => {
      const updated = prev.map((s) => {
        if (s.id !== shardId) return s;
        const nextMb = Math.min(s.capacityMb, s.usedMb + addMb);
        const isNowFull = nextMb >= 480;
        return {
          ...s,
          usedMb: nextMb,
          filesCount: s.filesCount + Math.round(addMb * 12),
          role: isNowFull ? ("READ_FULL" as const) : s.role,
        };
      });

      // Ensure at least one non-full shard is promoted to ACTIVE_WRITE sequentially
      if (!updated.some((s) => s.role === "ACTIVE_WRITE")) {
        const nextCandidateIdx = updated.findIndex((s) => s.usedMb < 480);
        if (nextCandidateIdx !== -1) {
          updated[nextCandidateIdx] = {
            ...updated[nextCandidateIdx],
            role: "ACTIVE_WRITE",
          };
        }
      }
      return updated;
    });
  };

  const handleIngestNewMediaFile = (
    entryId: string,
    fileName: string,
    fileSizeMb: number,
    quality: string,
    languages: string[],
    rawCaption: string,
    season?: number,
    episode?: number
  ) => {
    const activeShard = shards.find((s) => s.role === "ACTIVE_WRITE") || shards[shards.length - 1];
    const sanitized = sanitizeCaptionText(rawCaption, brandWatermark, brandLogo);
    const newFile = {
      fileUniqueId: `doc_${Date.now()}`,
      fileName,
      fileSizeMb,
      quality,
      languages,
      season,
      episode,
      shardId: activeShard.id,
      masterMsgId: Math.floor(12000 + Math.random() * 900),
      backupMsgId: Math.floor(90000 + Math.random() * 900),
      rawIngestedCaption: rawCaption,
      sanitizedCaption: sanitized,
    };

    setCatalog((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        const mergedLangs = Array.from(new Set([...entry.availableLanguages, ...languages]));
        return {
          ...entry,
          availableLanguages: mergedLangs,
          files: [newFile, ...entry.files],
        };
      })
    );

    // Increment storage on active shard
    handleSimulateShardFill(activeShard.id, Math.max(2, Math.round(fileSizeMb / 120)));
  };

  const handleGrantPremium = (userId: number, days: number) => {
    const untilDate = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    setUsers((prev) => {
      const exists = prev.some((u) => u.userId === userId);
      if (!exists) {
        return [
          ...prev,
          {
            userId,
            name: `Telegram User ${userId}`,
            username: `user_${userId}`,
            role: "PREMIUM",
            premiumDaysRemaining: days,
            premiumUntil: untilDate,
            cloneLimit: 3,
            isBanned: false,
            timePassExpiresAt: null,
          },
        ];
      }
      return prev.map((u) =>
        u.userId === userId
          ? {
              ...u,
              role: u.role === "OWNER" ? "OWNER" : "PREMIUM",
              premiumDaysRemaining: days,
              premiumUntil: untilDate,
              cloneLimit: u.cloneLimit === "UNLIMITED" ? "UNLIMITED" : 3,
            }
          : u
      );
    });
  };

  const handleSetCloneLimitOverride = (userId: number, limit: number | "UNLIMITED") => {
    setUsers((prev) =>
      prev.map((u) => (u.userId === userId ? { ...u, cloneLimit: limit } : u))
    );
  };

  const handleToggleBan = (userId: number, ban: boolean, reason?: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.userId === userId ? { ...u, isBanned: ban, banReason: reason } : u
      )
    );
    setClones((prev) =>
      prev.map((c) =>
        c.ownerId === userId
          ? { ...c, status: ban ? "BANNED_OWNER" : "ONLINE" }
          : c
      )
    );
  };

  const handleCreateClone = (
    ownerId: number,
    botName: string,
    botUsername: string,
    token: string
  ) => {
    const owner = users.find((u) => u.userId === ownerId);
    if (!owner) {
      return { ok: false, message: "Owner user record not found." };
    }
    if (owner.isBanned) {
      return {
        ok: false,
        message: "Banned users cannot create or operate cloned bot instances.",
      };
    }
    const existingCount = clones.filter((c) => c.ownerId === ownerId).length;
    if (owner.cloneLimit !== "UNLIMITED" && existingCount >= owner.cloneLimit) {
      return {
        ok: false,
        message: `Clone Quota Reached: ${owner.name} (${owner.role}) is limited to ${owner.cloneLimit} clone(s). Upgrade to Premium (3 clones) or apply an Admin Unlimited Override.`,
      };
    }

    const newClone: ClonedBotInstance = {
      id: `clone-${Date.now()}`,
      botName,
      botUsername,
      ownerName: owner.name.replace(/\s*\(.*\)/, ""),
      ownerUsername: owner.username,
      ownerId: owner.userId,
      maskedToken: `${token.slice(0, 10)}...${token.slice(-4)}`,
      createdAt: new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC",
      usersCount: 1,
      filesServed: 0,
      status: "ONLINE",
    };
    setClones((prev) => [newClone, ...prev]);
    return {
      ok: true,
      message: `Cloned bot @${botUsername} provisioned and logged to Master Log Channel (-1001982347250).`,
    };
  };

  const handleRecordSearchMetric = (query: string, language: string) => {
    setTrendingSearches((prev) => {
      const idx = prev.findIndex((i) => i.query.toLowerCase() === query.toLowerCase());
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], count: next[idx].count + 1 };
        return next.sort((a, b) => b.count - a.count);
      }
      return [...prev, { query, count: 1, language }].sort((a, b) => b.count - a.count);
    });
  };

  const handleTriggerSundayPoll = (): WeeklyPollRecord => {
    const top4 = trendingSearches.slice(0, 4);
    const newPoll: WeeklyPollRecord = {
      id: `poll-${Date.now()}`,
      sundayDate: new Date().toISOString().slice(0, 10) + " (Sunday Dispatch)",
      question:
        "Weekly Sunday Automated Poll: Vote on this week's trending release for priority 4K Multi-Audio indexing!",
      options: top4.map((t, i) => ({
        label: `${t.query} (${t.language})`,
        votes: 140 - i * 25,
      })),
      totalVotes: top4.reduce((acc, _, i) => acc + (140 - i * 25), 0),
      pinnedGroupsCount: 16,
      forwardedToMasterLock: true,
      masterLockMsgId: Math.floor(41000 + Math.random() * 900),
    };
    setWeeklyPolls((prev) => [newPoll, ...prev]);
    return newPoll;
  };

  const handleVotePoll = (pollId: string, optionIndex: number) => {
    setWeeklyPolls((prev) =>
      prev.map((p) => {
        if (p.id !== pollId) return p;
        const nextOpts = p.options.map((o, idx) =>
          idx === optionIndex ? { ...o, votes: o.votes + 1 } : o
        );
        return {
          ...p,
          options: nextOpts,
          totalVotes: p.totalVotes + 1,
        };
      })
    );
  };

  const handleActivateUserTimePass = (userId: number) => {
    const expiry = Date.now() + passDurationHours * 3600 * 1000;
    setUsers((prev) =>
      prev.map((u) => (u.userId === userId ? { ...u, timePassExpiresAt: expiry } : u))
    );
  };

  const handleExportQuickZip = async () => {
    try {
      const resp = await fetch("/api/source-files");
      const filesMap = await resp.json();
      const zip = new JSZip();
      Object.entries(filesMap).forEach(([fname, content]) => {
        zip.file(fname, String(content));
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cinepulse-autofilter-render-bot.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      setActiveTab("render");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950/90 sticky top-0 z-30 backdrop-blur-md">
        {/* Zone 1: Single text element Brand wordmark */}
        <a
          href="#simulator"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab("simulator");
          }}
          className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          CinePulse Auto-Filter
        </a>

        {/* Zone 2: 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          {(
            [
              { id: "simulator", label: "Bot Simulator" },
              { id: "mongodb", label: "Multi-DB Shards" },
              { id: "admin", label: "Admin & Clones" },
              { id: "shortener", label: "Media & Shortener" },
              { id: "render", label: "Render Package" },
            ] as const
          ).map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(item.id);
              }}
              className={`transition-colors whitespace-nowrap shrink-0 py-1 ${
                activeTab === item.id
                  ? "text-white font-semibold underline decoration-sky-400 decoration-2 underline-offset-8"
                  : "hover:text-slate-200"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: 1 primary action button */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleExportQuickZip}
            className="px-4 py-2 text-xs font-semibold text-slate-950 bg-sky-500 rounded-lg hover:bg-sky-400 transition-colors whitespace-nowrap shrink-0"
          >
            Export Render ZIP
          </button>
        </div>
      </header>

      {/* Mobile Navigation Strip */}
      <div className="md:hidden flex items-center gap-2 px-4 py-2.5 border-b border-slate-800 bg-slate-900 overflow-x-auto">
        {(
          [
            { id: "simulator", label: "Bot Simulator" },
            { id: "mongodb", label: "Multi-DB Shards" },
            { id: "admin", label: "Admin & Clones" },
            { id: "shortener", label: "Media & Shortener" },
            { id: "render", label: "Render Package" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
              activeTab === item.id
                ? "bg-sky-500 text-slate-950 font-semibold"
                : "text-slate-400 bg-slate-950"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Content Container (1440px Desktop Presence) */}
      <main className="flex-1 max-w-[1380px] w-full mx-auto px-6 py-8 space-y-8">
        {/* Contextual Workspace Header & Architecture Summary */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-800">
          <div className="space-y-1.5 max-w-3xl">
            <div className="text-xs text-slate-400 font-mono tabular-nums">
              <span>Pyrogram v2 Architecture</span>
              <span aria-hidden="true"> · </span>
              <span>Master DB (-1001982347100)</span>
              <span aria-hidden="true"> · </span>
              <span>{shards.length} Sequential MongoDB Shards</span>
              <span aria-hidden="true"> · </span>
              <span>Gemini 3.8 Flash Spellcheck</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight text-balance">
              {activeTab === "simulator" &&
                "Interactive Pyrogram Auto-Filter Bot & Channel Telemetry"}
              {activeTab === "mongodb" &&
                "Dynamic Multi-MongoDB Sharding & Channel Media Sanitizer"}
              {activeTab === "admin" &&
                "Centralized /admin Control Panel, Premium Tiers & Clone Registry"}
              {activeTab === "shortener" &&
                "Exclusive Link Shortener Modes, Watermarking & /setpic Rotation"}
              {activeTab === "render" &&
                "Render Root-Level Python Deployment Package (main.py, requirements.txt)"}
            </h1>
          </div>

          {/* Quick Architecture Telemetry Summary */}
          <div className="flex items-center gap-4 text-xs text-slate-400 font-mono tabular-nums shrink-0">
            <div>
              <span className="text-slate-500">Exclusive Gate: </span>
              <span className="text-sky-400 font-semibold">
                {accessMode === "TIME_PASS"
                  ? `Time-Based Pass (${passDurationHours}h)`
                  : "Per-Post Protection"}
              </span>
            </div>
            <span aria-hidden="true">·</span>
            <div>
              <span className="text-slate-500">Active Clones: </span>
              <span className="text-emerald-400 font-semibold">{clones.length}</span>
            </div>
          </div>
        </div>

        {/* Active View Render */}
        {activeTab === "simulator" && (
          <BotSimulatorView
            catalog={catalog}
            users={users}
            activeUserId={activeUserId}
            setActiveUserId={setActiveUserId}
            shards={shards}
            onRegisterShard={handleRegisterShard}
            onGrantPremium={handleGrantPremium}
            onToggleBan={handleToggleBan}
            clones={clones}
            accessMode={accessMode}
            onToggleAccessMode={() =>
              setAccessMode((prev) => (prev === "TIME_PASS" ? "PER_POST" : "TIME_PASS"))
            }
            passDurationHours={passDurationHours}
            shorteners={shorteners}
            brandWatermark={brandWatermark}
            brandLogo={brandLogo}
            supportId={supportId}
            rotationalPics={rotationalPics}
            onAddRotationalPic={(cat, url) =>
              setRotationalPics((prev) => ({
                ...prev,
                [cat]: [...prev[cat], url],
              }))
            }
            trendingSearches={trendingSearches}
            onRecordSearchMetric={handleRecordSearchMetric}
            weeklyPolls={weeklyPolls}
            onTriggerSundayPoll={handleTriggerSundayPoll}
            onVotePoll={handleVotePoll}
            onActivateUserTimePass={handleActivateUserTimePass}
          />
        )}

        {activeTab === "mongodb" && (
          <MultiMongoView
            shards={shards}
            onRegisterShard={handleRegisterShard}
            onSimulateShardFill={handleSimulateShardFill}
            catalog={catalog}
            onIngestNewMediaFile={handleIngestNewMediaFile}
            brandWatermark={brandWatermark}
            brandLogo={brandLogo}
          />
        )}

        {activeTab === "admin" && (
          <AdminClonesView
            users={users}
            onGrantPremium={handleGrantPremium}
            onSetCloneLimitOverride={handleSetCloneLimitOverride}
            onToggleBan={handleToggleBan}
            clones={clones}
            onCreateClone={handleCreateClone}
            weeklyPolls={weeklyPolls}
            onTriggerSundayPoll={handleTriggerSundayPoll}
            onSendBroadcast={(text) => {
              void text;
              return {
                deliveredUsers: users.filter((u) => !u.isBanned).length * 4120,
                deliveredClones: clones.filter((c) => c.status === "ONLINE").length,
              };
            }}
          />
        )}

        {activeTab === "shortener" && (
          <MediaShortenerView
            accessMode={accessMode}
            onSetAccessMode={setAccessMode}
            passDurationHours={passDurationHours}
            onSetPassDurationHours={setPassDurationHours}
            shorteners={shorteners}
            onAddShortener={(domain, apiUrl, apiKey) =>
              setShorteners((prev) => [
                ...prev,
                {
                  id: `sh-${Date.now()}`,
                  domain,
                  dashboardApiUrl: apiUrl,
                  apiKeyMasked: `${apiKey.slice(0, 6)}...`,
                  clicksHandled: 0,
                  isActive: true,
                },
              ])
            }
            onRemoveShortener={(id) =>
              setShorteners((prev) => prev.filter((s) => s.id !== id))
            }
            brandWatermark={brandWatermark}
            onSetBrandWatermark={setBrandWatermark}
            brandLogo={brandLogo}
            onSetBrandLogo={setBrandLogo}
            supportId={supportId}
            onSetSupportId={setSupportId}
            rotationalPics={rotationalPics}
            onAddRotationalPic={(cat, url) =>
              setRotationalPics((prev) => ({
                ...prev,
                [cat]: [...prev[cat], url],
              }))
            }
            onRemoveRotationalPic={(cat, idx) =>
              setRotationalPics((prev) => ({
                ...prev,
                [cat]: prev[cat].filter((_, i) => i !== idx),
              }))
            }
          />
        )}

        {activeTab === "render" && (
          <RenderPackageView
            brandWatermark={brandWatermark}
            supportId={supportId}
            accessMode={accessMode}
            shardsCount={shards.length}
          />
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-800/80 py-5 px-6 text-xs text-slate-500">
        <div className="max-w-[1380px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>CinePulse Auto-Filter Bot · Pyrogram Root-Level Architecture for Render</span>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("simulator")}
              className="hover:text-slate-300 transition-colors"
            >
              Bot Simulator
            </button>
            <span>·</span>
            <button
              onClick={() => setActiveTab("render")}
              className="hover:text-slate-300 transition-colors"
            >
              Root Source Files (main.py, requirements.txt)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
