import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Sparkles,
  FileText,
  ExternalLink,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Layers,
  Terminal,
  RefreshCw,
} from "lucide-react";
import {
  TmdbMediaEntry,
  MediaFileItem,
  BotUserRecord,
  MongoShard,
  ClonedBotInstance,
  ShortenerProvider,
  RotationalPicConfig,
  WeeklyPollRecord,
  CONVERSATIONAL_FILLER_WORDS,
} from "../data/botStore";
import { ResilientImage } from "./ResilientImage";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  timestamp: string;
  userId?: number;
  userName?: string;
  text: string;
  aiCorrectionNote?: string;
  imageBannerUrl?: string;
  tmdbCard?: {
    entry: TmdbMediaEntry;
    matchedFiles: MediaFileItem[];
    selectedLanguage: string;
    selectedSeason: number | null;
    selectedEpisode: number | null;
  };
  documentDispatched?: {
    files: MediaFileItem[];
    brandWatermark: string;
    brandLogo: string;
    modeUsed: string;
  };
  shortenerGate?: {
    shortUrl: string;
    providerDomain: string;
    mode: "TIME_PASS" | "PER_POST";
    passDurationHours: number;
    pendingFiles: MediaFileItem[];
    verified: boolean;
  };
  pollCard?: WeeklyPollRecord;
  inlineButtons?: {
    label: string;
    action: string;
    variant: "sky" | "emerald" | "amber" | "rose" | "slate";
  }[][];
}

interface BotSimulatorViewProps {
  catalog: TmdbMediaEntry[];
  users: BotUserRecord[];
  activeUserId: number;
  setActiveUserId: (id: number) => void;
  shards: MongoShard[];
  onRegisterShard: (uri: string) => { ok: boolean; message: string };
  onGrantPremium: (userId: number, days: number) => void;
  onToggleBan: (userId: number, ban: boolean, reason?: string) => void;
  clones: ClonedBotInstance[];
  accessMode: "TIME_PASS" | "PER_POST";
  onToggleAccessMode: () => void;
  passDurationHours: number;
  shorteners: ShortenerProvider[];
  brandWatermark: string;
  brandLogo: string;
  supportId: string;
  rotationalPics: RotationalPicConfig;
  onAddRotationalPic: (category: "start" | "absent" | "settings", url: string) => void;
  trendingSearches: { query: string; count: number; language: string }[];
  onRecordSearchMetric: (query: string, language: string) => void;
  weeklyPolls: WeeklyPollRecord[];
  onTriggerSundayPoll: () => WeeklyPollRecord;
  onVotePoll: (pollId: string, optionIndex: number) => void;
  onActivateUserTimePass: (userId: number) => void;
}

