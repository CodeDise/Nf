#!/usr/bin/env python3
"""
Nohara Filter Bot - Telegram Auto-Filter Bot
(Pyrogram v2 + Multi-MongoDB + TMDB + Gemini AI) - Render ready.

REQUIRED environment variables (set them on config.py (or Render Environment / .env as fallback)):
    API_ID, API_HASH, BOT_TOKEN, OWNER_ID, PRIMARY_MONGO_URI
OPTIONAL:
    MASTER_DB_CHANNEL, BACKUP_DB_CHANNEL, MASTER_LOG_CHANNEL, MASTER_LOCK_CHANNEL,
    SUPPORT_ID, BRAND_CHANNEL, TMDB_API_KEY, GEMINI_API_KEY, GEMINI_MODEL, DB_NAME, PORT
"""

import os
import re
import json
import random
import secrets
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple, Any
from urllib.parse import quote

# Pyrogram must share ONE event loop with the rest of the app (fixes handlers never firing).
loop = asyncio.new_event_loop()
asyncio.set_event_loop(loop)

import aiohttp
from aiohttp import web
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from google import genai
from google.genai import types as genai_types

from pyrogram import Client, filters, idle
from pyrogram.errors import FloodWait, MessageNotModified
from pyrogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    InlineQuery,
    InlineQueryResultArticle,
    InputTextMessageContent,
)

load_dotenv()

# Values are read from config.py (same folder) first; Render/.env variables are only a fallback.
try:
    import config as _cfg
except ImportError:
    _cfg = None


def _get(name: str, default: str = "") -> str:
    val = getattr(_cfg, name, "") if _cfg else ""
    val = str(val).strip() if val is not None else ""
    if val:
        return val
    return os.getenv(name, default)


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("NoharaFilterBot")

# =====================================================================
# 0. ENVIRONMENT & GLOBAL CONFIGURATION
# =====================================================================
BOT_NAME = "Nohara Filter Bot"


def _required(name: str) -> str:
    value = _get(name, "").strip()
    if not value:
        raise SystemExit(
            f"\n❌ Missing environment variable: {name}\n"
            f"   Open config.py and fill in {name}\n"
        )
    return value


def _optional_int(name: str) -> int:
    raw = _get(name, "").strip()
    try:
        return int(raw) if raw else 0
    except ValueError:
        raise SystemExit(f"❌ {name} must be a number like -1001234567890")


API_ID = int(_required("API_ID"))          # from https://my.telegram.org
API_HASH = _required("API_HASH")           # from https://my.telegram.org
BOT_TOKEN = _required("BOT_TOKEN")         # from @BotFather
OWNER_ID = int(_required("OWNER_ID"))      # your Telegram numeric user id
PRIMARY_MONGO_URI = _required("PRIMARY_MONGO_URI")

MASTER_DB_CHANNEL = _optional_int("MASTER_DB_CHANNEL")
BACKUP_DB_CHANNEL = _optional_int("BACKUP_DB_CHANNEL")
MASTER_LOG_CHANNEL = _optional_int("MASTER_LOG_CHANNEL")
MASTER_LOCK_CHANNEL = _optional_int("MASTER_LOCK_CHANNEL")

SUPPORT_ID = _get("SUPPORT_ID", "NoharaSupport").lstrip("@")
BRAND_CHANNEL = _get("BRAND_CHANNEL", "@NoharaFilterBot")
DB_NAME = _get("DB_NAME", "nohara_filter")
TMDB_API_KEY = _get("TMDB_API_KEY", "")
GEMINI_API_KEY = _get("GEMINI_API_KEY", "")
GEMINI_MODEL = _get("GEMINI_MODEL", "gemini-2.5-flash")
PORT = int(_get("PORT", "8080"))

MAX_BATCH = 10
MASTER_USERNAME = ""
CLONES: Dict[int, Any] = {}  # running clone clients (bot_id -> Client)

LANGUAGE_MAP: Dict[str, str] = {
    "hin": "Hindi", "hindi": "Hindi",
    "tam": "Tamil", "tamil": "Tamil",
    "tel": "Telugu", "telugu": "Telugu",
    "mal": "Malayalam", "malayalam": "Malayalam",
    "ben": "Bengali", "bengali": "Bengali",
    "mar": "Marathi", "marathi": "Marathi",
    "kan": "Kannada", "kannada": "Kannada",
    "guj": "Gujarati", "gujarati": "Gujarati",
    "pun": "Punjabi", "punjabi": "Punjabi",
    "eng": "English", "english": "English",
    "jap": "Japanese", "japanese": "Japanese",
    "dual": "Dual Audio", "multi": "Multi Audio",
}

CONVERSATIONAL_FILLER = {
    "hi", "hello", "hey", "start", "help", "ok", "okay", "thanks",
    "thank you", "bro", "please", "send", "movie", "series", "anime",
    "good morning", "good night", "admin", "owner", "bot", "test",
}


def _never(*_):
    return False


NEVER = filters.create(_never)
DB_CHANNEL_FILTER = filters.chat(MASTER_DB_CHANNEL) if MASTER_DB_CHANNEL else NEVER


# =====================================================================
# 1. DYNAMIC MULTI-MONGODB SHARD MANAGER
# =====================================================================
def _db_of(client: AsyncIOMotorClient):
    """Works even when the Mongo URI has no database name in it."""
    try:
        return client.get_default_database()
    except Exception:
        return client[DB_NAME]


