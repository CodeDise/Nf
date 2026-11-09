export interface MongoShard {
  id: number;
  name: string;
  uri: string;
  maskedUri: string;
  usedMb: number;
  capacityMb: number;
  filesCount: number;
  role: "READ_FULL" | "ACTIVE_WRITE" | "STANDBY_READ";
  addedAt: string;
}

export interface MediaFileItem {
  fileUniqueId: string;
  fileName: string;
  fileSizeMb: number;
  quality: string;
  languages: string[];
  season?: number;
  episode?: number;
  shardId: number;
  masterMsgId: number;
  backupMsgId: number;
  rawIngestedCaption: string;
  sanitizedCaption: string;
}

export interface TmdbMediaEntry {
  id: string;
  title: string;
  category: "Movie" | "Web Series" | "Anime";
  releaseDate: string;
  rating: number;
  genres: string[];
  posterUrl: string;
  overview: string;
  availableLanguages: string[];
  seasons?: number[];
  files: MediaFileItem[];
}

export interface BotUserRecord {
  userId: number;
  name: string;
  username: string;
  role: "OWNER" | "PREMIUM" | "FREE";
  premiumDaysRemaining: number;
  premiumUntil: string | null;
  cloneLimit: number | "UNLIMITED";
  isBanned: boolean;
  banReason?: string;
  timePassExpiresAt: number | null; // epoch ms
}

export interface ClonedBotInstance {
  id: string;
  botName: string;
  botUsername: string;
  ownerName: string;
  ownerUsername: string;
  ownerId: number;
  maskedToken: string;
  createdAt: string;
  usersCount: number;
  filesServed: number;
  status: "ONLINE" | "PAUSED" | "BANNED_OWNER";
}

export interface ShortenerProvider {
  id: string;
  domain: string;
  dashboardApiUrl: string;
  apiKeyMasked: string;
  clicksHandled: number;
  isActive: boolean;
}

export interface RotationalPicConfig {
  start: string[];
  absent: string[];
  settings: string[];
}

export interface PollOptionVote {
  label: string;
  votes: number;
}

export interface WeeklyPollRecord {
  id: string;
  sundayDate: string;
  question: string;
  options: PollOptionVote[];
  totalVotes: number;
  pinnedGroupsCount: number;
  forwardedToMasterLock: boolean;
  masterLockMsgId: number;
}

export const GENERATED_ASSETS = {
  kalkiPoster: "/src/assets/images/poster_kalki_scifi_1794214809051.jpg",
  animePoster: "/src/assets/images/poster_cyber_anime_1794214809741.jpg",
  thrillerPoster: "/src/assets/images/poster_thriller_series_1794214811554.jpg",
  startBanner: "/src/assets/images/banner_bot_start_1794214811174.jpg",
};

export const SUPPORTED_LANGUAGES = [
  "Hindi",
  "Tamil",
  "Telugu",
  "Malayalam",
  "Bengali",
  "Marathi",
  "English",
  "Japanese",
];

export const CONVERSATIONAL_FILLER_WORDS = new Set([
  "hi",
  "hello",
  "hey",
  "start",
  "help",
  "ok",
  "okay",
  "thanks",
  "thank you",
  "bro",
  "please",
  "good morning",
  "good night",
  "bot",
  "test",
]);

export function sanitizeCaptionText(raw: string, brandHandle: string, customWatermark: string): string {
  const withoutUrls = raw.replace(/https?:\/\/\S+|www\.\S+|t\.me\/\S+/gi, "");
  const withoutHandles = withoutUrls.replace(/@[A-Za-z0-9_]{3,}/g, "");
  const withoutPromos = withoutHandles.replace(/\[[^\]]*(?:join|channel|telegram|link)[^\]]*\]/gi, "");
  const normalized = withoutPromos
    .replace(/[_.]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `${normalized} · Archive: ${brandHandle} · Watermark: ${customWatermark}`;
}