export const BotSimulatorView: React.FC<BotSimulatorViewProps> = ({
  catalog,
  users,
  activeUserId,
  setActiveUserId,
  shards,
  onRegisterShard,
  onGrantPremium,
  onToggleBan,
  clones,
  accessMode,
  onToggleAccessMode,
  passDurationHours,
  shorteners,
  brandWatermark,
  brandLogo,
  supportId,
  rotationalPics,
  onAddRotationalPic,
  trendingSearches,
  onRecordSearchMetric,
  weeklyPolls,
  onTriggerSundayPoll,
  onVotePoll,
  onActivateUserTimePass,
}) => {
  const activeUser = users.find((u) => u.userId === activeUserId) || users[0];
  const [inputQuery, setInputQuery] = useState("");
  const [isInlineMode, setIsInlineMode] = useState(false);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [activeChannelFeed, setActiveChannelFeed] = useState<
    "BOT_DM" | "MASTER_DB" | "BACKUP_DB" | "MASTER_LOG" | "MASTER_LOCK"
  >("BOT_DM");

  const chatEndRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-welcome",
      sender: "bot",
      timestamp: "10:00",
      text:
        "Welcome to CinePulse Auto-Filter Bot! Multi-MongoDB repository initialized with TMDB metadata enrichment, Indian & International audio track detection, and Gemini AI Spelling Correction for Premium members.",
      imageBannerUrl: rotationalPics.start[0],
      inlineButtons: [
        [
          { label: "Top Search (Trending)", action: "cmd:top_search", variant: "amber" },
          { label: "Switch to Inline Mode", action: "cmd:inline_mode", variant: "sky" },
        ],
        [
          { label: "Open /admin Panel", action: "cmd:/admin", variant: "emerald" },
          { label: `Get Support (@${supportId})`, action: "cmd:support_info", variant: "slate" },
        ],
      ],
    },
  ]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const nowTime = () => {
    const d = new Date();
    return d.toTimeString().slice(0, 5);
  };

  const getRotatedPic = (category: "start" | "absent" | "settings") => {
    const pool = rotationalPics[category];
    if (!pool || pool.length === 0) return undefined;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const isUserPremiumActive = (user: BotUserRecord) => {
    return user.role === "OWNER" || (user.role === "PREMIUM" && user.premiumDaysRemaining > 0);
  };

  const hasValidTimePass = (user: BotUserRecord) => {
    if (!user.timePassExpiresAt) return false;
    return user.timePassExpiresAt > Date.now();
  };

  const requestFileDispatch = (filesToDispatch: MediaFileItem[], msgPrefix?: string) => {
    const activeShortener = shorteners.find((s) => s.isActive);
    if (!activeShortener) {
      setMessages((prev) => [
        ...prev,
        {
          id: `doc-${Date.now()}`,
          sender: "bot",
          timestamp: nowTime(),
          text: msgPrefix || `Transmitting ${filesToDispatch.length} file(s) as watermarked Telegram Document(s).`,
          documentDispatched: {
            files: filesToDispatch,
            brandWatermark,
            brandLogo,
            modeUsed: "Direct Access (No Shortener Active)",
          },
        },
      ]);
      return;
    }

    if (accessMode === "TIME_PASS" && hasValidTimePass(activeUser)) {
      const minsLeft = Math.max(
        1,
        Math.round(((activeUser.timePassExpiresAt || 0) - Date.now()) / 60000)
      );
      setMessages((prev) => [
        ...prev,
        {
          id: `doc-${Date.now()}`,
          sender: "bot",
          timestamp: nowTime(),
          text: `Time-Based Pass active (${minsLeft} min remaining). Bypassing shortener automatically.`,
          documentDispatched: {
            files: filesToDispatch,
            brandWatermark,
            brandLogo,
            modeUsed: `Time-Based Pass (${minsLeft}m left)`,
          },
        },
      ]);
      return;
    }

    // Otherwise gate behind exclusive shortener mode
    const tokenSlug = Math.random().toString(36).substring(2, 9);
    const shortUrl = `https://${activeShortener.domain}/verify_${tokenSlug}`;
    setMessages((prev) => [
      ...prev,
      {
        id: `gate-${Date.now()}`,
        sender: "bot",
        timestamp: nowTime(),
        text:
          accessMode === "TIME_PASS"
            ? `Exclusive Mode: Time-Based Pass (${passDurationHours}h). Verify once via ${activeShortener.domain} to unlock unrestricted downloads for ${passDurationHours} hour(s).`
            : `Exclusive Mode: Per-Post Protection. Mandatory verification link via ${activeShortener.domain} required for this file request (${filesToDispatch.length} document${filesToDispatch.length > 1 ? "s" : ""}).`,
        shortenerGate: {
          shortUrl,
          providerDomain: activeShortener.domain,
          mode: accessMode,
          passDurationHours,
          pendingFiles: filesToDispatch,
          verified: false,
        },
      },
    ]);
  };

  const handleVerifyShortenerGate = (messageId: string) => {
    const targetMsg = messages.find((m) => m.id === messageId);
    if (!targetMsg || !targetMsg.shortenerGate) return;

    const gate = targetMsg.shortenerGate;
    if (gate.mode === "TIME_PASS") {
      onActivateUserTimePass(activeUser.userId);
    }

    setMessages((prev) =>
      prev
        .map((m) =>
          m.id === messageId && m.shortenerGate
            ? { ...m, shortenerGate: { ...m.shortenerGate, verified: true } }
            : m
        )
        .concat({
          id: `verified-${Date.now()}`,
          sender: "bot",
          timestamp: nowTime(),
          text:
            gate.mode === "TIME_PASS"
              ? `Verification complete! Your ${gate.passDurationHours}-hour Time-Based Pass is now active. Delivering your watermarked Document(s):`
              : `Per-Post Link verified! Delivering your requested watermarked Document(s):`,
          documentDispatched: {
            files: gate.pendingFiles,
            brandWatermark,
            brandLogo,
            modeUsed: gate.mode === "TIME_PASS" ? "Time-Based Pass Unlocked" : "Per-Post Verified",
          },
        })
    );
  };

  const executeCommandOrSearch = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;

    // Append user bubble
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      timestamp: nowTime(),
      userId: activeUser.userId,
      userName: activeUser.name,
      text: isInlineMode ? `@CinePulseBot ${trimmed}` : trimmed,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputQuery("");

    // 1. Check global ban across main & cloned instances
    if (activeUser.isBanned) {
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: "bot",
          timestamp: nowTime(),
          text: `Access Denied: User ID ${activeUser.userId} (@${activeUser.username}) is globally banned across main and cloned instances. Reason: ${activeUser.banReason || "Policy violation"}.`,
        },
      ]);
      return;
    }

    // 2. Check Bot Commands
    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();

      if (cmd === "/start") {
        const premStatus = isUserPremiumActive(activeUser)
          ? `Premium Subscriber (${activeUser.premiumDaysRemaining} days active · Gemini AI Spellcheck Enabled)`
          : "Standard Free Tier (No AI Spellcheck · 1 Clone Limit)";
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            imageBannerUrl: getRotatedPic("start"),
            text: `Hello ${activeUser.name}!\nAccount Status: ${premStatus}\nActive Shortener Mode: ${accessMode === "TIME_PASS" ? `Time-Based Pass (${passDurationHours}h)` : "Per-Post Protection"}\nSupported Audio: Hindi · Tamil · Telugu · Malayalam · Bengali · Marathi · English · Japanese`,
            inlineButtons: [
              [
                { label: "Top Search (Trending)", action: "cmd:top_search", variant: "amber" },
                { label: "Switch Inline Search", action: "cmd:inline_mode", variant: "sky" },
              ],
              [
                { label: "Central /admin Panel", action: "cmd:/admin", variant: "emerald" },
                { label: `Get Support (@${supportId})`, action: "cmd:support_info", variant: "slate" },
              ],
            ],
          },
        ]);
        return;
      }

      if (cmd === "/admin" || cmd === "/owner") {
        if (activeUser.role !== "OWNER") {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: `Permission Denied: ${cmd} is restricted exclusively to the Bot Owner (ID: 784920114). Switch persona above to Owner to access the dashboard.`,
            },
          ]);
          return;
        }
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            imageBannerUrl: getRotatedPic("settings"),
            text: `Centralized Admin Control Panel (/admin)\nRegistered Shards: ${shards.length} MongoDB clusters · Active Clones: ${clones.length} · Exclusive Shortener Mode: ${accessMode} · Document Watermark: ${brandWatermark}`,
            inlineButtons: [
              [
                {
                  label: `Toggle Mode (Current: ${accessMode})`,
                  action: "cmd:toggle_mode",
                  variant: "emerald",
                },
                { label: "View /db_status", action: "cmd:/db_status", variant: "sky" },
              ],
              [
                { label: "View /clone_status", action: "cmd:/clone_status", variant: "amber" },
                { label: "Publish Sunday Poll", action: "cmd:sunday_poll", variant: "rose" },
              ],
            ],
          },
        ]);
        return;
      }

      if (cmd === "/db_status") {
        const lines = shards.map((s) => {
          const pct = ((s.usedMb / s.capacityMb) * 100).toFixed(1);
          return `Shard #${s.id} [${s.role}] · ${s.usedMb.toFixed(1)} / ${s.capacityMb} MB (${pct}%) · ${s.filesCount.toLocaleString()} files · ${s.maskedUri}`;
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Live Multi-MongoDB Storage Consumption (/db_status):\n\n${lines.join("\n")}`,
          },
        ]);
        return;
      }

      if (cmd === "/set_db") {
        if (activeUser.role !== "OWNER") {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Permission Denied: Only the Bot Owner can register new MongoDB URI strings via /set_db.",
            },
          ]);
          return;
        }
        const uriArg = parts[1];
        if (!uriArg) {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Usage: /set_db mongodb+srv://user:pass@cluster.mongodb.net/cinepulse_shard_04",
            },
          ]);
          return;
        }
        const res = onRegisterShard(uriArg);
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: res.message,
          },
        ]);
        return;
      }

      if (cmd === "/add_user") {
        if (activeUser.role !== "OWNER") {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Permission Denied: Only the Bot Owner can execute /add_user [user_id] [days].",
            },
          ]);
          return;
        }
        const targetId = Number(parts[1]);
        const days = Number(parts[2]);
        if (!targetId || isNaN(days) || days <= 0) {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Usage: /add_user [user_id] [days]  (Example: /add_user 904112388 30)",
            },
          ]);
          return;
        }
        onGrantPremium(targetId, days);
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Premium Subscription Granted! User ID ${targetId} now has ${days} days of Premium status, unlocking Gemini AI Spelling Correction and up to 3 Bot Clones.`,
          },
        ]);
        return;
      }

      if (cmd === "/clone_status") {
        const cloneLines = clones.map(
          (c) =>
            `• ${c.botName} (@${c.botUsername}) · Owner: ${c.ownerName} (${c.ownerId}) · Users: ${c.usersCount.toLocaleString()} · Served: ${c.filesServed.toLocaleString()} · Status: ${c.status}`
        );
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Active Bot Clones Monitor (/clone_status — ${clones.length} instances):\n\n${cloneLines.join("\n")}`,
          },
        ]);
        return;
      }

      if (cmd === "/ban" || cmd === "/unban") {
        if (activeUser.role !== "OWNER") {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Permission Denied: Only the Bot Owner can execute /ban or /unban.",
            },
          ]);
          return;
        }
        const targetId = Number(parts[1]);
        if (!targetId) {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: `Usage: ${cmd} [user_id] [optional_reason]`,
            },
          ]);
          return;
        }
        const isBanning = cmd === "/ban";
        const reason = parts.slice(2).join(" ") || "Global admin enforcement";
        onToggleBan(targetId, isBanning, reason);
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: isBanning
              ? `User ID ${targetId} has been globally banned across main and all cloned bot instances. Reason: ${reason}`
              : `User ID ${targetId} has been unbanned and restored across all instances.`,
          },
        ]);
        return;
      }

      if (cmd === "/setpic") {
        if (activeUser.role !== "OWNER") {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Permission Denied: Only the Bot Owner can configure rotational images via /setpic.",
            },
          ]);
          return;
        }
        const cat = (parts[1] || "").toLowerCase() as "start" | "absent" | "settings";
        const url = parts[2];
        if (!["start", "absent", "settings"].includes(cat) || !url) {
          setMessages((prev) => [
            ...prev,
            {
              id: `b-${Date.now()}`,
              sender: "bot",
              timestamp: nowTime(),
              text: "Usage: /setpic [start|absent|settings] [image_url]",
            },
          ]);
          return;
        }
        onAddRotationalPic(cat, url);
        setMessages((prev) => [
          ...prev,
          {
            id: `b-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Added image URL to the ${cat.toUpperCase()} rotation pool.`,
          },
        ]);
        return;
      }
    }

    // 3. Check if conversational filler ("hi", "hello", etc.)
    if (CONVERSATIONAL_FILLER_WORDS.has(trimmed.toLowerCase())) {
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          sender: "bot",
          timestamp: nowTime(),
          text: `Conversational filler ("${trimmed}") stripped from Trending Top Search analytics. Please enter a Movie, Web Series, or Anime title (e.g., "Kalki 2898 AD Hindi", "Mirzapur S03", "Solo Leveling").`,
        },
      ]);
      return;
    }

    // 4. Perform Media Search (with Gemini AI Spelling Correction ONLY for Premium/Owner users)
    let searchTitle = trimmed;
    let detectedLang = "All";
    let detectedSeason: number | null = null;
    let detectedEpisode: number | null = null;
    let aiCorrectionNote: string | undefined;

    // Extract explicit language token from raw query first
    const langTokens = [
      "Hindi",
      "Tamil",
      "Telugu",
      "Malayalam",
      "Bengali",
      "Marathi",
      "English",
      "Japanese",
    ];
    for (const lang of langTokens) {
      const reg = new RegExp(`\\b${lang}\\b`, "i");
      if (reg.test(searchTitle)) {
        detectedLang = lang;
        searchTitle = searchTitle.replace(reg, "").trim();
      }
    }

    // Extract explicit S01 / E01 from raw query
    const sMatch = searchTitle.match(/\bS0?(\d{1,2})\b|\bSeason\s*(\d{1,2})\b/i);
    if (sMatch) {
      detectedSeason = Number(sMatch[1] || sMatch[2]);
      searchTitle = searchTitle.replace(sMatch[0], "").trim();
    }
    const eMatch = searchTitle.match(/\bE0?(\d{1,2})\b|\bEp(?:isode)?\s*(\d{1,2})\b/i);
    if (eMatch) {
      detectedEpisode = Number(eMatch[1] || eMatch[2]);
      searchTitle = searchTitle.replace(eMatch[0], "").trim();
    }

    // Remove common resolution words
    searchTitle = searchTitle.replace(/\b(2160p|4k|1080p|720p|480p|ad)\b/gi, "").trim();

    if (isUserPremiumActive(activeUser)) {
      setIsProcessingAI(true);
      try {
        const resp = await fetch("/api/gemini/spellcheck", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: trimmed,
            catalogTitles: catalog.map((c) => c.title),
          }),
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data.correctedTitle) {
            searchTitle = data.correctedTitle;
          }
          if (data.detectedLanguage && detectedLang === "All") {
            detectedLang = data.detectedLanguage;
          }
          if (data.detectedSeason && !detectedSeason) {
            detectedSeason = data.detectedSeason;
          }
          if (data.detectedEpisode && !detectedEpisode) {
            detectedEpisode = data.detectedEpisode;
          }
          if (data.wasCorrected) {
            aiCorrectionNote = `Gemini AI Spelling Correction (Premium): "${trimmed}" → "${data.correctedTitle}"${
              detectedLang !== "All" ? ` · Audio: ${detectedLang}` : ""
            }`;
          } else {
            aiCorrectionNote = `Gemini AI Verified Query (Premium): "${data.correctedTitle}"`;
          }
        }
      } catch {
        // Fallback silently if offline
      } finally {
        setIsProcessingAI(false);
      }
    }

    // Match against catalog
    const normSearch = searchTitle.toLowerCase().trim();
    const matchedEntry = catalog.find((entry) => {
      const normEntry = entry.title.toLowerCase();
      if (isUserPremiumActive(activeUser)) {
        // Flexible token matching after Gemini correction
        const words = normSearch.split(/\s+/).filter((w) => w.length > 2);
        return (
          normEntry.includes(normSearch) ||
          normSearch.includes(normEntry) ||
          words.some((w) => normEntry.includes(w))
        );
      } else {
        // Standard exact substring match for Free tier (no AI typo recovery)
        return normEntry.includes(normSearch);
      }
    });

    if (!matchedEntry) {
      const tierHint = !isUserPremiumActive(activeUser)
        ? "Note: Standard Free Tier does not include Gemini AI Spelling Correction for typos. Upgrade via /add_user [user_id] [days] to unlock AI typo recovery."
        : "This title is not yet indexed in our Multi-MongoDB shards.";
      setMessages((prev) => [
        ...prev,
        {
          id: `absent-${Date.now()}`,
          sender: "bot",
          timestamp: nowTime(),
          aiCorrectionNote,
          imageBannerUrl: getRotatedPic("absent"),
          text: `No matching files found for "${trimmed}".\n${tierHint}\nTap Get Support below to request an immediate upload from @${supportId}.`,
          inlineButtons: [
            [
              {
                label: `Get Support (@${supportId})`,
                action: "cmd:support_request",
                variant: "rose",
              },
              {
                label: "View Top Search",
                action: "cmd:top_search",
                variant: "amber",
              },
            ],
          ],
        },
      ]);
      return;
    }

    // Filter files by language / season / episode if requested
    let filteredFiles = matchedEntry.files;
    if (detectedLang !== "All") {
      const langMatches = filteredFiles.filter((f) =>
        f.languages.some((l) => l.toLowerCase() === detectedLang.toLowerCase())
      );
      if (langMatches.length > 0) {
        filteredFiles = langMatches;
      }
    }
    if (detectedSeason) {
      const sMatches = filteredFiles.filter((f) => f.season === detectedSeason);
      if (sMatches.length > 0) filteredFiles = sMatches;
    }
    if (detectedEpisode) {
      const eMatches = filteredFiles.filter((f) => f.episode === detectedEpisode);
      if (eMatches.length > 0) filteredFiles = eMatches;
    }

    onRecordSearchMetric(matchedEntry.title, detectedLang === "All" ? matchedEntry.availableLanguages[0] : detectedLang);

    setMessages((prev) => [
      ...prev,
      {
        id: `tmdb-${Date.now()}`,
        sender: "bot",
        timestamp: nowTime(),
        aiCorrectionNote,
        text: `TMDB Enriched Result · ${matchedEntry.title} (${matchedEntry.releaseDate})`,
        tmdbCard: {
          entry: matchedEntry,
          matchedFiles: filteredFiles,
          selectedLanguage: detectedLang,
          selectedSeason: detectedSeason,
          selectedEpisode: detectedEpisode,
        },
      },
    ]);
  };

  const handleCardFilterChange = (
    msgId: string,
    newLang: string,
    newSeason: number | null,
    newEpisode: number | null
  ) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.tmdbCard) return m;
        const entry = m.tmdbCard.entry;
        let files = entry.files;
        if (newLang !== "All") {
          files = files.filter((f) =>
            f.languages.some((l) => l.toLowerCase() === newLang.toLowerCase())
          );
        }
        if (newSeason !== null) {
          files = files.filter((f) => f.season === newSeason);
        }
        if (newEpisode !== null) {
          files = files.filter((f) => f.episode === newEpisode);
        }
        return {
          ...m,
          tmdbCard: {
            ...m.tmdbCard,
            matchedFiles: files,
            selectedLanguage: newLang,
            selectedSeason: newSeason,
            selectedEpisode: newEpisode,
          },
        };
      })
    );
  };

  const handleInlineButtonClick = (action: string) => {
    if (action.startsWith("cmd:")) {
      const sub = action.replace("cmd:", "");
      if (sub === "top_search") {
        const listText = trendingSearches
          .slice(0, 6)
          .map((item, idx) => `${idx + 1}. ${item.query} (${item.count.toLocaleString()} searches · ${item.language})`)
          .join("\n");
        setMessages((prev) => [
          ...prev,
          {
            id: `top-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Top Search Trending Queries (Conversational filler "hi", "hello" stripped automatically):\n\n${listText}`,
            inlineButtons: [
              [
                { label: "Kalki 2898 AD Hindi", action: "search:Kalki 2898 AD Hindi", variant: "sky" },
                { label: "Solo Leveling S02", action: "search:Solo Leveling S02", variant: "emerald" },
              ],
              [
                { label: "Mirzapur S03", action: "search:Mirzapur S03", variant: "amber" },
                { label: "Manjummel Boys Malayalam", action: "search:Manjummel Boys Malayalam", variant: "rose" },
              ],
            ],
          },
        ]);
        return;
      }
      if (sub === "inline_mode") {
        setIsInlineMode((prev) => !prev);
        return;
      }
      if (sub === "toggle_mode") {
        onToggleAccessMode();
        const nextMode = accessMode === "TIME_PASS" ? "PER_POST" : "TIME_PASS";
        setMessages((prev) => [
          ...prev,
          {
            id: `mode-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Exclusive Link Shortener Access Mode switched to: ${
              nextMode === "TIME_PASS"
                ? `Time-Based Pass (${passDurationHours}h unrestricted access after 1 shortener bypass)`
                : "Per-Post Protection (Shortener verification mandatory for every file requested)"
            }.`,
          },
        ]);
        return;
      }
      if (sub === "sunday_poll") {
        const poll = onTriggerSundayPoll();
        setMessages((prev) => [
          ...prev,
          {
            id: `poll-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Weekly Sunday Automated Poll generated in User DMs, pinned across ${poll.pinnedGroupsCount} connected groups, and forwarded to Master Lock Channel (-1001982347300 · Msg #${poll.masterLockMsgId}).`,
            pollCard: poll,
          },
        ]);
        return;
      }
      if (sub === "support_info" || sub === "support_request") {
        setMessages((prev) => [
          ...prev,
          {
            id: `sup-${Date.now()}`,
            sender: "bot",
            timestamp: nowTime(),
            text: `Missing File Request routed to Support Desk @${supportId}. An upload ticket has been logged in the Master Log Channel for immediate indexing into Shard #${shards.find((s) => s.role === "ACTIVE_WRITE")?.id || 2}.`,
          },
        ]);
        return;
      }
      executeCommandOrSearch(sub);
    } else if (action.startsWith("search:")) {
      const q = action.replace("search:", "");
      executeCommandOrSearch(q);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left Column: Live Pyrogram Chat & Inline Simulator (8 cols) */}
      <div className="lg:col-span-8 flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Simulator Top Toolbar */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold text-slate-100">
              Pyrogram Interactive Client
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {activeChannelFeed === "BOT_DM"
                ? "@CinePulseBot"
                : activeChannelFeed === "MASTER_DB"
                ? "Master DB (-1001982347100)"
                : activeChannelFeed === "BACKUP_DB"
                ? "Backup Mirror (-1001982347199)"
                : activeChannelFeed === "MASTER_LOG"
                ? "Master Log (-1001982347250)"
                : "Master Lock (-1001982347300)"}
            </span>
          </div>

          {/* Channel / Feed Selector Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(
              [
                { id: "BOT_DM", label: "Bot Chat" },
                { id: "MASTER_DB", label: "Master DB" },
                { id: "BACKUP_DB", label: "Backup DB" },
                { id: "MASTER_LOG", label: "Clone Logs" },
                { id: "MASTER_LOCK", label: "Lock Polls" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveChannelFeed(tab.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  activeChannelFeed === tab.id
                    ? "bg-sky-500 text-slate-950 font-semibold"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Active Persona & Access Mode Bar */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Active Telegram User:</span>
            <div className="flex items-center gap-1">
              {users.map((u) => (
                <button
                  key={u.userId}
                  onClick={() => setActiveUserId(u.userId)}
                  className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 ${
                    u.userId === activeUserId
                      ? "bg-slate-800 text-sky-400 font-semibold border border-sky-500/40"
                      : "text-slate-400 hover:text-slate-200 bg-slate-900/60"
                  }`}
                >
                  {u.name.split(" ")[0]} ({u.role})
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-400">
            <span>
              AI Spellcheck:{" "}
              <strong className={isUserPremiumActive(activeUser) ? "text-emerald-400" : "text-amber-400"}>
                {isUserPremiumActive(activeUser) ? "Enabled (Gemini 3.8 Flash)" : "Locked (Free Tier)"}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              Gate:{" "}
              <strong className="text-sky-400">
                {accessMode === "TIME_PASS" ? `Time Pass (${passDurationHours}h)` : "Per-Post Link"}
              </strong>
            </span>
          </div>
        </div>

        {/* Feed Body */}
        {activeChannelFeed === "BOT_DM" ? (
          <>
            <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[560px] min-h-[460px] bg-slate-950/30">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.sender === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-2xl rounded-xl p-4 border ${
                      msg.sender === "user"
                        ? "bg-sky-500/15 border-sky-500/30 text-slate-100"
                        : "bg-slate-900 border-slate-800 text-slate-200"
                    }`}
                  >
                    {/* Header metadata line (Zero-Pill unboxed text with separators) */}
                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-1.5 font-mono tabular-nums">
                      <span className="font-semibold text-slate-300">
                        {msg.sender === "user" ? msg.userName : "CinePulse Auto-Filter Bot"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{msg.timestamp}</span>
                      {msg.sender === "user" && msg.userId && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>ID {msg.userId}</span>
                        </>
                      )}
                    </div>

                    {/* Gemini AI Spelling Correction Banner if triggered */}
                    {msg.aiCorrectionNote && (
                      <div className="mb-3 pb-2.5 border-b border-slate-800 flex items-center gap-2 text-xs text-emerald-400">
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>{msg.aiCorrectionNote}</span>
                      </div>
                    )}

                    {/* Rotational Image (/setpic start | absent | settings) */}
                    {msg.imageBannerUrl && !msg.tmdbCard && (
                      <div className="mb-3 rounded-lg overflow-hidden border border-slate-800 max-h-44">
                        <ResilientImage
                          src={msg.imageBannerUrl}
                          alt="Rotational panel artwork"
                          className="w-full h-40 object-cover"
                        />
                      </div>
                    )}

                    {/* Message Prose */}
                    <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>

                    {/* TMDB Enriched Movie/Series Card + Colorful Pyrogram Inline Buttons */}
                    {msg.tmdbCard && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                          <div className="sm:col-span-4 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                            <ResilientImage
                              src={msg.tmdbCard.entry.posterUrl}
                              alt={msg.tmdbCard.entry.title}
                              className="w-full h-48 object-cover"
                            />
                          </div>
                          <div className="sm:col-span-8 flex flex-col justify-between space-y-2">
                            <div>
                              <div className="text-xs text-slate-400">
                                <span>{msg.tmdbCard.entry.category}</span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums">
                                  {msg.tmdbCard.entry.releaseDate}
                                </span>
                                <span aria-hidden="true"> · </span>
                                <span className="font-mono tabular-nums text-amber-400">
                                  TMDB {msg.tmdbCard.entry.rating.toFixed(1)}/10
                                </span>
                              </div>
                              <h4 className="text-base font-bold text-white mt-0.5">
                                {msg.tmdbCard.entry.title}
                              </h4>
                              <p className="text-xs text-slate-400 mt-1">
                                Genres: {msg.tmdbCard.entry.genres.join(" / ")}
                              </p>
                              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                                {msg.tmdbCard.entry.overview}
                              </p>
                            </div>
                            <div className="text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                              <span>Detected Audio: </span>
                              <span className="text-slate-200 font-medium">
                                {msg.tmdbCard.entry.availableLanguages.join(" · ")}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Pyrogram Language Filter Row */}
                        <div className="space-y-1.5">
                          <span className="text-xs text-slate-400">
                            Filter by Audio Track:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {["All", ...msg.tmdbCard.entry.availableLanguages].map((lang) => (
                              <button
                                key={lang}
                                onClick={() =>
                                  handleCardFilterChange(
                                    msg.id,
                                    lang,
                                    msg.tmdbCard!.selectedSeason,
                                    msg.tmdbCard!.selectedEpisode
                                  )
                                }
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                  msg.tmdbCard!.selectedLanguage.toLowerCase() === lang.toLowerCase()
                                    ? "bg-sky-500 text-slate-950 font-semibold"
                                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                }`}
                              >
                                {lang}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Interactive Season & Episode Selection Rows for Web Series / Anime */}
                        {msg.tmdbCard.entry.seasons && msg.tmdbCard.entry.seasons.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div>
                              <span className="text-xs text-slate-400 block mb-1">
                                Season Selector:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                <button
                                  onClick={() =>
                                    handleCardFilterChange(
                                      msg.id,
                                      msg.tmdbCard!.selectedLanguage,
                                      null,
                                      msg.tmdbCard!.selectedEpisode
                                    )
                                  }
                                  className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                    msg.tmdbCard.selectedSeason === null
                                      ? "bg-amber-500 text-slate-950 font-semibold"
                                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                  }`}
                                >
                                  All Seasons
                                </button>
                                {msg.tmdbCard.entry.seasons.map((sNum) => (
                                  <button
                                    key={sNum}
                                    onClick={() =>
                                      handleCardFilterChange(
                                        msg.id,
                                        msg.tmdbCard!.selectedLanguage,
                                        sNum,
                                        null
                                      )
                                    }
                                    className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                      msg.tmdbCard!.selectedSeason === sNum
                                        ? "bg-amber-500 text-slate-950 font-semibold"
                                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                  >
                                    S0{sNum}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div>
                              <span className="text-xs text-slate-400 block mb-1">
                                Episode Selector:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {[null, 1, 2].map((epNum) => (
                                  <button
                                    key={epNum ?? "all"}
                                    onClick={() =>
                                      handleCardFilterChange(
                                        msg.id,
                                        msg.tmdbCard!.selectedLanguage,
                                        msg.tmdbCard!.selectedSeason,
                                        epNum
                                      )
                                    }
                                    className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 ${
                                      msg.tmdbCard!.selectedEpisode === epNum
                                        ? "bg-emerald-500 text-slate-950 font-semibold"
                                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                                    }`}
                                  >
                                    {epNum === null ? "All Eps" : `E0${epNum}`}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Batching 'Send All' Button + Individual File Inline Buttons */}
                        <div className="space-y-2 pt-2 border-t border-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-slate-400 font-mono tabular-nums">
                              Matching Repository Files ({msg.tmdbCard.matchedFiles.length})
                            </span>
                            <button
                              onClick={() =>
                                requestFileDispatch(
                                  msg.tmdbCard!.matchedFiles,
                                  `Batch 'Send All' triggered: Dispatching all ${msg.tmdbCard!.matchedFiles.length} matching files simultaneously.`
                                )
                              }
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
                            >
                              <Layers className="w-3.5 h-3.5" />
                              <span>Send All ({msg.tmdbCard.matchedFiles.length} Files)</span>
                            </button>
                          </div>

                          <div className="space-y-1.5">
                            {msg.tmdbCard.matchedFiles.map((file) => (
                              <button
                                key={file.fileUniqueId}
                                onClick={() => requestFileDispatch([file])}
                                className="w-full text-left px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/40 transition-colors flex items-center justify-between gap-3 group"
                              >
                                <div className="min-w-0">
                                  <div className="text-xs font-mono text-slate-200 group-hover:text-sky-300 truncate">
                                    {file.fileName}
                                  </div>
                                  <div className="text-[11px] text-slate-400 mt-0.5">
                                    <span>{file.languages.join(" / ")}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span>{file.quality}</span>
                                    <span aria-hidden="true"> · </span>
                                    <span className="font-mono tabular-nums">
                                      Shard #{file.shardId}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-xs font-mono tabular-nums text-sky-400 shrink-0">
                                  {file.fileSizeMb} MB →
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Shortener Verification Gate UI */}
                    {msg.shortenerGate && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-amber-400 font-medium flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            <span>
                              {msg.shortenerGate.mode === "TIME_PASS"
                                ? `Time-Based Pass Gate (${msg.shortenerGate.passDurationHours}h Access)`
                                : "Per-Post Protection Gate (Single Request)"}
                            </span>
                          </span>
                          <span className="font-mono text-slate-400">
                            {msg.shortenerGate.shortUrl}
                          </span>
                        </div>
                        {msg.shortenerGate.verified ? (
                          <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Shortener Link Verified — Document Dispatched</span>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleVerifyShortenerGate(msg.id)}
                            className="w-full py-2 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>
                              {msg.shortenerGate.mode === "TIME_PASS"
                                ? `Complete Shortener & Activate ${msg.shortenerGate.passDurationHours}h Unrestricted Pass`
                                : `Verify Shortener Link to Download (${msg.shortenerGate.pendingFiles.length} File)`}
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Dispatched Watermarked Telegram Document Card */}
                    {msg.documentDispatched && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                        <div className="text-xs text-emerald-400 font-medium">
                          Telegram Document Transmission · {msg.documentDispatched.modeUsed}
                        </div>
                        {msg.documentDispatched.files.map((doc) => (
                          <div
                            key={doc.fileUniqueId}
                            className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-mono font-semibold text-sky-300 flex items-center gap-1.5 truncate">
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{doc.fileName}</span>
                              </span>
                              <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                                {doc.fileSizeMb} MB · Document
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 font-mono">
                              {msg.documentDispatched!.brandLogo} · {doc.sanitizedCaption}
                            </p>
                            <div className="text-[11px] text-slate-400">
                              <span>Stripped External URLs & Handles</span>
                              <span aria-hidden="true"> · </span>
                              <span>Watermark: {msg.documentDispatched!.brandWatermark}</span>
                              <span aria-hidden="true"> · </span>
                              <span>Mirrored Backup Msg #{doc.backupMsgId}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Weekly Automated Poll Card */}
                    {msg.pollCard && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2.5">
                        <div className="text-xs font-semibold text-amber-400">
                          {msg.pollCard.question}
                        </div>
                        <div className="space-y-1.5">
                          {msg.pollCard.options.map((opt, idx) => {
                            const pct =
                              msg.pollCard!.totalVotes > 0
                                ? Math.round((opt.votes / msg.pollCard!.totalVotes) * 100)
                                : 0;
                            return (
                              <button
                                key={opt.label}
                                onClick={() => onVotePoll(msg.pollCard!.id, idx)}
                                className="w-full text-left p-2 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 transition-colors flex items-center justify-between text-xs"
                              >
                                <span className="text-slate-200 font-medium">{opt.label}</span>
                                <span className="font-mono tabular-nums text-sky-400">
                                  {opt.votes} votes ({pct}%)
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                          Total Votes: {msg.pollCard.totalVotes} · Pinned in{" "}
                          {msg.pollCard.pinnedGroupsCount} Groups · Forwarded to Master Lock Channel
                        </div>
                      </div>
                    )}

                    {/* Pyrogram Colorful Inline Keyboard Buttons */}
                    {msg.inlineButtons && msg.inlineButtons.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800 space-y-1.5">
                        {msg.inlineButtons.map((row, rIdx) => (
                          <div key={rIdx} className="grid grid-cols-2 gap-1.5">
                            {row.map((btn) => {
                              const colorStyles =
                                btn.variant === "sky"
                                  ? "bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border-sky-500/30"
                                  : btn.variant === "emerald"
                                  ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30"
                                  : btn.variant === "amber"
                                  ? "bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/30"
                                  : btn.variant === "rose"
                                  ? "bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30"
                                  : "bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700";
                              return (
                                <button
                                  key={btn.label}
                                  onClick={() => handleInlineButtonClick(btn.action)}
                                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors text-center truncate whitespace-nowrap shrink-0 ${colorStyles}`}
                                >
                                  {btn.label}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isProcessingAI && (
                <div className="flex items-center gap-2 text-xs text-sky-400 font-mono px-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Gemini 3.8 Flash intercepting & correcting search query...</span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick Test Queries & Commands Strip */}
            <div className="px-5 py-2.5 bg-slate-950/80 border-t border-slate-800 flex items-center gap-1.5 overflow-x-auto">
              <span className="text-[11px] text-slate-400 shrink-0 mr-1">Try:</span>
              {[
                { label: "Typo: Kallki 2898 Hindi", val: "Kallki 2898 Hindi" },
                { label: "Typo: Mirzapurr S03", val: "Mirzapurr S03" },
                { label: "Typo: Solo Levelling", val: "Solo Levelling" },
                { label: "Malayalam: Manjummel Boys", val: "Manjummel Boys Malayalam" },
                { label: "/db_status", val: "/db_status" },
                { label: "/admin", val: "/admin" },
                { label: "/clone_status", val: "/clone_status" },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => executeCommandOrSearch(preset.val)}
                  className="px-2.5 py-1 text-xs bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Message Input Bar */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                executeCommandOrSearch(inputQuery);
              }}
              className="p-3.5 bg-slate-900 border-t border-slate-800 flex items-center gap-2.5"
            >
              <button
                type="button"
                onClick={() => setIsInlineMode((prev) => !prev)}
                className={`px-3 py-2 text-xs font-mono rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  isInlineMode
                    ? "bg-sky-500/20 border-sky-500/40 text-sky-300"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {isInlineMode ? "@CinePulseBot [Inline]" : "Standard Mode"}
              </button>
              <input
                type="text"
                value={inputQuery}
                onChange={(e) => setInputQuery(e.target.value)}
                placeholder={
                  isInlineMode
                    ? "Type inline movie/series query (e.g. Kalki Hindi, Mirzapur S03)..."
                    : "Search movie/series/anime or run /start, /set_db, /db_status, /add_user, /admin..."
                }
                className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </>
        ) : (
          /* Mandatory Channel Feeds Inspection (Master DB, Backup DB, Master Log, Master Lock) */
          <div className="p-5 space-y-4 min-h-[520px] bg-slate-950/40 overflow-y-auto">
            {activeChannelFeed === "MASTER_DB" && (
              <div className="space-y-3">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">
                    Master Database Channel (-1001982347100) · Mandatory Public Media Repository
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Central ingestion source for the main bot and all {clones.length} cloned bot instances.
                  </p>
                </div>
                {catalog.flatMap((c) => c.files).map((file) => (
                  <div
                    key={file.fileUniqueId}
                    className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-400">
                      <span>Msg #{file.masterMsgId} · Shard #{file.shardId}</span>
                      <span>{file.fileSizeMb} MB · {file.quality}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-200">{file.fileName}</div>
                    <div className="text-xs text-rose-400/90 font-mono">
                      Raw Ingested: {file.rawIngestedCaption}
                    </div>
                    <div className="text-xs text-emerald-400 font-mono">
                      Sanitized & Branded: {file.sanitizedCaption}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeChannelFeed === "BACKUP_DB" && (
              <div className="space-y-3">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">
                    Backup Database Channel (-1001982347199) · Automated Real-Time Mirror
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Every uploaded document in Master DB is automatically stripped of external links and mirrored here.
                  </p>
                </div>
                {catalog.flatMap((c) => c.files).map((file) => (
                  <div
                    key={file.fileUniqueId}
                    className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="text-xs font-mono text-emerald-400">
                        Backup Msg #{file.backupMsgId} ← Mirrored from Master Msg #{file.masterMsgId}
                      </div>
                      <div className="text-xs font-mono text-slate-200 truncate">
                        {file.sanitizedCaption}
                      </div>
                    </div>
                    <span className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
                      VERIFIED MIRROR
                    </span>
                  </div>
                ))}
              </div>
            )}

            {activeChannelFeed === "MASTER_LOG" && (
              <div className="space-y-3">
                <div className="pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-white">
                    Master Log Channel (-1001982347250) · Cloned Bot Telemetry & Audit Log
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Records every cloned bot instance's Bot Name, Username, Owner Name, Username, User ID, Token, and Creation Date.
                  </p>
                </div>
                {clones.map((c) => (
                  <div
                    key={c.id}
                    className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1 font-mono text-xs"
                  >
                    <div className="text-sky-400 font-semibold">#NEW_CLONE_REGISTERED</div>
                    <div className="text-slate-200">
                      Bot Name: {c.botName} (@{c.botUsername})
                    </div>
                    <div className="text-slate-300">
                      Owner: {c.ownerName} (@{c.ownerUsername}) · User ID: {c.ownerId}
                    </div>
                    <div className="text-slate-400">
                      Token: {c.maskedToken} · Created: {c.createdAt}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeChannelFeed === "MASTER_LOCK" && (
              <div className="space-y-3">
                <div className="pb-3 border-b border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      Master Lock Channel (-1001982347300) · Aggregated Sunday Trending Polls
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Receives automated Sunday DM & Group pinned poll results to prioritize weekly uploads.
                    </p>
                  </div>
                  <button
                    onClick={() => handleInlineButtonClick("cmd:sunday_poll")}
                    className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    Trigger Sunday Poll Now
                  </button>
                </div>
                {weeklyPolls.map((poll) => (
                  <div
                    key={poll.id}
                    className="p-4 rounded-lg bg-slate-900 border border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>Sunday Poll · {poll.sundayDate}</span>
                      <span>Master Lock Msg #{poll.masterLockMsgId}</span>
                    </div>
                    <div className="text-sm font-semibold text-white">{poll.question}</div>
                    <div className="space-y-1.5">
                      {poll.options.map((opt) => {
                        const pct =
                          poll.totalVotes > 0
                            ? Math.round((opt.votes / poll.totalVotes) * 100)
                            : 0;
                        return (
                          <div
                            key={opt.label}
                            className="flex items-center justify-between text-xs bg-slate-950 px-3 py-1.5 rounded border border-slate-800"
                          >
                            <span className="text-slate-200">{opt.label}</span>
                            <span className="font-mono tabular-nums text-sky-400">
                              {opt.votes} votes ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Column: Command Reference & Live Architecture Telemetry (4 cols) */}
      <div className="lg:col-span-4 flex flex-col justify-between bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-6">
        <div className="space-y-4">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-base font-semibold text-white">
              Interactive Verification Guide
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Click any workflow below to execute it live in the Pyrogram simulator.
            </p>
          </div>

          {/* Workflow 1: Gemini AI Spelling Correction */}
          <div className="space-y-2 pb-4 border-b border-slate-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                01. Gemini AI Spelling Correction
              </span>
              <span className="font-mono text-emerald-400">Premium Exclusive</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Test a typo query (`"Kallki 2898 Hindi"`). Premium/Owner personas invoke Gemini 3.8 Flash; Free users bypass AI correction.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setActiveUserId(612094811);
                  setTimeout(() => executeCommandOrSearch("Kallki 2898 Hindi"), 50);
                }}
                className="flex-1 px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Test as Premium (AI On)
              </button>
              <button
                onClick={() => {
                  setActiveUserId(904112388);
                  setTimeout(() => executeCommandOrSearch("Kallki 2898 Hindi"), 50);
                }}
                className="flex-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Test as Free (AI Off)
              </button>
            </div>
          </div>

          {/* Workflow 2: Multi-Language & Series Batching */}
          <div className="space-y-2 pb-4 border-b border-slate-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                02. Indian Languages & Series Batching
              </span>
              <span className="font-mono text-sky-400">TMDB + Send All</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Query series with Season/Episode buttons or regional Indian audio tracks (Hindi, Tamil, Telugu, Malayalam, Bengali, Marathi).
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => executeCommandOrSearch("Mirzapur S03")}
                className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Series: Mirzapur S03
              </button>
              <button
                onClick={() => executeCommandOrSearch("Manjummel Boys Marathi")}
                className="px-3 py-1.5 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Marathi/Malayalam Search
              </button>
            </div>
          </div>

          {/* Workflow 3: Exclusive Shortener Access Mode */}
          <div className="space-y-2 pb-4 border-b border-slate-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                03. Exclusive Link Shortener Mode
              </span>
              <span className="font-mono text-amber-400">
                {accessMode === "TIME_PASS" ? "Time-Based Pass" : "Per-Post Link"}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Switch between Time-Based Pass ({passDurationHours}h unrestricted access) and Per-Post Protection (shortener required for every file).
            </p>
            <button
              onClick={() => handleInlineButtonClick("cmd:toggle_mode")}
              className="w-full px-3 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0"
            >
              Switch Exclusive Mode ({accessMode === "TIME_PASS" ? "→ Per-Post" : "→ Time Pass"})
            </button>
          </div>

          {/* Workflow 4: Admin Commands & Sunday Poll */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-200">
                04. Admin Commands & Sunday Poll
              </span>
              <span className="font-mono text-slate-400">/admin · /set_db</span>
            </div>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  setActiveUserId(784920114);
                  setTimeout(() => executeCommandOrSearch("/add_user 904112388 30"), 50);
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-mono transition-colors truncate whitespace-nowrap shrink-0"
              >
                /add_user 904112388 30
              </button>
              <button
                onClick={() => handleInlineButtonClick("cmd:sunday_poll")}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors truncate whitespace-nowrap shrink-0"
              >
                Run Sunday Poll
              </button>
            </div>
          </div>
        </div>

        {/* Bottom Repository Summary */}
        <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono tabular-nums">
          <span>Shards Online: {shards.length}</span>
          <span>·</span>
          <span>Indexed Titles: {catalog.length}</span>
          <span>·</span>
          <span>Clones: {clones.length}</span>
        </div>
      </div>
    </div>
  );
};