class MultiMongoManager:
    def __init__(self, primary_uri: str, max_shard_mb: float = 480.0):
        self.uris: List[str] = [primary_uri]
        self.clients: Dict[str, AsyncIOMotorClient] = {}
        self.max_shard_mb = max_shard_mb
        self.active_index = 0

    def _client(self, uri: str, **kw) -> AsyncIOMotorClient:
        return AsyncIOMotorClient(uri, tz_aware=True, **kw)

    async def initialize(self):
        for uri in self.uris:
            self.clients[uri] = self._client(uri)
        ctrl = self.get_control_db()
        cfg = await ctrl.config.find_one({"_id": "mongo_shards"})
        if cfg and "uris" in cfg:
            for extra_uri in cfg["uris"]:
                if extra_uri not in self.uris:
                    self.uris.append(extra_uri)
                    self.clients[extra_uri] = self._client(extra_uri)
        # Indexes (best effort)
        try:
            await ctrl.verify_tokens.create_index("created_at", expireAfterSeconds=3600)
            await ctrl.users.create_index("user_id", unique=True)
            await ctrl.clone_users.create_index([("bot_id", 1), ("user_id", 1)], unique=True)
            for uri in self.uris:
                db = _db_of(self.clients[uri])
                await db.media_files.create_index("file_unique_id")
                await db.media_files.create_index("created_at")
        except Exception as exc:
            logger.warning(f"Index creation warning: {exc}")

    def get_control_db(self):
        return _db_of(self.clients[self.uris[0]])

    async def register_uri(self, new_uri: str) -> Tuple[bool, str]:
        if new_uri in self.uris:
            return False, "URI is already registered in the shard ring."
        try:
            client = self._client(new_uri, serverSelectionTimeoutMS=5000)
            await client.admin.command("ping")
            self.uris.append(new_uri)
            self.clients[new_uri] = client
            await self.get_control_db().config.update_one(
                {"_id": "mongo_shards"}, {"$set": {"uris": self.uris[1:]}}, upsert=True
            )
            return True, f"Shard #{len(self.uris)} verified and added to sequential pool."
        except Exception as exc:
            return False, f"Connection failed: {exc}"

    async def get_status_report(self) -> List[Dict[str, Any]]:
        report = []
        for idx, uri in enumerate(self.uris):
            try:
                db = _db_of(self.clients[uri])
                stats = await db.command("dbStats")
                used_mb = round((stats.get("dataSize", 0) + stats.get("indexSize", 0)) / (1024 * 1024), 2)
                files_count = await db.media_files.count_documents({})
                masked = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", uri)
                report.append({
                    "shard_id": idx + 1, "masked_uri": masked, "used_mb": used_mb,
                    "capacity_mb": 512.0, "files_count": files_count,
                    "status": "ACTIVE_WRITE" if idx == self.active_index else (
                        "FULL" if used_mb >= self.max_shard_mb else "STANDBY_READ"),
                })
            except Exception as exc:
                report.append({
                    "shard_id": idx + 1, "masked_uri": "unverified-uri", "used_mb": 0.0,
                    "capacity_mb": 512.0, "files_count": 0, "status": f"ERROR: {exc}",
                })
        return report

    async def get_active_write_db(self):
        for idx, uri in enumerate(self.uris):
            db = _db_of(self.clients[uri])
            try:
                stats = await db.command("dbStats")
                used_mb = (stats.get("dataSize", 0) + stats.get("indexSize", 0)) / (1024 * 1024)
                if used_mb < self.max_shard_mb:
                    self.active_index = idx
                    return db
            except Exception:
                continue
        self.active_index = len(self.uris) - 1
        return _db_of(self.clients[self.uris[-1]])

    async def search_across_all_shards(self, query_text: str, language: Optional[str] = None) -> List[Dict[str, Any]]:
        tokens = [re.escape(t) for t in query_text.strip().split() if t]
        if not tokens:
            return []
        pattern = ".*".join(tokens)
        mongo_filter: Dict[str, Any] = {"clean_title": {"$regex": pattern, "$options": "i"}}
        if language and language.lower() != "all":
            mongo_filter["languages"] = {"$in": [language]}

        async def _query_shard(uri: str):
            db = _db_of(self.clients[uri])
            return await db.media_files.find(mongo_filter).sort("created_at", -1).limit(60).to_list(length=60)

        nested = await asyncio.gather(*[_query_shard(u) for u in self.uris], return_exceptions=True)
        merged: Dict[str, Dict[str, Any]] = {}
        for batch in nested:
            if isinstance(batch, list):
                for doc in batch:
                    merged.setdefault(doc["file_unique_id"], doc)
        out = sorted(merged.values(), key=lambda d: d.get("created_at") or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
        return out[:60]

    async def find_file(self, file_unique_id: str) -> Optional[Dict[str, Any]]:
        for uri in self.uris:
            doc = await _db_of(self.clients[uri]).media_files.find_one({"file_unique_id": file_unique_id})
            if doc:
                return doc
        return None


# =====================================================================
# 2. TEXT SANITIZER, LANGUAGE DETECTOR & TMDB ENRICHMENT
# =====================================================================
def sanitize_media_caption(raw_text: str, brand_channel: str = BRAND_CHANNEL) -> str:
    if not raw_text:
        return f"🎬 Powered by {brand_channel}"
    cleaned = re.sub(r"https?://\S+|www\.\S+|t\.me/\S+", "", raw_text, flags=re.IGNORECASE)
    cleaned = re.sub(r"@[A-Za-z0-9_]{3,}", "", cleaned)
    cleaned = re.sub(r"\[[^\]]*(?:join|channel|t\.me|telegram)[^\]]*\]", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[_\.\*`]+", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return f"🎬 **{cleaned}**\n━━━━━━━━━━━━━━━━━━━━\n🏷 **Official Archive:** {brand_channel}"


def extract_languages_and_meta(text: str) -> Dict[str, Any]:
    lower = text.lower()
    detected_langs: List[str] = []
    for token, lang_name in LANGUAGE_MAP.items():
        if re.search(rf"\b{re.escape(token)}\b", lower) and lang_name not in detected_langs:
            detected_langs.append(lang_name)
    if not detected_langs:
        detected_langs.append("English")

    season_match = re.search(r"\bS(\d{1,2})\b|\bSeason\s*(\d{1,2})\b", text, re.IGNORECASE)
    ep_match = re.search(r"\bE(\d{1,3})\b|\bEp(?:isode)?\s*(\d{1,3})\b", text, re.IGNORECASE)
    # also handles S01E02 written together
    combo = re.search(r"\bS(\d{1,2})E(\d{1,3})\b", text, re.IGNORECASE)
    quality_match = re.search(r"\b(2160p|4K|1080p|720p|480p|HDRip|WEB-DL|BluRay)\b", text, re.IGNORECASE)

    season = episode = None
    if combo:
        season, episode = int(combo.group(1)), int(combo.group(2))
    else:
        if season_match:
            season = int(season_match.group(1) or season_match.group(2))
        if ep_match:
            episode = int(ep_match.group(1) or ep_match.group(2))
    return {
        "languages": detected_langs,
        "season": season,
        "episode": episode,
        "quality": quality_match.group(1) if quality_match else "1080p WEB-DL",
        "is_series": season is not None or episode is not None,
    }


async def fetch_tmdb_metadata(query: str) -> Optional[Dict[str, Any]]:
    if not TMDB_API_KEY:
        return None
    clean_q = re.sub(r"\b(hindi|tamil|telugu|malayalam|bengali|marathi|english|1080p|720p|480p|s\d+|e\d+)\b", "", query, flags=re.IGNORECASE).strip()
    params = {"api_key": TMDB_API_KEY, "query": clean_q or query, "include_adult": "false"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get("https://api.themoviedb.org/3/search/multi", params=params,
                                   timeout=aiohttp.ClientTimeout(total=6)) as resp:
                if resp.status != 200:
                    return None
                results = (await resp.json()).get("results", [])
                if not results:
                    return None
                top = results[0]
                poster_path = top.get("poster_path")
                overview = top.get("overview") or "No synopsis available."
                return {
                    "title": top.get("title") or top.get("name") or query,
                    "release_date": top.get("release_date") or top.get("first_air_date") or "Unknown",
                    "poster_url": f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None,
                    "rating": round(float(top.get("vote_average") or 0.0), 1),
                    "media_type": (top.get("media_type") or "movie").upper(),
                    "overview": overview[:240] + ("..." if len(overview) > 240 else ""),
                }
    except Exception as exc:
        logger.warning(f"TMDB lookup error: {exc}")
        return None


# =====================================================================
# 3. GEMINI AI SPELLING CORRECTION (PREMIUM)
# =====================================================================
async def gemini_correct_query(raw_query: str) -> Tuple[str, Optional[str]]:
    if not GEMINI_API_KEY:
        return raw_query, None

    def _sync_call():
        client = genai.Client(api_key=GEMINI_API_KEY)
        prompt = (
            "You are a movie, web series, and anime search query spell-checker for an Indian & global "
            "Telegram Auto-Filter Bot. Correct any spelling mistakes in the title, strip conversational words, "
            "and identify if the user explicitly asked for an audio language (Hindi, Tamil, Telugu, Malayalam, "
            "Bengali, Marathi, Kannada, English, Japanese). Return ONLY JSON with keys 'corrected_title' and 'language' (or null).\n"
            f"User Query: {raw_query}"
        )
        response = client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=genai_types.GenerateContentConfig(response_mime_type="application/json"),
        )
        return response.text

    try:
        parsed = json.loads(await asyncio.to_thread(_sync_call))
        if isinstance(parsed, list) and parsed:
            parsed = parsed[0]
        return (parsed.get("corrected_title") or raw_query), parsed.get("language")
    except Exception as exc:
        logger.warning(f"Gemini spellcheck fallback: {exc}")
        return raw_query, None


# =====================================================================
# 4. LINK SHORTENER & EXCLUSIVE ACCESS MODES
# =====================================================================
async def shorten_url(domain: str, api_key: str, destination_url: str) -> str:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"https://{domain}/api", params={"api": api_key, "url": destination_url},
                                   timeout=aiohttp.ClientTimeout(total=6)) as resp:
                data = await resp.json(content_type=None)
                if data.get("status") == "success" and data.get("shortenedUrl"):
                    return data["shortenedUrl"]
    except Exception as exc:
        logger.warning(f"Shortener API fallback for {domain}: {exc}")
    return destination_url


async def resolve_download_gate(db, user_id: int, target: str, bot_username: str) -> Tuple[bool, Optional[str], str]:
    settings = await db.config.find_one({"_id": "bot_settings"}) or {}
    access_mode = settings.get("access_mode", "TIME_PASS")
    shorteners = settings.get("shorteners", [])
    if not shorteners:
        return True, None, access_mode

    now = datetime.now(timezone.utc)
    if access_mode == "TIME_PASS":
        user_doc = await db.users.find_one({"user_id": user_id}) or {}
        expiry = user_doc.get("time_pass_until")
        if expiry:
            if expiry.tzinfo is None:
                expiry = expiry.replace(tzinfo=timezone.utc)
            if expiry > now:
                return True, None, access_mode

    verify_token = secrets.token_urlsafe(12)
    await db.verify_tokens.insert_one({
        "token": verify_token, "user_id": user_id, "target": target,
        "mode": access_mode, "created_at": now,
    })
    deep_link = f"https://t.me/{bot_username}?start=verify_{verify_token}"
    short = shorteners[0]
    return False, await shorten_url(short["domain"], short["api_key"], deep_link), access_mode


# =====================================================================
# 5. PYROGRAM BOT & HELPERS
# =====================================================================
mongo_manager = MultiMongoManager(PRIMARY_MONGO_URI)
app = Client(
    "NoharaFilterBot",
    api_id=API_ID,
    api_hash=API_HASH,
    bot_token=BOT_TOKEN,
    in_memory=True,
)

SESSIONS: Dict[str, Dict[str, Any]] = {}  # short-lived search sessions (button callbacks)


async def is_user_banned(user_id: int) -> bool:
    return bool(await mongo_manager.get_control_db().bans.find_one({"user_id": user_id}))


async def is_user_premium(user_id: int) -> Tuple[bool, Optional[datetime]]:
    user = await mongo_manager.get_control_db().users.find_one({"user_id": user_id})
    if not user or not user.get("premium_until"):
        return False, None
    expiry: datetime = user["premium_until"]
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return (True, expiry) if expiry > datetime.now(timezone.utc) else (False, None)


async def get_rotated_pic(category: str) -> Optional[str]:
    cfg = await mongo_manager.get_control_db().config.find_one({"_id": "rotational_pics"}) or {}
    pics = cfg.get(category, [])
    return random.choice(pics) if pics else None


async def get_settings() -> Dict[str, Any]:
    return await mongo_manager.get_control_db().config.find_one({"_id": "bot_settings"}) or {}


async def set_setting(key: str, value: Any):
    await mongo_manager.get_control_db().config.update_one({"_id": "bot_settings"}, {"$set": {key: value}}, upsert=True)


async def safe_reply(message: Message, text: str, photo: Optional[str] = None, kb: Optional[InlineKeyboardMarkup] = None):
    if photo:
        try:
            return await message.reply_photo(photo=photo, caption=text, reply_markup=kb)
        except Exception as exc:
            logger.warning(f"Photo reply failed, falling back to text: {exc}")
    return await message.reply_text(text, reply_markup=kb)


async def reply_long(message: Message, text: str):
    chunk = ""
    for line in text.split("\n"):
        if len(chunk) + len(line) + 1 > 3800:
            await message.reply_text(chunk)
            chunk = ""
        chunk += line + "\n"
    if chunk.strip():
        await message.reply_text(chunk)


async def track_user(client: Client, user_id: int):
    """Counts unique users per bot (master or clone) for /clone_status."""
    if not user_id:
        return
    try:
        await mongo_manager.get_control_db().clone_users.update_one(
            {"bot_id": client.me.id, "user_id": user_id},
            {"$set": {"last_seen": datetime.now(timezone.utc)}}, upsert=True)
    except Exception as exc:
        logger.warning(f"track_user: {exc}")


async def edit_msg(message: Message, text: str, kb: Optional[InlineKeyboardMarkup] = None):
    try:
        if message.photo:
            await message.edit_caption(text, reply_markup=kb)
        else:
            await message.edit_text(text, reply_markup=kb)
    except MessageNotModified:
        pass


def make_session(title: str, files: List[Dict[str, Any]]) -> str:
    token = secrets.token_hex(4)
    if len(SESSIONS) > 500:
        SESSIONS.pop(next(iter(SESSIONS)))
    keep = ("file_unique_id", "file_size", "languages", "season", "episode", "quality")
    SESSIONS[token] = {"title": title, "files": [{k: f.get(k) for k in keep} for f in files]}
    return token


def filter_files(files: List[Dict[str, Any]], filt: Optional[str]) -> List[Dict[str, Any]]:
    if not filt or filt == "-":
        return files
    kind, num = filt[0], int(filt[1:])
    key = "season" if kind == "s" else "episode"
    return [f for f in files if f.get(key) == num]


def build_results_keyboard(token: str, files: List[Dict[str, Any]], filt: Optional[str] = None) -> InlineKeyboardMarkup:
    avail_langs = sorted({lang for f in files for lang in (f.get("languages") or ["English"])})
    rows: List[List[InlineKeyboardButton]] = [[
        InlineKeyboardButton(f"📦 Send All ({min(len(files), MAX_BATCH)})", callback_data=f"sendall:{token}:{filt or '-'}"),
        InlineKeyboardButton(f"🌐 {', '.join(avail_langs[:3])}"[:60], callback_data="noop"),
    ]]
    if not filt:
        seasons = sorted({f["season"] for f in files if f.get("season") is not None})
        episodes = sorted({f["episode"] for f in files if f.get("episode") is not None})
        if seasons:
            rows.append([InlineKeyboardButton(f"📺 S{s:02d}", callback_data=f"flt:{token}:s{s}") for s in seasons[:5]])
        if episodes:
            rows.append([InlineKeyboardButton(f"🎞 E{e:02d}", callback_data=f"flt:{token}:e{e}") for e in episodes[:5]])
    else:
        rows.append([InlineKeyboardButton("⬅️ Back", callback_data=f"flt:{token}:-")])

    for f in files[:8]:
        size_mb = round((f.get("file_size") or 0) / (1024 * 1024), 1)
        langs_short = "/".join(l[:3].upper() for l in (f.get("languages") or ["ENG"])[:2])
        se_tag = f"S{f['season']:02d}E{f['episode']:02d} " if f.get("season") and f.get("episode") else ""
        label = f"📁 [{langs_short}] {se_tag}{f.get('quality') or '1080p'} ({size_mb} MB)"
        rows.append([InlineKeyboardButton(label, callback_data=f"file:{f['file_unique_id']}")])
    return InlineKeyboardMarkup(rows)


async def dispatch_watermarked_document(client: Client, chat_id: int, target_ref: str):
    settings = await get_settings()
    watermark = settings.get("brand_watermark", BRAND_CHANNEL)
    logo_tag = settings.get("brand_logo", f"🏛 [{BOT_NAME.upper()}]")
    doc = await mongo_manager.find_file(target_ref)
    if not doc:
        await client.send_message(chat_id, "⚠️ File not found in the archive anymore.")
        return
    caption = (
        f"{logo_tag}\n{doc.get('sanitized_caption', '')}\n"
        f"🗣 **Audio:** `{', '.join(doc.get('languages', ['English']))}`\n"
        f"🔖 **Watermark:** `{watermark}`"
    )
    for _ in range(2):
        try:
            await client.send_document(chat_id=chat_id, document=doc["file_id"], caption=caption, force_document=True)
            await mongo_manager.get_control_db().clones.update_one({"bot_id": client.me.id}, {"$inc": {"files_served": 1}})
            return
        except FloodWait as fw:
            await asyncio.sleep(fw.value + 1)
        except Exception as exc:
            logger.warning(f"send_document failed: {exc}")
            await client.send_message(chat_id, "⚠️ Could not send this file. Please try another one.")
            return


async def dispatch_target(client: Client, chat_id: int, target: str):
    if target.startswith("batch:"):
        for uid in target[6:].split(",")[:MAX_BATCH]:
            await dispatch_watermarked_document(client, chat_id, uid)
            await asyncio.sleep(0.6)
    else:
        await dispatch_watermarked_document(client, chat_id, target)


async def deliver(client: Client, chat_id: int, user_id: int, target: str):
    db = mongo_manager.get_control_db()
    allowed, short_url, mode = await resolve_download_gate(db, user_id, target, client.me.username)
    if allowed:
        await dispatch_target(client, chat_id, target)
        return
    hint = "1 hour pass" if mode == "TIME_PASS" else "this post"
    kb = InlineKeyboardMarkup([[InlineKeyboardButton("🔓 Verify & Download", url=short_url)]])
    await client.send_message(chat_id, f"🔐 Complete the quick verification to unlock {hint}:", reply_markup=kb)


# ---------------------------------------------------------------------
# START / VERIFY / FILE DEEP-LINK
# ---------------------------------------------------------------------
@app.on_message(filters.command("start") & filters.private)
async def start_command(client: Client, message: Message):
    user_id = message.from_user.id
    if await is_user_banned(user_id):
        await message.reply_text("🚫 **Access Denied:** Your account is restricted.")
        return

    db = mongo_manager.get_control_db()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"name": message.from_user.first_name, "username": message.from_user.username,
                  "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    await track_user(client, user_id)
    if len(message.command) > 1:
        payload = message.command[1]
        if payload.startswith("verify_"):
            token = payload.replace("verify_", "", 1)
            tok_doc = await db.verify_tokens.find_one_and_delete({"token": token, "user_id": user_id})
            if not tok_doc:
                await message.reply_text("⚠️ Verification token expired or invalid.")
                return
            if tok_doc["mode"] == "TIME_PASS":
                hours = int((await get_settings()).get("pass_duration_hours", 1))
                until = datetime.now(timezone.utc) + timedelta(hours=hours)
                await db.users.update_one({"user_id": user_id}, {"$set": {"time_pass_until": until}})
                await message.reply_text(f"✅ **Time-Based Pass Activated!** Unrestricted downloads for **{hours} hour(s)**.")
            else:
                await message.reply_text("✅ **Link Verified!** Sending your file(s) now...")
            await dispatch_target(client, message.chat.id, tok_doc["target"])
            return
        if payload.startswith("file_"):
            await deliver(client, message.chat.id, user_id, payload.replace("file_", "", 1))
            return

    is_prem, expiry = await is_user_premium(user_id)
    tier_label = f"💎 Premium Active (Until {expiry.strftime('%d %b %Y')})" if is_prem else "Standard Tier (No AI Spellcheck)"
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton("🔥 Top Search", callback_data="menu_top_search"),
            InlineKeyboardButton("🔎 Inline Search", switch_inline_query_current_chat=""),
        ],
        [
            InlineKeyboardButton("🤖 Clone My Own Bot", callback_data="menu_clone_bot"),
            InlineKeyboardButton("🛠 Support Desk", url=f"https://t.me/{SUPPORT_ID}"),
        ],
    ])
    caption = (
        f"👋 **Welcome to {BOT_NAME}, {message.from_user.first_name}!**\n\n"
        f"• **Account Tier:** `{tier_label}`\n"
        f"• **Languages:** Hindi · Tamil · Telugu · Malayalam · Bengali · Marathi · Kannada · Gujarati · Punjabi · English · Japanese\n\n"
        f"Send any Movie, Web Series, or Anime title below to search instantly."
    )
    await safe_reply(message, caption, await get_rotated_pic("start"), kb)


# ---------------------------------------------------------------------
# ADMIN COMMANDS
# ---------------------------------------------------------------------
@app.on_message(filters.command("set_db") & filters.user(OWNER_ID))
async def set_db_command(client: Client, message: Message):
    if len(message.command) < 2:
        await message.reply_text("Usage: `/set_db mongodb+srv://user:pass@cluster.mongodb.net/shard_name`")
        return
    ok, msg = await mongo_manager.register_uri(message.command[1].strip())
    await message.reply_text(f"{'✅' if ok else '❌'} **Multi-MongoDB Registry:**\n{msg}")


async def db_status_text() -> str:
    lines = ["🗄 **Multi-MongoDB Live Storage Telemetry**\n"]
    for s in await mongo_manager.get_status_report():
        pct = round((s["used_mb"] / s["capacity_mb"]) * 100, 1)
        lines.append(
            f"**Shard #{s['shard_id']}** (`{s['status']}`)\n"
            f"├ URI: `{s['masked_uri']}`\n"
            f"├ Storage: `{s['used_mb']} MB / {s['capacity_mb']} MB ({pct}%)`\n"
            f"└ Indexed Files: `{s['files_count']}`\n"
        )
    return "\n".join(lines)


@app.on_message(filters.command("db_status") & filters.user(OWNER_ID))
async def db_status_command(client: Client, message: Message):
    await message.reply_text(await db_status_text())


@app.on_message(filters.command("add_user") & filters.user(OWNER_ID))
async def add_user_premium_command(client: Client, message: Message):
    if len(message.command) < 3:
        await message.reply_text("Usage: `/add_user [user_id] [days]`")
        return
    try:
        target_uid, days = int(message.command[1]), int(message.command[2])
    except ValueError:
        await message.reply_text("⚠️ Both `user_id` and `days` must be integers.")
        return
    until = datetime.now(timezone.utc) + timedelta(days=days)
    await mongo_manager.get_control_db().users.update_one(
        {"user_id": target_uid}, {"$set": {"premium_until": until}}, upsert=True)
    await message.reply_text(
        f"💎 **Premium Granted!**\n• **User ID:** `{target_uid}`\n"
        f"• **Duration:** `{days} days` (Expires `{until.strftime('%Y-%m-%d %H:%M UTC')}`)\n"
        f"• **Unlocked:** Gemini AI Spelling Correction + up to 3 bot clones")


@app.on_message(filters.command("setpic") & filters.user(OWNER_ID))
async def setpic_command(client: Client, message: Message):
    if len(message.command) < 3 or message.command[1].lower() not in {"start", "absent", "settings"}:
        await message.reply_text("Usage: `/setpic [start|absent|settings] [photo_url_or_file_id]`")
        return
    category = message.command[1].lower()
    await mongo_manager.get_control_db().config.update_one(
        {"_id": "rotational_pics"}, {"$addToSet": {category: message.command[2].strip()}}, upsert=True)
    await message.reply_text(f"🖼 Added image to **{category.upper()}** rotation pool.")


@app.on_message(filters.command(["ban", "unban"]) & filters.user(OWNER_ID))
async def ban_unban_command(client: Client, message: Message):
    cmd = message.command[0].lower()
    try:
        target_uid = int(message.command[1])
    except (IndexError, ValueError):
        await message.reply_text(f"Usage: `/{cmd} [user_id] [optional_reason]`")
        return
    db = mongo_manager.get_control_db()
    if cmd == "ban":
        reason = " ".join(message.command[2:]) or "Policy violation"
        await db.bans.update_one({"user_id": target_uid},
                                 {"$set": {"reason": reason, "banned_at": datetime.now(timezone.utc)}}, upsert=True)
        await message.reply_text(f"🚫 User `{target_uid}` banned.\nReason: `{reason}`")
    else:
        await db.bans.delete_one({"user_id": target_uid})
        await message.reply_text(f"✅ User `{target_uid}` unbanned.")


async def clones_text() -> str:
    db = mongo_manager.get_control_db()
    clones = await db.clones.find({}).to_list(length=200)
    if not clones:
        return "🤖 No cloned instances currently registered."
    active = sum(1 for c in clones if c.get("active") is not False)
    master_users = await db.users.count_documents({})
    lines = [f"🤖 **Clone Status** - `{active}` active / `{len(clones)}` total",
             f"👥 Master DB users: `{master_users}`\n"]
    total = 0
    for c in clones:
        n = await db.clone_users.count_documents({"bot_id": c.get("bot_id")})
        total += n
        created = c.get("created_at")
        state = "🟢 ACTIVE" if c.get("active") is not False else "🔴 STOPPED"
        running = "running" if c.get("bot_id") in CLONES else "not running"
        owner_un = f" @{c['owner_username']}" if c.get("owner_username") else ""
        lines.append(
            f"• **@{c.get('bot_username', '?')}** - {state} ({running})\n"
            f"  ├ Bot ID: `{c.get('bot_id', '?')}`\n"
            f"  ├ Owner: `{c.get('owner_name', '?')}`{owner_un} (`{c.get('owner_id', '?')}`)\n"
            f"  ├ Users: `{n}` | Files served: `{c.get('files_served', 0)}`\n"
            f"  └ Created: `{created.strftime('%Y-%m-%d %H:%M UTC') if created else '?'}`"
        )
    lines.append(f"\n📊 **Total users across all clones:** `{total}`")
    return "\n".join(lines)


@app.on_message(filters.command("clone_status") & filters.user(OWNER_ID))
async def clone_status_command(client: Client, message: Message):
    await reply_long(message, await clones_text())


@app.on_message(filters.command("add_shortener") & filters.user(OWNER_ID))
async def add_shortener_command(client: Client, message: Message):
    if len(message.command) < 3:
        await message.reply_text("Usage: `/add_shortener domain.com api_key`")
        return
    domain = message.command[1].replace("https://", "").replace("http://", "").strip("/")
    await mongo_manager.get_control_db().config.update_one(
        {"_id": "bot_settings"},
        {"$push": {"shorteners": {"domain": domain, "api_key": message.command[2]}}}, upsert=True)
    await message.reply_text(f"✅ Shortener `{domain}` added. (First one in the list is used.)")


@app.on_message(filters.command("clear_shorteners") & filters.user(OWNER_ID))
async def clear_shorteners_command(client: Client, message: Message):
    await set_setting("shorteners", [])
    await message.reply_text("🧹 All shorteners removed. Downloads are now direct.")


@app.on_message(filters.command("set_hours") & filters.user(OWNER_ID))
async def set_hours_command(client: Client, message: Message):
    try:
        hours = int(message.command[1])
        assert hours > 0
    except Exception:
        await message.reply_text("Usage: `/set_hours 2`")
        return
    await set_setting("pass_duration_hours", hours)
    await message.reply_text(f"⏱ Time-pass duration set to **{hours} hour(s)**.")


@app.on_message(filters.command("set_brand") & filters.user(OWNER_ID))
async def set_brand_command(client: Client, message: Message):
    if len(message.command) < 2:
        await message.reply_text("Usage: `/set_brand @YourChannel`")
        return
    await set_setting("brand_watermark", message.command[1])
    await message.reply_text(f"🔖 Watermark set to `{message.command[1]}`")


@app.on_message(filters.command("broadcast") & filters.user(OWNER_ID))
async def broadcast_command(client: Client, message: Message):
    src = message.reply_to_message
    if not src:
        await message.reply_text("Reply to any message with `/broadcast` to send it to all users.")
        return
    status = await message.reply_text("📢 Broadcasting...")
    ok = fail = 0
    async for u in mongo_manager.get_control_db().users.find({}, {"user_id": 1}):
        for _ in range(2):
            try:
                await src.copy(u["user_id"])
                ok += 1
                break
            except FloodWait as fw:
                await asyncio.sleep(fw.value + 1)
            except Exception:
                fail += 1
                break
        await asyncio.sleep(0.05)
    await status.edit_text(f"📢 Broadcast finished.\n✅ Sent: `{ok}`\n❌ Failed: `{fail}`")


async def render_admin_panel() -> Tuple[str, InlineKeyboardMarkup]:
    db = mongo_manager.get_control_db()
    settings = await get_settings()
    mode = settings.get("access_mode", "TIME_PASS")
    brand = settings.get("brand_watermark", BRAND_CHANNEL)
    users_total = await db.users.count_documents({})
    clones_total = await db.clones.count_documents({})
    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton(f"🔐 Mode: {'Time-Based Pass' if mode == 'TIME_PASS' else 'Per-Post Link'}",
                                 callback_data="admin_toggle_mode"),
            InlineKeyboardButton("🔗 Shortener APIs", callback_data="admin_shorteners"),
        ],
        [
            InlineKeyboardButton("🗄 Multi-DB Status", callback_data="admin_db_status"),
            InlineKeyboardButton("🤖 Clone Monitor", callback_data="admin_clones"),
        ],
        [
            InlineKeyboardButton("📢 Broadcast All", callback_data="admin_broadcast"),
            InlineKeyboardButton("📊 Trigger Weekly Poll", callback_data="admin_trigger_poll"),
        ],
    ])
    text = (
        f"🎛 **{BOT_NAME} - Admin Control Panel**\n━━━━━━━━━━━━━━━━━━━━\n"
        f"• **Registered Users:** `{users_total}`\n"
        f"• **Active Clones:** `{clones_total}`\n"
        f"• **Shortener Mode:** `{mode}`\n"
        f"• **Document Watermark:** `{brand}`\n"
        f"• **MongoDB Shards Online:** `{len(mongo_manager.uris)}`"
    )
    return text, kb