export const INITIAL_SHARDS: MongoShard[] = [
  {
    id: 1,
    name: "Primary Cluster ap-south-1a",
    uri: "mongodb+srv://admin:secret@cluster0.m1a.mongodb.net/cinepulse_shard_01",
    maskedUri: "mongodb+srv://admin:****@cluster0.m1a.mongodb.net/cinepulse_shard_01",
    usedMb: 486.4,
    capacityMb: 512.0,
    filesCount: 48210,
    role: "READ_FULL",
    addedAt: "2026-08-14",
  },
  {
    id: 2,
    name: "Secondary Cluster ap-south-1b",
    uri: "mongodb+srv://admin:secret@cluster1.m1b.mongodb.net/cinepulse_shard_02",
    maskedUri: "mongodb+srv://admin:****@cluster1.m1b.mongodb.net/cinepulse_shard_02",
    usedMb: 214.8,
    capacityMb: 512.0,
    filesCount: 21390,
    role: "ACTIVE_WRITE",
    addedAt: "2026-09-29",
  },
  {
    id: 3,
    name: "Overflow Standby Cluster eu-west-1",
    uri: "mongodb+srv://admin:secret@cluster2.euw.mongodb.net/cinepulse_shard_03",
    maskedUri: "mongodb+srv://admin:****@cluster2.euw.mongodb.net/cinepulse_shard_03",
    usedMb: 18.2,
    capacityMb: 512.0,
    filesCount: 1640,
    role: "STANDBY_READ",
    addedAt: "2026-10-30",
  },
];

