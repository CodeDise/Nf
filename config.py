# ============================================================
#  Nohara Filter Bot - CONFIG  (fill the values between quotes)
#  Keep your GitHub repo PRIVATE - this file contains secrets!
# ============================================================

# ---------- REQUIRED ----------
API_ID = ""              # from https://my.telegram.org  (numbers only)
API_HASH = ""            # from https://my.telegram.org
BOT_TOKEN = ""           # from @BotFather
OWNER_ID = ""            # your Telegram numeric user id
PRIMARY_MONGO_URI = ""   # mongodb+srv://user:pass@cluster.mongodb.net/nohara_filter

# ---------- CHANNELS (optional, like -1001234567890) ----------
MASTER_DB_CHANNEL = ""   # files get indexed from here + clone backups are posted here
BACKUP_DB_CHANNEL = ""
MASTER_LOG_CHANNEL = ""
MASTER_LOCK_CHANNEL = "" # weekly poll goes here

# ---------- OPTIONAL ----------
TMDB_API_KEY = ""
GEMINI_API_KEY = ""
GEMINI_MODEL = "gemini-2.5-flash"
SUPPORT_ID = "NoharaSupport"
BRAND_CHANNEL = "@NoharaFilterBot"
DB_NAME = "nohara_filter"
PORT = "8080"