@app.on_message(filters.command(["admin", "owner"]) & filters.user(OWNER_ID))
async def admin_dashboard_command(client: Client, message: Message):
    text, kb = await render_admin_panel()
    await safe_reply(message, text, await get_rotated_pic("settings"), kb)


# ---------------------------------------------------------------------
# MASTER DATABASE CHANNEL INGESTION & BACKUP MIRROR
# ---------------------------------------------------------------------
@app.on_message(DB_CHANNEL_FILTER & (filters.document | filters.video))
async def ingest_channel_media(client: Client, message: Message):
    media = message.document or message.video
    if await mongo_manager.find_file(media.file_unique_id):
        return  # already indexed
    raw_caption = message.caption or getattr(media, "file_name", "") or "Untitled Media"
    brand = (await get_settings()).get("brand_watermark", BRAND_CHANNEL)
    clean_caption = sanitize_media_caption(raw_caption, brand)
    meta = extract_languages_and_meta(raw_caption)

    backup_msg_id = None
    if BACKUP_DB_CHANNEL:
        try:
            copied = await message.copy(chat_id=BACKUP_DB_CHANNEL, caption=clean_caption)
            backup_msg_id = copied.id
        except Exception as exc:
            logger.warning(f"Backup channel mirror warning: {exc}")

    write_db = await mongo_manager.get_active_write_db()
    await write_db.media_files.insert_one({
        "file_id": media.file_id,
        "file_unique_id": media.file_unique_id,
        "file_name": getattr(media, "file_name", None) or "Nohara_Media.mkv",
        "file_size": getattr(media, "file_size", 0) or 0,
        "clean_title": re.sub(r"[^\w\s]", " ", raw_caption).strip(),
        "sanitized_caption": clean_caption,
        "languages": meta["languages"],
        "season": meta["season"],
        "episode": meta["episode"],
        "quality": meta["quality"],
        "is_series": meta["is_series"],
        "master_msg_id": message.id,
        "backup_msg_id": backup_msg_id,
        "created_at": datetime.now(timezone.utc),
    })