export const INITIAL_CATALOG: TmdbMediaEntry[] = [
  {
    id: "tmdb-kalki-2898",
    title: "Kalki 2898 AD",
    category: "Movie",
    releaseDate: "2024-06-27",
    rating: 8.1,
    genres: ["Sci-Fi", "Action", "Mythological Epic"],
    posterUrl: GENERATED_ASSETS.kalkiPoster,
    overview:
      "Set in a post-apocalyptic desert world around the desert city of Kasi and the hovering Complex citadel, a modern avatar of Vishnu descends to protect humanity from dystopian forces.",
    availableLanguages: ["Telugu", "Hindi", "Tamil", "Malayalam", "English"],
    files: [
      {
        fileUniqueId: "doc_kalki_4k_multi",
        fileName: "Kalki.2898.AD.2024.2160p.IMAX.WEB-DL.TrueHD.Multi.mkv",
        fileSizeMb: 3840,
        quality: "2160p 4K IMAX",
        languages: ["Telugu", "Hindi", "Tamil", "Malayalam", "English"],
        shardId: 1,
        masterMsgId: 10421,
        backupMsgId: 88210,
        rawIngestedCaption:
          "Kalki.2898.AD.2024.2160p.IMAX.WEB-DL [Join @PirateHubHD] https://t.me/fastlinks_xyz Uploaded by @MovieBoss99",
        sanitizedCaption:
          "Kalki 2898 AD 2024 2160p IMAX WEB-DL · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_kalki_1080p_hin_tel",
        fileName: "Kalki.2898.AD.2024.1080p.DDP5.1.Hindi.Telugu.mkv",
        fileSizeMb: 1920,
        quality: "1080p WEB-DL",
        languages: ["Hindi", "Telugu"],
        shardId: 1,
        masterMsgId: 10422,
        backupMsgId: 88211,
        rawIngestedCaption: "Kalki_2898_AD_1080p_Hindi_Telugu @HDripKing www.spamtracker.io/dl",
        sanitizedCaption:
          "Kalki 2898 AD 1080p Hindi Telugu · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_kalki_720p_tam_mal",
        fileName: "Kalki.2898.AD.2024.720p.HEVC.Tamil.Malayalam.mkv",
        fileSizeMb: 940,
        quality: "720p HEVC",
        languages: ["Tamil", "Malayalam"],
        shardId: 2,
        masterMsgId: 10423,
        backupMsgId: 88212,
        rawIngestedCaption: "Kalki 2898 AD 720p Tamil Malayalam [Join Channel @SouthLinks]",
        sanitizedCaption:
          "Kalki 2898 AD 720p Tamil Malayalam · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
    ],
  },
  {
    id: "tmdb-mirzapur-series",
    title: "Mirzapur",
    category: "Web Series",
    releaseDate: "2024-07-05",
    rating: 8.5,
    genres: ["Crime", "Thriller", "Action Drama"],
    posterUrl: GENERATED_ASSETS.thrillerPoster,
    overview:
      "A shocking incident at a wedding procession ignites a relentless succession war across the lawless badlands of Purvanchal, intertwining politics, family loyalty, and vengeance.",
    availableLanguages: ["Hindi", "Tamil", "Telugu", "English"],
    seasons: [1, 2, 3],
    files: [
      {
        fileUniqueId: "doc_mirzapur_s03e01",
        fileName: "Mirzapur.S03E01.Tetua.1080p.AMZN.WEB-DL.Hindi.Tamil.Telugu.mkv",
        fileSizeMb: 820,
        quality: "1080p WEB-DL",
        languages: ["Hindi", "Tamil", "Telugu"],
        season: 3,
        episode: 1,
        shardId: 2,
        masterMsgId: 10901,
        backupMsgId: 88690,
        rawIngestedCaption: "Mirzapur.S03E01.1080p.Hindi.Tamil.Telugu @WebSeriesAdda https://t.me/mirza_leaks",
        sanitizedCaption:
          "Mirzapur S03E01 1080p Hindi Tamil Telugu · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_mirzapur_s03e02",
        fileName: "Mirzapur.S03E02.1080p.AMZN.WEB-DL.Hindi.Tamil.Telugu.mkv",
        fileSizeMb: 795,
        quality: "1080p WEB-DL",
        languages: ["Hindi", "Tamil", "Telugu"],
        season: 3,
        episode: 2,
        shardId: 2,
        masterMsgId: 10902,
        backupMsgId: 88691,
        rawIngestedCaption: "Mirzapur.S03E02.1080p.Hindi.Tamil.Telugu @WebSeriesAdda",
        sanitizedCaption:
          "Mirzapur S03E02 1080p Hindi Tamil Telugu · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_mirzapur_s02e01",
        fileName: "Mirzapur.S02E01.1080p.WEB-DL.Hindi.English.mkv",
        fileSizeMb: 740,
        quality: "1080p WEB-DL",
        languages: ["Hindi", "English"],
        season: 2,
        episode: 1,
        shardId: 1,
        masterMsgId: 10903,
        backupMsgId: 88692,
        rawIngestedCaption: "Mirzapur.S02E01.1080p.Hindi.English [Joined @DesiSeries]",
        sanitizedCaption:
          "Mirzapur S02E01 1080p Hindi English · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_mirzapur_s01e01",
        fileName: "Mirzapur.S01E01.Jhandu.1080p.WEB-DL.Hindi.mkv",
        fileSizeMb: 690,
        quality: "1080p WEB-DL",
        languages: ["Hindi"],
        season: 1,
        episode: 1,
        shardId: 1,
        masterMsgId: 10904,
        backupMsgId: 88693,
        rawIngestedCaption: "Mirzapur.S01E01.1080p.Hindi https://t.me/old_archive",
        sanitizedCaption:
          "Mirzapur S01E01 1080p Hindi · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
    ],
  },
  {
    id: "tmdb-solo-leveling-anime",
    title: "Solo Leveling: Arise from the Shadow",
    category: "Anime",
    releaseDate: "2025-01-05",
    rating: 8.8,
    genres: ["Anime", "Dark Fantasy", "Action"],
    posterUrl: GENERATED_ASSETS.animePoster,
    overview:
      "In a world where hunters awaken supernatural powers to clear interdimensional dungeons, E-rank hunter Sung Jinwoo unlocks a mysterious leveling program that only he can see.",
    availableLanguages: ["Japanese", "English", "Hindi", "Tamil", "Telugu"],
    seasons: [1, 2],
    files: [
      {
        fileUniqueId: "doc_solo_s02e01",
        fileName: "Solo.Leveling.S02E01.1080p.CR.WEB-DL.Multi.Audio.Hindi.Tamil.Telugu.Eng.Jap.mkv",
        fileSizeMb: 540,
        quality: "1080p BluRay REMUX",
        languages: ["Japanese", "English", "Hindi", "Tamil", "Telugu"],
        season: 2,
        episode: 1,
        shardId: 2,
        masterMsgId: 11201,
        backupMsgId: 89101,
        rawIngestedCaption: "Solo_Leveling_S02E01_Multi_Hindi_Tamil_Jap @AnimeIndiaOfficial https://t.me/anime_india",
        sanitizedCaption:
          "Solo Leveling S02E01 Multi Hindi Tamil Jap · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_solo_s02e02",
        fileName: "Solo.Leveling.S02E02.1080p.CR.WEB-DL.Multi.Audio.Hindi.Eng.Jap.mkv",
        fileSizeMb: 535,
        quality: "1080p WEB-DL",
        languages: ["Japanese", "English", "Hindi"],
        season: 2,
        episode: 2,
        shardId: 2,
        masterMsgId: 11202,
        backupMsgId: 89102,
        rawIngestedCaption: "Solo_Leveling_S02E02_1080p_Hindi_Eng_Jap @OtakuUploader",
        sanitizedCaption:
          "Solo Leveling S02E02 1080p Hindi Eng Jap · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_solo_s01e01",
        fileName: "Solo.Leveling.S01E01.720p.HEVC.Hindi.Japanese.mkv",
        fileSizeMb: 280,
        quality: "720p HEVC",
        languages: ["Hindi", "Japanese", "English"],
        season: 1,
        episode: 1,
        shardId: 1,
        masterMsgId: 11203,
        backupMsgId: 89103,
        rawIngestedCaption: "Solo.Leveling.S01E01.720p.Hindi.Jap [Join @AnimePlex]",
        sanitizedCaption:
          "Solo Leveling S01E01 720p Hindi Jap · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
    ],
  },
  {
    id: "tmdb-manjummel-boys",
    title: "Manjummel Boys",
    category: "Movie",
    releaseDate: "2024-02-22",
    rating: 8.4,
    genres: ["Survival", "Thriller", "Drama"],
    posterUrl: GENERATED_ASSETS.thrillerPoster,
    overview:
      "A group of friends from a small town near Kochi travel to Kodaikanal for a vacation, where one of them falls into a perilous, unexplored cavern inside the Guna Caves.",
    availableLanguages: ["Malayalam", "Tamil", "Telugu", "Hindi", "Bengali", "Marathi"],
    files: [
      {
        fileUniqueId: "doc_manjummel_1080p",
        fileName: "Manjummel.Boys.2024.1080p.DS4K.Malayalam.Tamil.Telugu.Hindi.Bengali.Marathi.mkv",
        fileSizeMb: 2150,
        quality: "1080p DS4K",
        languages: ["Malayalam", "Tamil", "Telugu", "Hindi", "Bengali", "Marathi"],
        shardId: 2,
        masterMsgId: 11540,
        backupMsgId: 89410,
        rawIngestedCaption: "Manjummel_Boys_2024_1080p_Pan_Indian_Audio @MalluCinemaHub https://t.me/kerala_rips",
        sanitizedCaption:
          "Manjummel Boys 2024 1080p Pan Indian Audio · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
      {
        fileUniqueId: "doc_manjummel_720p",
        fileName: "Manjummel.Boys.2024.720p.HEVC.Malayalam.Hindi.Bengali.Marathi.mkv",
        fileSizeMb: 890,
        quality: "720p HEVC",
        languages: ["Malayalam", "Hindi", "Bengali", "Marathi"],
        shardId: 2,
        masterMsgId: 11541,
        backupMsgId: 89411,
        rawIngestedCaption: "Manjummel Boys 720p HEVC Malayalam Hindi Bengali Marathi @RegionalArchives",
        sanitizedCaption:
          "Manjummel Boys 720p HEVC Malayalam Hindi Bengali Marathi · Archive: @CinePulseMain · Watermark: [CINEPULSE OFFICIAL]",
      },
    ],
  },
];

export const INITIAL_USERS: BotUserRecord[] = [
  {
    userId: 784920114,
    name: "Aarav Mehta (Owner)",
    username: "aarav_architect",
    role: "OWNER",
    premiumDaysRemaining: 9999,
    premiumUntil: "2099-12-31",
    cloneLimit: "UNLIMITED",
    isBanned: false,
    timePassExpiresAt: null,
  },
  {
    userId: 612094811,
    name: "Riya Sharma (Premium)",
    username: "riya_cinephile",
    role: "PREMIUM",
    premiumDaysRemaining: 28,
    premiumUntil: "2026-12-07",
    cloneLimit: 3,
    isBanned: false,
    timePassExpiresAt: null,
  },
  {
    userId: 904112388,
    name: "Vikram Nair (Free User)",
    username: "vikram_nair99",
    role: "FREE",
    premiumDaysRemaining: 0,
    premiumUntil: null,
    cloneLimit: 1,
    isBanned: false,
    timePassExpiresAt: null,
  },
  {
    userId: 503819204,
    name: "SpamBot Scraper",
    username: "leech_mirror_bot",
    role: "FREE",
    premiumDaysRemaining: 0,
    premiumUntil: null,
    cloneLimit: 1,
    isBanned: true,
    banReason: "Automated scraping & link re-broadcasting",
    timePassExpiresAt: null,
  },
];

export const INITIAL_CLONES: ClonedBotInstance[] = [
  {
    id: "clone-1",
    botName: "Riya Anime & K-Drama Filter",
    botUsername: "RiyaAnimeFilterBot",
    ownerName: "Riya Sharma",
    ownerUsername: "riya_cinephile",
    ownerId: 612094811,
    maskedToken: "7182940122:AAH9x...81kLp",
    createdAt: "2026-10-12 14:22 UTC",
    usersCount: 14820,
    filesServed: 89410,
    status: "ONLINE",
  },
  {
    id: "clone-2",
    botName: "South Indian Cinema Vault",
    botUsername: "SouthVaultAutoBot",
    ownerName: "Riya Sharma",
    ownerUsername: "riya_cinephile",
    ownerId: 612094811,
    maskedToken: "7491023811:AAFm2...90qWe",
    createdAt: "2026-10-28 09:15 UTC",
    usersCount: 9340,
    filesServed: 41250,
    status: "ONLINE",
  },
  {
    id: "clone-3",
    botName: "Vikram Malayalam Movies Bot",
    botUsername: "VikramMollywoodBot",
    ownerName: "Vikram Nair",
    ownerUsername: "vikram_nair99",
    ownerId: 904112388,
    maskedToken: "6910482190:AAE4r...12zXc",
    createdAt: "2026-11-02 18:40 UTC",
    usersCount: 3120,
    filesServed: 11890,
    status: "ONLINE",
  },
];

export const INITIAL_SHORTENERS: ShortenerProvider[] = [
  {
    id: "sh-1",
    domain: "gplinks.co",
    dashboardApiUrl: "https://gplinks.co/api",
    apiKeyMasked: "gp_live_98a7...4f12",
    clicksHandled: 42890,
    isActive: true,
  },
  {
    id: "sh-2",
    domain: "shrinkme.io",
    dashboardApiUrl: "https://shrinkme.io/api",
    apiKeyMasked: "sm_live_31c9...8e04",
    clicksHandled: 19420,
    isActive: true,
  },
];

export const INITIAL_TRENDING_SEARCHES: { query: string; count: number; language: string }[] = [
  { query: "Kalki 2898 AD Hindi", count: 1842, language: "Hindi" },
  { query: "Solo Leveling Season 2", count: 1510, language: "Japanese" },
  { query: "Mirzapur Season 3", count: 1390, language: "Hindi" },
  { query: "Manjummel Boys Malayalam", count: 1120, language: "Malayalam" },
  { query: "Pather Panchali Bengali", count: 780, language: "Bengali" },
  { query: "Sairat Marathi 1080p", count: 640, language: "Marathi" },
];
