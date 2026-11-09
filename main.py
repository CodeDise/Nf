#!/usr/bin/env python3
"""
CinePulse Telegram Auto-Filter Bot (Pyrogram v2 + Multi-MongoDB + TMDB + Gemini AI)
Optimized for Render Deployment with root-level architecture.
"""

import os
import re
import time
import random
import secrets
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple, Any

import aiohttp
from aiohttp import web
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from google import genai
from google.genai import types as genai_types

from pyrogram import Client, filters, enums
from pyrogram.types import (
    Message,
    CallbackQuery,
    InlineKeyboardMarkup,
    InlineKeyboardButton,
    InlineQuery,
    InlineQueryResultCachedDocument,
    InlineQueryResultArticle,
    InputTextMessageContent,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("CinePulseBot")

# =====================================================================
# 0. ENVIRONMENT & GLOBAL CONFIGURATION
# =====================================================================
API_ID = int(os.getenv("API_ID", "12345678"))
API_HASH = os.getenv("API_HASH", "your_api_hash")
BOT_TOKEN = os.getenv("BOT_TOKEN", "your_bot_token")
OWNER_ID = int(os.getenv("OWNER_ID", "784920114"))

MASTER_DB_CHANNEL = int(os.getenv("MASTER_DB_CHANNEL", "-1001982347100"))
BACKUP_DB_CHANNEL = int(os.getenv("BACKUP_DB_CHANNEL", "-1001982347199"))
MASTER_LOG_CHANNEL = int(os.getenv("MASTER_LOG_CHANNEL", "-1001982347250"))
MASTER_LOCK_CHANNEL = int(os.getenv("MASTER_LOCK_CHANNEL", "-1001982347300"))
SUPPORT_ID = os.getenv("SUPPORT_ID", "CinePulseSupport").lstrip("@")

PRIMARY_MONGO_URI = os.getenv("PRIMARY_MONGO_URI", "mongodb://localhost:27017/cinepulse_01")
TMDB_API_KEY = os.getenv("TMDB_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
PORT = int(os.getenv("PORT", "8080"))

# Supported Indian & Global Audio Languages
LANGUAGE_MAP: Dict[str, str] = {
    "hin": "Hindi",
    "hindi": "Hindi",
    "tam": "Tamil",
    "tamil": "Tamil",
    "tel": "Telugu",
    "telugu": "Telugu",
    "mal": "Malayalam",
    "malayalam": "Malayalam",
    "ben": "Bengali",
    "bengali": "Bengali",
    "mar": "Marathi",
    "marathi": "Marathi",
    "kan": "Kannada",
    "kannada": "Kannada",
    "guj": "Gujarati",
    "gujarati": "Gujarati",
    "pun": "Punjabi",
    "punjabi": "Punjabi",
    "eng": "English",
    "english": "English",
    "jap": "Japanese",
    "japanese": "Japanese",
    "dual": "Dual Audio",
    "multi": "Multi Audio",
}

CONVERSATIONAL_FILLER = {
    "hi", "hello", "hey", "start", "help", "ok", "okay", "thanks",
    "thank you", "bro", "please", "send", "movie", "series", "anime",
    "good morning", "good night", "admin", "owner", "bot", "test"
}


# =====================================================================
# 1. DYNAMIC MULTI-MONGODB SHARD MANAGER
# =====================================================================
class MultiMongoManager:
    """
    Manages sequential MongoDB instances registered via /set_db.
    Automatically spills over to the next registered database shard when storage
    approaches the free-tier threshold (512 MB default).
    """

    def __init__(self, primary_uri: str, max_shard_mb: float = 480.0):
        self.uris: List[str] = [primary_uri] if primary_uri else []
        self.clients: Dict[str, AsyncIOMotorClient] = {}
        self.max_shard_mb = max_shard_mb
        self.active_index = 0

    async def initialize(self):
        for uri in self.uris:
            self.clients[uri] = AsyncIOMotorClient(uri)
        # Load any additional URIs stored in primary config
        if self.uris:
            primary_db = self.get_control_db()
            cfg = await primary_db.config.find_one({"_id": "mongo_shards"})
            if cfg and "uris" in cfg:
                for extra_uri in cfg["uris"]:
                    if extra_uri not in self.uris:
                        self.uris.append(extra_uri)
                        self.clients[extra_uri] = AsyncIOMotorClient(extra_uri)

    def get_control_db(self):
        """Primary database stores global settings, users, clones, bans, and metrics."""
        primary_uri = self.uris[0]
        return self.clients[primary_uri].get_default_database()

    async def register_uri(self, new_uri: str) -> Tuple[bool, str]:
        if new_uri in self.uris:
            return False, "URI is already registered in the shard ring."
        try:
            client = AsyncIOMotorClient(new_uri, serverSelectionTimeoutMS=5000)
            await client.admin.command("ping")
            self.uris.append(new_uri)
            self.clients[new_uri] = client
            await self.get_control_db().config.update_one(
                {"_id": "mongo_shards"},
                {"$set": {"uris": self.uris}},
                upsert=True,
            )
            return True, f"Shard #{len(self.uris)} verified and added to sequential pool."
        except Exception as exc:
            return False, f"Connection failed: {exc}"

    async def get_status_report(self) -> List[Dict[str, Any]]:
        report = []
        for idx, uri in enumerate(self.uris):
            client = self.clients.get(uri)
            try:
                db = client.get_default_database()
                stats = await db.command("dbStats")
                used_mb = round((stats.get("dataSize", 0) + stats.get("indexSize", 0)) / (1024 * 1024), 2)
                files_count = await db.media_files.count_documents({})
                masked = re.sub(r"://([^:]+):([^@]+)@", r"://\1:****@", uri)
                report.append({
                    "shard_id": idx + 1,
                    "masked_uri": masked,
                    "used_mb": used_mb,
                    "capacity_mb": 512.0,
                    "files_count": files_count,
                    "status": "ACTIVE_WRITE" if idx == self.active_index else ("FULL" if used_mb >= self.max_shard_mb else "STANDBY_READ"),
                })
            except Exception as exc:
                report.append({
                    "shard_id": idx + 1,
                    "masked_uri": "unverified-uri",
                    "used_mb": 0.0,
                    "capacity_mb": 512.0,
                    "files_count": 0,
                    "status": f"ERROR: {exc}",
                })
        return report

    async def get_active_write_db(self):
        """Finds the first non-full MongoDB shard sequentially."""
        for idx, uri in enumerate(self.uris):
            db = self.clients[uri].get_default_database()
            try:
                stats = await db.command("dbStats")
                used_mb = (stats.get("dataSize", 0) + stats.get("indexSize", 0)) / (1024 * 1024)
                if used_mb < self.max_shard_mb:
                    self.active_index = idx
                    return db
            except Exception:
                continue
        # Fallback to latest registered shard
        self.active_index = len(self.uris) - 1
        return self.clients[self.uris[-1]].get_default_database()

    async def search_across_all_shards(self, query_text: str, language: Optional[str] = None) -> List[Dict[str, Any]]:
        """Executes parallel regex searches across all registered MongoDB instances."""
        tokens = [re.escape(t) for t in query_text.strip().split() if t]
        if not tokens:
            return []
        pattern = ".*".join(tokens)
        mongo_filter: Dict[str, Any] = {"clean_title": {"$regex": pattern, "$options": "i"}}
        if language and language.lower() != "all":
            mongo_filter["languages"] = {"$in": [language]}

        async def _query_shard(uri: str):
            db = self.clients[uri].get_default_database()
            cursor = db.media_files.find(mongo_filter).sort("created_at", -1).limit(60)
            return await cursor.to_list(length=60)

        results_nested = await asyncio.gather(*[_query_shard(u) for u in self.uris], return_exceptions=True)
        merged: List[Dict[str, Any]] = []
        for batch in results_nested:
            if isinstance(batch, list):
                merged.extend(batch)
        return merged


# =====================================================================
# 2. TEXT SANITIZER, LANGUAGE DETECTOR & TMDB ENRICHMENT
# =====================================================================
def sanitize_media_caption(raw_text: str, brand_channel: str = "@CinePulseMain") -> str:
    """
    Strips all external URLs, user handles (@username), and third-party signatures.
    Applies standardized clean layout with custom channel branding.
    """
    if not raw_text:
        return f"🎬 Powered by {brand_channel}"
    # Remove URLs
    cleaned = re.sub(r"https?://\S+|www\.\S+|t\.me/\S+", "", raw_text, flags=re.IGNORECASE)
    # Remove @handles
    cleaned = re.sub(r"@[A-Za-z0-9_]{3,}", "", cleaned)
    # Remove bracketed promotional tags like [Joined @xyz]
    cleaned = re.sub(r"\[[^\]]*(?:join|channel|t\.me|telegram)[^\]]*\]", "", cleaned, flags=re.IGNORECASE)
    # Normalize separators
    cleaned = re.sub(r"[_\.]+", " ", cleaned)
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return f"🎬 **{cleaned}**\n━━━━━━━━━━━━━━━━━━━━\n🏷 ** Official Archive:** {brand_channel}"


def extract_languages_and_meta(text: str) -> Dict[str, Any]:
    """Detects Indian & English audio tracks, season/episode numbers, and quality."""
    lower = text.lower()
    detected_langs: List[str] = []
    for token, lang_name in LANGUAGE_MAP.items():
        if re.search(rf"\b{re.escape(token)}\b", lower):
            if lang_name not in detected_langs:
                detected_langs.append(lang_name)
    if not detected_langs:
        detected_langs.append("English")

    season_match = re.search(r"\bS(\d{1,2})\b|\bSeason\s*(\d{1,2})\b", text, re.IGNORECASE)
    ep_match = re.search(r"\bE(\d{1,3})\b|\bEp(?:isode)?\s*(\d{1,3})\b", text, re.IGNORECASE)
    quality_match = re.search(r"\b(2160p|4K|1080p|720p|480p|HDRip|WEB-DL|BluRay)\b", text, re.IGNORECASE)

    season = int(season_match.group(1) or season_match.group(2)) if season_match else None
    episode = int(ep_match.group(1) or ep_match.group(2)) if ep_match else None
    quality = quality_match.group(1) if quality_match else "1080p WEB-DL"

    return {
        "languages": detected_langs,
        "season": season,
        "episode": episode,
        "quality": quality,
        "is_series": bool(season is not None or episode is not None),
    }


async def fetch_tmdb_metadata(query: str) -> Optional[Dict[str, Any]]:
    """Fetches Poster, Title, Release Date, and Genres from TMDB API."""
    if not TMDB_API_KEY:
        return None
    clean_q = re.sub(r"\b(hindi|tamil|telugu|malayalam|bengali|marathi|english|1080p|720p|480p|s\d+|e\d+)\b", "", query, flags=re.IGNORECASE).strip()
    url = "https://api.themoviedb.org/3/search/multi"
    params = {"api_key": TMDB_API_KEY, "query": clean_q or query, "include_adult": "false"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=6) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                results = data.get("results", [])
                if not results:
                    return None
                top = results[0]
                title = top.get("title") or top.get("name") or query
                release = top.get("release_date") or top.get("first_air_date") or "Unknown"
                poster_path = top.get("poster_path")
                poster_url = f"https://image.tmdb.org/t/p/w500{poster_path}" if poster_path else None
                rating = round(float(top.get("vote_average", 0.0)), 1)
                overview = top.get("overview", "No synopsis available.")
                return {
                    "title": title,
                    "release_date": release,
                    "poster_url": poster_url,
                    "rating": rating,
                    "media_type": top.get("media_type", "movie").upper(),
                    "overview": overview[:240] + ("..." if len(overview) > 240 else ""),
                }
    except Exception as exc:
        logger.warning(f"TMDB lookup error: {exc}")
        return None


# =====================================================================
# 3. GEMINI AI SPELLING CORRECTION (PREMIUM TIER EXCLUSIVE)
# =====================================================================
async def gemini_correct_query(raw_query: str) -> Tuple[str, Optional[str]]:
    """
    Uses Google Gemini (gemini-3.8-flash) to fix spelling mistakes in movie/series/anime
    titles and identify any requested language filter.
    Returns (corrected_title, detected_language).
    """
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
            model="gemini-3.8-flash",
            contents=prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        return response.text

    try:
        import json
        raw_json = await asyncio.to_thread(_sync_call)
        parsed = json.loads(raw_json)
        return parsed.get("corrected_title", raw_query), parsed.get("language")
    except Exception as exc:
        logger.warning(f"Gemini spellcheck fallback: {exc}")
        return raw_query, None


# =====================================================================
# 4. LINK SHORTENER & EXCLUSIVE ACCESS MODES
# =====================================================================
async def resolve_download_gate(
    db, user_id: int, file_id_token: str, bot_username: str
) -> Tuple[bool, Optional[str], str]:
    """
    Evaluates the active exclusive mode:
      - Mode 1: TIME_PASS (Unrestricted access for N seconds after 1 verification)
      - Mode 2: PER_POST (Mandatory shortener verification for every file/batch)
    Returns (is_allowed_direct, short_url_if_blocked, mode_label)
    """
    settings = await db.config.find_one({"_id": "bot_settings"}) or {}
    access_mode = settings.get("access_mode", "TIME_PASS")  # Exclusive: TIME_PASS or PER_POST
    pass_duration_hours = int(settings.get("pass_duration_hours", 1))
    shorteners = settings.get("shorteners", [])

    if not shorteners:
        return True, None, access_mode

    now = datetime.now(timezone.utc)
    if access_mode == "TIME_PASS":
        user_doc = await db.users.find_one({"user_id": user_id}) or {}
        pass_expiry = user_doc.get("time_pass_until")
        if pass_expiry and pass_expiry > now:
            return True, None, f"TIME_PASS (Active until {pass_expiry.strftime('%H:%M UTC')})"

    # Generate verification token & shorten via active shortener domain
    verify_token = secrets.token_urlsafe(12)
    await db.verify_tokens.insert_one({
        "token": verify_token,
        "user_id": user_id,
        "target": file_id_token,
        "mode": access_mode,
        "created_at": now,
    })
    deep_link = f"https://t.me/{bot_username}?start=verify_{verify_token}"
    active_shortener = shorteners[0]  # {domain, api_key}
    short_url = await shorten_url(active_shortener["domain"], active_shortener["api_key"], deep_link)
    return False, short_url, access_mode


async def shorten_url(domain: str, api_key: str, destination_url: str) -> str:
    api_endpoint = f"https://{domain}/api"
    params = {"api": api_key, "url": destination_url}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(api_endpoint, params=params, timeout=6) as resp:
                data = await resp.json()
                if data.get("status") == "success" and data.get("shortenedUrl"):
                    return data["shortenedUrl"]
    except Exception as exc:
        logger.warning(f"Shortener API fallback for {domain}: {exc}")
    return destination_url


# =====================================================================
# 5. PYROGRAM BOT INITIALIZATION & HANDLERS
# =====================================================================
mongo_manager = MultiMongoManager(PRIMARY_MONGO_URI)
app = Client(
    "CinePulseAutoFilterBot",
    api_id=API_ID,
    api_hash=API_HASH,
    bot_token=BOT_TOKEN,
)


async def is_user_banned(user_id: int) -> bool:
    db = mongo_manager.get_control_db()
    ban = await db.bans.find_one({"user_id": user_id})
    return bool(ban)


async def is_user_premium(user_id: int) -> Tuple[bool, Optional[datetime]]:
    db = mongo_manager.get_control_db()
    user = await db.users.find_one({"user_id": user_id})
    if not user or not user.get("premium_until"):
        return False, None
    expiry: datetime = user["premium_until"]
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry > datetime.now(timezone.utc):
        return True, expiry
    return False, None


async def get_rotated_pic(category: str) -> Optional[str]:
    """Returns a rotated image from /setpic configuration for start, absent, or settings."""
    db = mongo_manager.get_control_db()
    cfg = await db.config.find_one({"_id": "rotational_pics"}) or {}
    pics = cfg.get(category, [])
    return random.choice(pics) if pics else None


# ---------------------------------------------------------------------
# START, VERIFY & TOP SEARCH WORKFLOW
# ---------------------------------------------------------------------
@app.on_message(filters.command("start") & filters.private)
async def start_command(client: Client, message: Message):
    user_id = message.from_user.id
    if await is_user_banned(user_id):
        await message.reply_text("🚫 **Access Denied:** Your account is globally restricted across all instances.")
        return

    db = mongo_manager.get_control_db()
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"name": message.from_user.first_name, "username": message.from_user.username, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    # Check deep-link payloads (e.g., verify_<token> or batch_<id>)
    if len(message.command) > 1:
        payload = message.command[1]
        if payload.startswith("verify_"):
            token = payload.replace("verify_", "", 1)
            tok_doc = await db.verify_tokens.find_one_and_delete({"token": token, "user_id": user_id})
            if not tok_doc:
                await message.reply_text("⚠️ Verification token expired or invalid.")
                return
            if tok_doc["mode"] == "TIME_PASS":
                settings = await db.config.find_one({"_id": "bot_settings"}) or {}
                hours = int(settings.get("pass_duration_hours", 1))
                until = datetime.now(timezone.utc) + timedelta(hours=hours)
                await db.users.update_one({"user_id": user_id}, {"$set": {"time_pass_until": until}})
                await message.reply_text(f"✅ **Time-Based Pass Activated!** You have unrestricted downloads for the next **{hours} hour(s)**.")
            else:
                await message.reply_text("✅ **Per-Post Link Verified!** Dispatching your requested document now...")
            await dispatch_watermarked_document(client, message.chat.id, tok_doc["target"])
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
        f"👋 **Welcome to CinePulse Auto-Filter Bot, {message.from_user.first_name}!**\n\n"
        f"• **Account Tier:** `{tier_label}`\n"
        f"• **Languages:** Hindi · Tamil · Telugu · Malayalam · Bengali · Marathi · English\n"
        f"• **Repository:** Multi-Shard MongoDB + TMDB Enriched Cards\n\n"
        f"Send any Movie, Web Series, or Anime title below to search instant documents."
    )
    start_pic = await get_rotated_pic("start")
    if start_pic:
        await message.reply_photo(photo=start_pic, caption=caption, reply_markup=kb)
    else:
        await message.reply_text(caption, reply_markup=kb)


# ---------------------------------------------------------------------
# ADMIN COMMANDS: /set_db, /db_status, /add_user, /setpic, /ban, /unban
# ---------------------------------------------------------------------
@app.on_message(filters.command("set_db") & filters.user(OWNER_ID))
async def set_db_command(client: Client, message: Message):
    if len(message.command) < 2:
        await message.reply_text("Usage: `/set_db mongodb+srv://user:pass@cluster.mongodb.net/shard_name`")
        return
    uri = message.command[1].strip()
    ok, msg = await mongo_manager.register_uri(uri)
    icon = "✅" if ok else "❌"
    await message.reply_text(f"{icon} **Multi-MongoDB Registry:**\n{msg}")


@app.on_message(filters.command("db_status") & filters.user(OWNER_ID))
async def db_status_command(client: Client, message: Message):
    shards = await mongo_manager.get_status_report()
    lines = ["🗄 **Multi-MongoDB Live Storage Telemetry**\n"]
    for s in shards:
        pct = round((s["used_mb"] / s["capacity_mb"]) * 100, 1)
        lines.append(
            f"**Shard #{s['shard_id']}** (`{s['status']}`)\n"
            f"├ URI: `{s['masked_uri']}`\n"
            f"├ Storage: `{s['used_mb']} MB / {s['capacity_mb']} MB ({pct}%)`\n"
            f"└ Indexed Files: `{s['files_count']}`\n"
        )
    await message.reply_text("\n".join(lines))


@app.on_message(filters.command("add_user") & filters.user(OWNER_ID))
async def add_user_premium_command(client: Client, message: Message):
    if len(message.command) < 3:
        await message.reply_text("Usage: `/add_user [user_id] [days]`")
        return
    try:
        target_uid = int(message.command[1])
        days = int(message.command[2])
    except ValueError:
        await message.reply_text("⚠️ Both `user_id` and `days` must be integers.")
        return

    until = datetime.now(timezone.utc) + timedelta(days=days)
    db = mongo_manager.get_control_db()
    await db.users.update_one(
        {"user_id": target_uid},
        {"$set": {"premium_until": until, "clone_limit_override": None}},
        upsert=True,
    )
    await message.reply_text(
        f"💎 **Premium Granted!**\n"
        f"• **User ID:** `{target_uid}`\n"
        f"• **Duration:** `{days} days` (Expires `{until.strftime('%Y-%m-%d %H:%M UTC')}`)\n"
        f"• **Unlocked:** Gemini AI Spelling Correction & up to 3 Bot Clones."
    )


@app.on_message(filters.command("setpic") & filters.user(OWNER_ID))
async def setpic_command(client: Client, message: Message):
    """Configures rotational images: /setpic [start|absent|settings] [image_url_or_file_id]"""
    if len(message.command) < 3 or message.command[1].lower() not in {"start", "absent", "settings"}:
        await message.reply_text("Usage: `/setpic [start|absent|settings] [photo_url_or_file_id]`")
        return
    category = message.command[1].lower()
    media_ref = message.command[2].strip()
    db = mongo_manager.get_control_db()
    await db.config.update_one(
        {"_id": "rotational_pics"},
        {"$addToSet": {category: media_ref}},
        upsert=True,
    )
    await message.reply_text(f"🖼 Added image to **{category.upper()}** rotation pool.")


@app.on_message(filters.command(["ban", "unban"]) & filters.user(OWNER_ID))
async def ban_unban_command(client: Client, message: Message):
    if len(message.command) < 2:
        await message.reply_text(f"Usage: `/{message.command[0]} [user_id] [optional_reason]`")
        return
    target_uid = int(message.command[1])
    reason = " ".join(message.command[2:]) or "Policy violation"
    db = mongo_manager.get_control_db()
    if message.command[0].lower() == "ban":
        await db.bans.update_one(
            {"user_id": target_uid},
            {"$set": {"reason": reason, "banned_at": datetime.now(timezone.utc)}},
            upsert=True,
        )
        await message.reply_text(f"🚫 User `{target_uid}` banned globally across main and cloned bots.\nReason: `{reason}`")
    else:
        await db.bans.delete_one({"user_id": target_uid})
        await message.reply_text(f"✅ User `{target_uid}` unbanned across all instances.")


@app.on_message(filters.command("clone_status") & filters.user(OWNER_ID))
async def clone_status_command(client: Client, message: Message):
    db = mongo_manager.get_control_db()
    clones = await db.clones.find({}).to_list(length=100)
    if not clones:
        await message.reply_text("🤖 No cloned instances currently registered.")
        return
    lines = [f"🤖 **Active Bot Clones ({len(clones)})**\n"]
    for c in clones:
        lines.append(
            f"• **{c['bot_name']}** (@{c['bot_username']})\n"
            f"  ├ Owner: `{c['owner_name']}` (`{c['owner_id']}`)\n"
            f"  ├ Users: `{c.get('users_count', 0)}` | Served: `{c.get('files_served', 0)}`\n"
            f"  └ Created: `{c['created_at'].strftime('%Y-%m-%d')}`"
        )
    await message.reply_text("\n".join(lines))


@app.on_message(filters.command(["admin", "owner"]) & filters.user(OWNER_ID))
async def admin_dashboard_command(client: Client, message: Message):
    db = mongo_manager.get_control_db()
    settings = await db.config.find_one({"_id": "bot_settings"}) or {}
    mode = settings.get("access_mode", "TIME_PASS")
    brand = settings.get("brand_watermark", "@CinePulseMain")
    users_total = await db.users.count_documents({})
    clones_total = await db.clones.count_documents({})

    kb = InlineKeyboardMarkup([
        [
            InlineKeyboardButton(
                f"🔐 Mode: {'Time-Based Pass' if mode == 'TIME_PASS' else 'Per-Post Link'}",
                callback_data="admin_toggle_mode",
            ),
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
        f"🎛 **Centralized Admin Control Panel**\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"• **Registered Users:** `{users_total}`\n"
        f"• **Active Clones:** `{clones_total}`\n"
        f"• **Exclusive Shortener Mode:** `{mode}`\n"
        f"• **Document Watermark:** `{brand}`\n"
        f"• **MongoDB Shards Online:** `{len(mongo_manager.uris)}`"
    )
    settings_pic = await get_rotated_pic("settings")
    if settings_pic:
        await message.reply_photo(photo=settings_pic, caption=text, reply_markup=kb)
    else:
        await message.reply_text(text, reply_markup=kb)


# ---------------------------------------------------------------------
# MASTER DATABASE CHANNEL INGESTION & AUTOMATIC BACKUP MIRRORING
# ---------------------------------------------------------------------
@app.on_message(filters.chat(MASTER_DB_CHANNEL) & (filters.document | filters.video))
async def ingest_channel_media(client: Client, message: Message):
    media = message.document or message.video
    raw_caption = message.caption or getattr(media, "file_name", "") or "Untitled Media"
    db_ctrl = mongo_manager.get_control_db()
    settings = await db_ctrl.config.find_one({"_id": "bot_settings"}) or {}
    brand = settings.get("brand_watermark", "@CinePulseMain")

    clean_caption = sanitize_media_caption(raw_caption, brand)
    meta = extract_languages_and_meta(raw_caption)

    # Mirror automatically to Backup Database Channel
    backup_msg_id = None
    try:
        copied = await message.copy(chat_id=BACKUP_DB_CHANNEL, caption=clean_caption)
        backup_msg_id = copied.id
    except Exception as exc:
        logger.warning(f"Backup channel mirror warning: {exc}")

    write_db = await mongo_manager.get_active_write_db()
    await write_db.media_files.insert_one({
        "file_id": media.file_id,
        "file_unique_id": media.file_unique_id,
        "file_name": getattr(media, "file_name", "CinePulse_Media.mkv"),
        "file_size": getattr(media, "file_size", 0),
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
# AUTO-FILTER SEARCH ENGINE (AI SPELLCHECK + TMDB + SEND ALL + SEASONS)
# ---------------------------------------------------------------------
@app.on_message(filters.text & ~filters.command([
    "start", "set_db", "db_status", "add_user", "setpic",
    "ban", "unban", "clone_status", "admin", "owner"
]))
async def auto_filter_search_handler(client: Client, message: Message):
    user_id = message.from_user.id if message.from_user else 0
    if await is_user_banned(user_id):
        return

    raw_query = message.text.strip()
    if not raw_query or raw_query.lower() in CONVERSATIONAL_FILLER or len(raw_query) < 2:
        return

    db = mongo_manager.get_control_db()
    # Log non-filler query for Trending 'Top Search' metrics
    await db.search_metrics.update_one(
        {"query": raw_query.lower()},
        {"$inc": {"count": 1}, "$set": {"display_query": raw_query, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )

    # Check if user is Premium for Gemini AI Spelling Correction
    is_prem, _ = await is_user_premium(user_id)
    search_title = raw_query
    detected_lang = None
    ai_corrected_note = ""

    # Also detect explicit language in raw query
    for tok, lang_label in LANGUAGE_MAP.items():
        if re.search(rf"\b{re.escape(tok)}\b", raw_query.lower()):
            detected_lang = lang_label
            search_title = re.sub(rf"\b{re.escape(tok)}\b", "", search_title, flags=re.IGNORECASE).strip()
            break

    if is_prem:
        corrected, ai_lang = await gemini_correct_query(raw_query)
        if ai_lang and not detected_lang:
            detected_lang = ai_lang
        if corrected and corrected.lower() != search_title.lower():
            ai_corrected_note = f"✨ *Gemini AI Corrected:* `{raw_query}` → **{corrected}**\n"
            search_title = corrected

    files = await mongo_manager.search_across_all_shards(search_title, detected_lang)
    if not files:
        absent_pic = await get_rotated_pic("absent")
        support_kb = InlineKeyboardMarkup([
            [InlineKeyboardButton("🛟 Get Support / Request Upload", url=f"https://t.me/{SUPPORT_ID}")]
        ])
        absent_text = (
            f"{ai_corrected_note}"
            f"❌ **No Matching Files Found for:** `{search_title}`\n"
            f"• **Language Filter:** `{detected_lang or 'All Languages'}`\n"
            f"• **Tip:** Tap **Get Support** below to request direct upload from our archive team."
        )
        if absent_pic:
            await message.reply_photo(photo=absent_pic, caption=absent_text, reply_markup=support_kb)
        else:
            await message.reply_text(absent_text, reply_markup=support_kb)
        return

    # Fetch TMDB Enrichment
    tmdb = await fetch_tmdb_metadata(search_title)
    avail_langs = sorted({lang for f in files for lang in f.get("languages", ["English"])})
    seasons = sorted({f["season"] for f in files if f.get("season") is not None})
    episodes = sorted({f["episode"] for f in files if f.get("episode") is not None})

    # Build colorful Pyrogram inline buttons
    buttons: List[List[InlineKeyboardButton]] = []
    # Top Action Row: Send All Batching
    batch_key = f"batch_{files[0]['file_unique_id']}"
    buttons.append([
        InlineKeyboardButton(f"📦 Send All ({len(files)} Files)", callback_data=f"sendall:{search_title[:24]}"),
        InlineKeyboardButton(f"🌐 Audio: {', '.join(avail_langs[:3])}", callback_data="noop"),
    ])

    # Season & Episode selector rows for Web Series / Anime
    if seasons:
        season_row = [
            InlineKeyboardButton(f"📺 S{s:02d}", callback_data=f"season:{search_title[:20]}:{s}")
            for s in seasons[:5]
        ]
        buttons.append(season_row)
    if episodes:
        ep_row = [
            InlineKeyboardButton(f"🎞 E{e:02d}", callback_data=f"episode:{search_title[:20]}:{e}")
            for e in episodes[:5]
        ]
        buttons.append(ep_row)

    # Individual File Rows
    for f in files[:8]:
        size_mb = round(f.get("file_size", 0) / (1024 * 1024), 1)
        langs_short = "/".join(l[:3].upper() for l in f.get("languages", ["ENG"])[:2])
        se_tag = f"S{f['season']:02d}E{f['episode']:02d} " if f.get("season") and f.get("episode") else ""
        btn_label = f"📁 [{langs_short}] {se_tag}{f.get('quality', '1080p')} ({size_mb} MB)"
        buttons.append([InlineKeyboardButton(btn_label, callback_data=f"file:{f['file_unique_id']}")])

    header_title = tmdb["title"] if tmdb else search_title.title()
    release_str = tmdb["release_date"] if tmdb else "Archive Release"
    rating_str = f"⭐ {tmdb['rating']}/10" if tmdb and tmdb.get("rating") else "🎬 HD Archive"

    caption = (
        f"{ai_corrected_note}"
        f"🎬 **{header_title}** ({release_str}) · {rating_str}\n"
        f"🗣 **Available Audio:** `{', '.join(avail_langs)}`\n"
        f"📦 **Matched Documents:** `{len(files)} file(s)`\n"
        f"━━━━━━━━━━━━━━━━━━━━\n"
        f"Select an episode, language track, or tap **Send All** below:"
    )

    if tmdb and tmdb.get("poster_url"):
        await message.reply_photo(photo=tmdb["poster_url"], caption=caption, reply_markup=InlineKeyboardMarkup(buttons))
    else:
        await message.reply_text(caption, reply_markup=InlineKeyboardMarkup(buttons))


async def dispatch_watermarked_document(client: Client, chat_id: int, target_ref: str):
    """Transmits every file strictly as a Document appended with custom channel watermark."""
    db_ctrl = mongo_manager.get_control_db()
    settings = await db_ctrl.config.find_one({"_id": "bot_settings"}) or {}
    watermark = settings.get("brand_watermark", "@CinePulseMain")
    logo_tag = settings.get("brand_logo", "🏛 [CINEPULSE OFFICIAL]")

    # Search across shards for file_unique_id
    for uri in mongo_manager.uris:
        db = mongo_manager.clients[uri].get_default_database()
        doc = await db.media_files.find_one({"file_unique_id": target_ref})
        if doc:
            caption = (
                f"{logo_tag}\n"
                f"{doc['sanitized_caption']}\n"
                f"🗣 **Audio:** `{', '.join(doc.get('languages', ['English']))}`\n"
                f"🔖 **Watermark:** `{watermark}`"
            )
            await client.send_document(
                chat_id=chat_id,
                document=doc["file_id"],
                caption=caption,
                force_document=True,
            )
            return


# ---------------------------------------------------------------------
# WEEKLY SUNDAY AUTOMATED POLLING & MASTER LOCK CHANNEL FORWARDING
# ---------------------------------------------------------------------
async def run_sunday_trending_polls():
    """
    Runs automatically every Sunday at 10:00 UTC:
    1. Fetches top 5 trending queries (excluding conversational filler).
    2. Sends poll to user DMs and pins in connected groups.
    3. Aggregates and forwards poll to MASTER_LOCK_CHANNEL.
    """
    db = mongo_manager.get_control_db()
    top_Cursor = db.search_metrics.find({}).sort("count", -1).limit(5)
    top_items = await top_Cursor.to_list(length=5)
    options = [item.get("display_query", item["query"]).title() for item in top_items]
    if len(options) < 2:
        options = ["Kalki 2898 AD (Hindi)", "Mirzapur Season 3", "Solo Leveling (Anime)", "Pushpa 2: The Rule"]

    question = "📊 CinePulse Sunday Trending Poll: Which release should we prioritize in 4K IMAX this week?"
    try:
        lock_poll = await app.send_poll(
            chat_id=MASTER_LOCK_CHANNEL,
            question=question,
            options=options,
            is_anonymous=False,
        )
        logger.info(f"Sunday Trending Poll published to Master Lock Channel: {lock_poll.id}")
    except Exception as exc:
        logger.warning(f"Poll dispatch warning: {exc}")


# ---------------------------------------------------------------------
# RENDER HEALTH CHECK SERVER + ENTRYPOINT
# ---------------------------------------------------------------------
async def handle_healthz(request: web.Request) -> web.Response:
    shards = await mongo_manager.get_status_report()
    return web.json_response({"status": "ok", "service": "CinePulse-Pyrogram-Bot", "shards": len(shards)})


async def main():
    await mongo_manager.initialize()
    scheduler = AsyncIOScheduler(timezone="UTC")
    scheduler.add_job(run_sunday_trending_polls, "cron", day_of_week="sun", hour=10, minute=0)
    scheduler.start()

    web_app = web.Application()
    web_app.router.add_get("/", handle_healthz)
    web_app.router.add_get("/healthz", handle_healthz)
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", PORT)
    await site.start()
    logger.info(f"Render health server listening on port {PORT}")

    await app.start()
    logger.info("CinePulse Pyrogram Auto-Filter Bot started.")
    await asyncio.Event().wait()


if __name__ == "__main__":
    asyncio.run(main())