# ---------------------------------------------------------------------
# AUTO-FILTER SEARCH
# ---------------------------------------------------------------------
@app.on_message(filters.text & (filters.private | filters.group) & ~filters.regex(r"^/"))
async def auto_filter_search_handler(client: Client, message: Message):
    user_id = message.from_user.id if message.from_user else 0
    if await is_user_banned(user_id):
        return

    await track_user(client, user_id)
    raw_query = message.text.strip()
    if len(raw_query) < 2 or raw_query.lower() in CONVERSATIONAL_FILLER:
        return

    db = mongo_manager.get_control_db()
    await db.search_metrics.update_one(
        {"query": raw_query.lower()},
        {"$inc": {"count": 1}, "$set": {"display_query": raw_query, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    is_prem, _ = await is_user_premium(user_id)
    search_title = raw_query
    detected_lang = None
    ai_note = ""

    for tok, lang_label in LANGUAGE_MAP.items():
        if re.search(rf"\b{re.escape(tok)}\b", raw_query.lower()):
            detected_lang = lang_label
            search_title = re.sub(rf"\b{re.escape(tok)}\b", "", search_title, flags=re.IGNORECASE).strip()
            break
    search_title = search_title or raw_query

    if is_prem:
        corrected, ai_lang = await gemini_correct_query(raw_query)
        if ai_lang and not detected_lang:
            detected_lang = ai_lang
        if corrected and corrected.lower() != search_title.lower():
            ai_note = f"✨ *Gemini AI Corrected:* `{raw_query}` → **{corrected}**\n"
            search_title = corrected

    files = await mongo_manager.search_across_all_shards(search_title, detected_lang)
    if not files:
        support_kb = InlineKeyboardMarkup([[InlineKeyboardButton("🛟 Get Support / Request Upload", url=f"https://t.me/{SUPPORT_ID}")]])
        text = (
            f"{ai_note}❌ **No Matching Files Found for:** `{search_title}`\n"
            f"• **Language Filter:** `{detected_lang or 'All Languages'}`\n"
            f"• **Tip:** Tap **Get Support** below to request an upload."
        )
        await safe_reply(message, text, await get_rotated_pic("absent"), support_kb)
        return

    tmdb = await fetch_tmdb_metadata(search_title)
    avail_langs = sorted({lang for f in files for lang in f.get("languages", ["English"])})
    token = make_session(search_title, files)
    kb = build_results_keyboard(token, SESSIONS[token]["files"])

    header_title = tmdb["title"] if tmdb else search_title.title()
    release_str = tmdb["release_date"] if tmdb else "Archive Release"
    rating_str = f"⭐ {tmdb['rating']}/10" if tmdb and tmdb.get("rating") else "🎬 HD Archive"
    caption = (
        f"{ai_note}🎬 **{header_title}** ({release_str}) · {rating_str}\n"
        f"🗣 **Available Audio:** `{', '.join(avail_langs)}`\n"
        f"📦 **Matched Documents:** `{len(files)} file(s)`\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Select a file, an episode, or tap **Send All** below:"
    )
    await safe_reply(message, caption, tmdb["poster_url"] if tmdb else None, kb)


# ---------------------------------------------------------------------
# INLINE SEARCH
# ---------------------------------------------------------------------
@app.on_inline_query()
async def inline_search_handler(client: Client, iq: InlineQuery):
    query = (iq.query or "").strip()
    if len(query) < 2 or await is_user_banned(iq.from_user.id):
        await iq.answer([], cache_time=1, switch_pm_text="Type a movie / series name", switch_pm_parameter="start")
        return
    files = await mongo_manager.search_across_all_shards(query)
    results = []
    for f in files[:25]:
        size_mb = round((f.get("file_size") or 0) / (1024 * 1024), 1)
        title = (f.get("clean_title") or f.get("file_name") or "File")[:60]
        link = f"https://t.me/{client.me.username}?start=file_{f['file_unique_id']}"
        results.append(InlineQueryResultArticle(
            id=f["file_unique_id"][:60],
            title=title,
            description=f"{f.get('quality', '')} · {size_mb} MB · {', '.join(f.get('languages', []))}",
            input_message_content=InputTextMessageContent(f"🎬 **{title}**\n👉 {link}"),
        ))
    await iq.answer(results, cache_time=5, is_personal=False)


# ---------------------------------------------------------------------
# CALLBACK BUTTONS (all of them)
# ---------------------------------------------------------------------
@app.on_callback_query()
async def callback_router(client: Client, cq: CallbackQuery):
    data = cq.data or ""
    user_id = cq.from_user.id
    msg = cq.message
    is_owner = user_id == OWNER_ID

    if data == "noop":
        await cq.answer()
        return

    if data.startswith("admin_") and not is_owner:
        await cq.answer("⛔ Owner only.", show_alert=True)
        return

    if await is_user_banned(user_id):
        await cq.answer("🚫 You are restricted.", show_alert=True)
        return

    # ----- user menus -----
    if data == "menu_top_search":
        top = await mongo_manager.get_control_db().search_metrics.find({}).sort("count", -1).limit(10).to_list(length=10)
        if not top:
            await cq.answer("No searches yet.", show_alert=True)
            return
        lines = ["🔥 **Top Searches**\n"] + [f"{i}. {t.get('display_query', t['query']).title()} (`{t['count']}`)" for i, t in enumerate(top, 1)]
        await cq.answer()
        await msg.reply_text("\n".join(lines))
        return

    if data == "menu_clone_bot":
        await cq.answer()
        await send_clone_offer(client, user_id, msg.chat.id)
        return

    # ----- search result buttons -----
    if data.startswith("file:"):
        await cq.answer("Preparing your file...")
        await deliver(client, msg.chat.id, user_id, data[5:])
        return

    if data.startswith(("flt:", "sendall:")):
        parts = data.split(":")
        sess = SESSIONS.get(parts[1])
        if not sess:
            await cq.answer("Search expired. Please search again.", show_alert=True)
            return
        filt = parts[2] if len(parts) > 2 and parts[2] != "-" else None
        files = filter_files(sess["files"], filt)
        if parts[0] == "flt":
            if not files:
                await cq.answer("No files for this selection.", show_alert=True)
                return
            await cq.answer()
            try:
                await msg.edit_reply_markup(build_results_keyboard(parts[1], files, filt))
            except MessageNotModified:
                pass
            return
        # sendall
        await cq.answer(f"Sending {min(len(files), MAX_BATCH)} file(s)...")
        target = "batch:" + ",".join(f["file_unique_id"] for f in files[:MAX_BATCH])
        await deliver(client, msg.chat.id, user_id, target)
        return

    # ----- admin panel buttons -----
    if data == "admin_toggle_mode":
        mode = (await get_settings()).get("access_mode", "TIME_PASS")
        await set_setting("access_mode", "PER_POST" if mode == "TIME_PASS" else "TIME_PASS")
        text, kb = await render_admin_panel()
        await edit_msg(msg, text, kb)
        await cq.answer("Mode switched.")
        return

    if data == "admin_shorteners":
        shorteners = (await get_settings()).get("shorteners", [])
        listing = "\n".join(f"{i}. `{s['domain']}`" for i, s in enumerate(shorteners, 1)) or "None configured."
        await cq.answer()
        await msg.reply_text(
            f"🔗 **Shorteners**\n{listing}\n\n`/add_shortener domain.com api_key`\n`/clear_shorteners`\n"
            f"`/set_hours 2` (time-pass length)")
        return

    if data == "admin_db_status":
        await cq.answer()
        await msg.reply_text(await db_status_text())
        return

    if data == "admin_clones":
        await cq.answer()
        await reply_long(msg, await clones_text())
        return

    if data == "admin_broadcast":
        await cq.answer("Reply to any message with /broadcast", show_alert=True)
        return

    if data == "admin_trigger_poll":
        await cq.answer("Sending poll...")
        await run_sunday_trending_polls()
        return

    await cq.answer()


# ---------------------------------------------------------------------
# WEEKLY POLL
# ---------------------------------------------------------------------
async def run_sunday_trending_polls():
    if not MASTER_LOCK_CHANNEL:
        logger.info("MASTER_LOCK_CHANNEL not set - skipping poll.")
        return
    top = await mongo_manager.get_control_db().search_metrics.find({}).sort("count", -1).limit(5).to_list(length=5)
    options: List[str] = []
    for item in top:
        opt = item.get("display_query", item["query"]).title()[:100]
        if opt and opt not in options:
            options.append(opt)
    if len(options) < 2:
        options = ["Kalki 2898 AD (Hindi)", "Mirzapur Season 3", "Solo Leveling (Anime)", "Pushpa 2: The Rule"]
    try:
        poll = await app.send_poll(
            chat_id=MASTER_LOCK_CHANNEL,
            question=f"📊 {BOT_NAME} Sunday Poll: Which release should we upload first this week?"[:250],
            options=options,
            is_anonymous=True,  # channels only allow anonymous polls
        )
        logger.info(f"Sunday poll published: {poll.id}")
    except Exception as exc:
        logger.warning(f"Poll dispatch warning: {exc}")


# ---------------------------------------------------------------------
# CLONE SYSTEM (Telegram Managed Bots, Bot API 9.6+)
# Requires: BotFather -> Mini App -> this bot -> enable "Bot Management Mode".
# ---------------------------------------------------------------------
async def bot_api(method: str, payload: Dict[str, Any], timeout: int = 20) -> Dict[str, Any]:
    async with aiohttp.ClientSession() as session:
        async with session.post(f"https://api.telegram.org/bot{BOT_TOKEN}/{method}", json=payload,
                                timeout=aiohttp.ClientTimeout(total=timeout)) as resp:
            return await resp.json(content_type=None)


async def clone_limit_for(user_id: int) -> int:
    if user_id == OWNER_ID:
        return 100
    prem, _ = await is_user_premium(user_id)
    return 3 if prem else 1


async def send_clone_offer(client: Client, user_id: int, chat_id: int):
    db = mongo_manager.get_control_db()
    used = await db.clones.count_documents({"owner_id": user_id, "active": {"$ne": False}})
    limit = await clone_limit_for(user_id)
    if used >= limit:
        await client.send_message(
            chat_id, f"⚠️ Clone limit reached (`{used}/{limit}`). Premium users can create up to 3 clones.\n"
                     f"Delete one with `/delclone @username`.")
        return
    suggested = f"nohara_{secrets.token_hex(3)}_bot"
    link = f"https://t.me/newbot/{MASTER_USERNAME}/{suggested}?name={quote(BOT_NAME)}"
    kb = InlineKeyboardMarkup([[InlineKeyboardButton("🤖 Create My Bot", url=link)]])
    await client.send_message(
        chat_id,
        f"🤖 **Clone {BOT_NAME}**\n\nTap the button, confirm the name/username (you can change them) and "
        f"Telegram creates your own bot. It goes live automatically with the same archive.\n"
        f"• **Your clones:** `{used}/{limit}`",
        reply_markup=kb,
    )


async def start_clone(doc: Dict[str, Any]) -> bool:
    bot_id = doc["bot_id"]
    if bot_id in CLONES:
        return True
    c = Client(f"clone_{bot_id}", api_id=API_ID, api_hash=API_HASH, bot_token=doc["token"], in_memory=True)
    for group, handlers in list(app.dispatcher.groups.items()):
        for h in handlers:
            c.add_handler(h, group)
    await asyncio.sleep(0.2)
    try:
        await c.start()
    except Exception as exc:
        logger.warning(f"Clone @{doc.get('bot_username')} failed to start: {exc}")
        return False
    CLONES[bot_id] = c
    logger.info(f"Clone started: @{doc.get('bot_username')}")
    return True


async def start_all_clones():
    db = mongo_manager.get_control_db()
    async for doc in db.clones.find({"active": {"$ne": False}, "token": {"$exists": True}}):
        await start_clone(doc)


async def post_clone_backup(doc: Dict[str, Any]):
    """Posts the full clone record (incl. token) to MASTER_DB_CHANNEL as a backup."""
    if not MASTER_DB_CHANNEL:
        return
    created = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    text = (
        "🤖 **NEW CLONE BACKUP**\n━━━━━━━━━━━━━━━━━━━━\n"
        f"• **Bot:** `{doc.get('bot_name')}` (@{doc.get('bot_username')})\n"
        f"• **Bot ID:** `{doc.get('bot_id')}`\n"
        f"• **Bot Token:** `{doc.get('token')}`\n"
        f"• **Owner ID:** `{doc.get('owner_id')}`\n"
        f"• **Owner Name:** `{doc.get('owner_name')}`\n"
        f"• **Owner Username:** `@{doc.get('owner_username') or 'none'}`\n"
        f"• **Created:** `{created}`\n"
        "• **Status:** `ACTIVE`"
    )
    try:
        m = await app.send_message(MASTER_DB_CHANNEL, text)
        await mongo_manager.get_control_db().clones.update_one(
            {"bot_id": doc["bot_id"]}, {"$set": {"backup_msg_id": m.id}})
    except Exception as exc:
        logger.warning(f"Clone backup post failed: {exc}")


async def handle_managed_bot(mb: Dict[str, Any]):
    owner, bot = mb.get("user", {}), mb.get("bot", {})
    bot_id = bot.get("id")
    if not bot_id:
        return
    token = None
    for key in ("user_id", "bot_user_id"):
        res = await bot_api("getManagedBotToken", {key: bot_id}, 15)
        if res.get("ok"):
            token = res["result"]
            break
    owner_id = owner.get("id")
    if not token:
        logger.warning(f"getManagedBotToken failed for {bot_id}")
        if owner_id:
            await app.send_message(owner_id, "❌ Your bot was created but I could not fetch its token. Contact support.")
        return
    doc = {
        "bot_id": bot_id, "bot_username": bot.get("username", ""), "bot_name": bot.get("first_name", BOT_NAME),
        "token": token, "owner_id": owner_id, "owner_name": owner.get("first_name", ""), "owner_username": owner.get("username", ""), "active": True,
    }
    await mongo_manager.get_control_db().clones.update_one(
        {"bot_id": bot_id}, {"$set": doc, "$setOnInsert": {"created_at": datetime.now(timezone.utc), "users_count": 0, "files_served": 0}},
        upsert=True)
    await post_clone_backup(doc)
    ok = await start_clone(doc)
    if owner_id:
        await app.send_message(
            owner_id,
            f"✅ **Your bot @{doc['bot_username']} is {'live' if ok else 'created (start failed, will retry on restart)'}!**\n"
            f"Open it and send any movie name to search.")


async def managed_bot_poller():
    """Pyrogram does not parse `managed_bot` updates yet, so we long-poll just that update type."""
    offset = None
    while True:
        try:
            payload: Dict[str, Any] = {"timeout": 25, "allowed_updates": ["managed_bot"]}
            if offset:
                payload["offset"] = offset
            data = await bot_api("getUpdates", payload, 40)
            if not data.get("ok"):
                logger.warning(f"managed_bot poll error: {data.get('description')}")
                await asyncio.sleep(10)
                continue
            for upd in data.get("result", []):
                offset = upd["update_id"] + 1
                if upd.get("managed_bot"):
                    await handle_managed_bot(upd["managed_bot"])
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning(f"managed_bot poller: {exc}")
            await asyncio.sleep(5)


@app.on_message(filters.command("clone") & filters.private)
async def clone_command(client: Client, message: Message):
    await send_clone_offer(client, message.from_user.id, message.chat.id)


@app.on_message(filters.command("myclones") & filters.private)
async def myclones_command(client: Client, message: Message):
    docs = await mongo_manager.get_control_db().clones.find(
        {"owner_id": message.from_user.id, "active": {"$ne": False}}).to_list(length=20)
    if not docs:
        await message.reply_text("You have no clones yet. Use /clone to create one.")
        return
    await message.reply_text("🤖 **Your clones**\n" + "\n".join(f"• @{d['bot_username']}" for d in docs))


@app.on_message(filters.command("delclone") & filters.private)
async def delclone_command(client: Client, message: Message):
    if len(message.command) < 2:
        await message.reply_text("Usage: `/delclone @username`")
        return
    uname = message.command[1].lstrip("@")
    db = mongo_manager.get_control_db()
    doc = await db.clones.find_one({"bot_username": {"$regex": f"^{re.escape(uname)}$", "$options": "i"}})
    if not doc or (doc.get("owner_id") != message.from_user.id and message.from_user.id != OWNER_ID):
        await message.reply_text("⚠️ Clone not found, or it is not yours.")
        return
    c = CLONES.pop(doc["bot_id"], None)
    if c:
        try:
            await c.stop()
        except Exception:
            pass
    await db.clones.update_one({"bot_id": doc["bot_id"]}, {"$set": {"active": False}, "$unset": {"token": ""}})
    if MASTER_DB_CHANNEL and doc.get("backup_msg_id"):
        try:
            await app.edit_message_text(
                MASTER_DB_CHANNEL, doc["backup_msg_id"],
                f"🗑 **CLONE STOPPED**\n• **Bot:** @{doc['bot_username']} (`{doc['bot_id']}`)\n"
                f"• **Owner ID:** `{doc.get('owner_id')}`\n• **Stopped:** `{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}`")
        except Exception as exc:
            logger.warning(f"Backup edit failed: {exc}")
    await message.reply_text(f"🗑 Clone @{doc['bot_username']} stopped. (Delete the bot itself in @BotFather if you want.)")


# ---------------------------------------------------------------------
# HEALTH SERVER + ENTRYPOINT
# ---------------------------------------------------------------------
async def handle_healthz(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "service": "Nohara-Filter-Bot", "shards": len(mongo_manager.uris)})


async def main():
    global MASTER_USERNAME
    await mongo_manager.initialize()

    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(run_sunday_trending_polls, "cron", day_of_week="sun", hour=10, minute=0)
    scheduler.start()

    web_app = web.Application()
    web_app.router.add_get("/", handle_healthz)
    web_app.router.add_get("/healthz", handle_healthz)
    runner = web.AppRunner(web_app)
    await runner.setup()
    await web.TCPSite(runner, "0.0.0.0", PORT).start()
    logger.info(f"Health server listening on port {PORT}")

    await app.start()
    MASTER_USERNAME = (await app.get_me()).username
    logger.info(f"{BOT_NAME} started as @{MASTER_USERNAME}")
    await start_all_clones()
    poller = asyncio.create_task(managed_bot_poller())
    await idle()
    poller.cancel()
    for c in list(CLONES.values()):
        try:
            await c.stop()
        except Exception:
            pass
    await app.stop()


if __name__ == "__main__":
    loop.run_until_complete(main())
