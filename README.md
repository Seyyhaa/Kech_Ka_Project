# 🤖 Telegram Task Manager Bot

A full-featured personal task manager Telegram bot built with **Node.js**, **Express.js**, **grammy**, and **PostgreSQL**. Manage your daily tasks, set reminders, and stay organized — all inside Telegram.

---

## ✨ Features

| Feature | Details |
|---------|---------|
| 📝 **Task Management** | Add, view, complete, edit, delete tasks with inline buttons |
| 📅 **Due Dates** | Natural language parsing (`tomorrow 5pm`, `next Monday`) |
| ⏰ **Reminders** | Per-task reminders sent at the exact time |
| 🏷️ **Tags & Filtering** | `#work`, `#home`, `#study` with `/list #tag` |
| 🔴 **Priorities** | Low / Medium / High with emoji indicators |
| 🔁 **Recurring Tasks** | Daily / weekly / monthly recurrence |
| ☀️ **Daily Summary** | Personalized morning briefing at your chosen time |
| 📊 **Statistics** | Weekly completion rate and all-time stats |
| 🔐 **Registration Modes** | Open, invite-code, or admin-approval |
| 👤 **Admin Panel** | User management, approval, blocking, invite codes |
| 🌍 **Timezones** | Full IANA timezone support per user |

---

## 🏗️ Project Structure

```
telegram-task-manager-bot/
├── src/
│   ├── app.js                    # Entry point: Express + bot + cron startup
│   ├── config/
│   │   ├── index.js              # Env config (single source of truth)
│   │   └── db.js                 # pg.Pool singleton, withTransaction helper
│   ├── bot/
│   │   ├── index.js              # Bot factory: sessions + middleware + handlers
│   │   ├── keyboards.js          # All inline keyboard builders
│   │   ├── sessionStore.js       # grammy session storage → PostgreSQL
│   │   └── commands/
│   │       ├── start.js          # /start, /register, /help + registration flow
│   │       ├── tasks.js          # /add, /list, /done, /edit, /delete, /remind, /stats
│   │       ├── user.js           # /profile, /settings, /unregister
│   │       └── admin.js          # /admin_* commands
│   ├── services/
│   │   ├── registrationService.js # Multi-step registration logic
│   │   ├── taskService.js         # Task CRUD + NLP date parsing
│   │   └── adminService.js        # Admin operations
│   ├── repositories/
│   │   ├── userRepository.js      # SQL for users table
│   │   ├── taskRepository.js      # SQL for tasks + tags (user-scoped)
│   │   ├── reminderRepository.js  # SQL for reminders (SKIP LOCKED)
│   │   └── inviteCodeRepository.js # SQL for invite_codes
│   ├── middleware/
│   │   ├── accessControl.js       # grammy middleware: status-based gating
│   │   ├── webhookGuard.js        # Validates X-Telegram-Bot-Api-Secret-Token
│   │   └── errorHandler.js        # Centralized error logging + user-friendly replies
│   ├── routes/
│   │   ├── webhook.js             # POST /webhook
│   │   └── health.js              # GET /health
│   ├── jobs/
│   │   └── cronJobs.js            # Reminder job + daily summary job
│   ├── utils/
│   │   ├── logger.js              # Pino logger (JSON prod, pretty dev)
│   │   ├── dateParser.js          # chrono-node + luxon date utilities
│   │   ├── formatters.js          # Telegram HTML message formatters
│   │   └── timezone.js            # IANA timezone validation + common list
│   └── db/
│       ├── migrations/
│       │   └── 001_initial_schema.sql  # Full schema
│       └── seeds/
│           └── 001_seed.sql           # Dev seed data
├── migrate.js                    # Custom SQL migration runner
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

---

## 🚀 Quick Start

### Prerequisites
- Node.js ≥ 18
- PostgreSQL 14+ (or Docker)
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### 1. Create Your Bot via @BotFather

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Choose a name: `My Task Manager`
4. Choose a username: `my_taskmanager_bot`
5. Copy the **bot token** (looks like `123456789:ABCdef...`)

### 2. Clone & Install

```bash
git clone <your-repo>
cd telegram-task-manager-bot
npm install
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
BOT_TOKEN=your_bot_token_here
WEBHOOK_URL=https://your-domain.com   # Or your ngrok URL
WEBHOOK_SECRET=any_random_string_32chars
DATABASE_URL=postgresql://postgres:password@localhost:5432/taskbot
PORT=3000
REGISTRATION_MODE=open
ADMIN_CHAT_IDS=your_telegram_chat_id
```

> 💡 To find your Telegram chat ID: message [@userinfobot](https://t.me/userinfobot)

### 4. Start PostgreSQL

**With Docker (recommended):**
```bash
docker compose up postgres -d
```

**With existing PostgreSQL:**
```bash
createdb taskbot
```

### 5. Run Migrations

```bash
npm run migrate
```

Output:
```
  ✅ Applied: 001_initial_schema.sql
✅ Applied 1 migration(s).
```

### 6. Set Up Public URL with ngrok (for local dev)

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 3000
```

Copy the `https://xxxx.ngrok-free.app` URL and put it in `.env` as `WEBHOOK_URL`.

### 7. Start the Bot

```bash
# Development (auto-reload)
npm run dev

# Production
npm start
```

Output:
```
🚀 Server listening on port 3000
📡 Webhook endpoint: POST /webhook
❤️  Health check: GET /health
```

The bot automatically registers the webhook with Telegram on startup.

### 8. Test It

Open Telegram, find your bot, send `/start`.

---

## 📱 Example Conversations

### Registration — Open Mode

```
User:  /start
Bot:   👋 Welcome to Task Manager Bot!
       [📝 Register Now]

User:  [clicks Register Now]
Bot:   👋 Welcome, Alice!
       Step 1/4: Your display name
       Your Telegram name is Alice. Keep it?
       [✅ Keep my name] [✏️ Change name]

User:  [clicks Keep my name]
Bot:   Step 2/4: Choose your timezone
       [🌏 Bangkok] [🌏 Singapore] [🌏 Tokyo]
       [🌍 London] [🌍 Paris] [🌎 New York]
       [⌨️ Type a city / IANA zone]

User:  [clicks Bangkok]
Bot:   Step 3/4: Daily summary time
       [06:00] [07:00] [08:00] [09:00] ...

User:  [clicks 08:00]
Bot:   Step 4/4: Terms & Privacy
       [✅ I Agree]

User:  [clicks I Agree]
Bot:   🎉 Registration Complete! Welcome, Alice!
       ...quick-start guide...
```

### Registration — Invite Mode

```
User:  /register TESTCODE123
Bot:   ✅ Valid invite code! Starting registration...
       (proceeds through steps above)
```

### Registration — Approval Mode

```
User:  [completes all 4 steps]
Bot:   ⏳ Registration Submitted! Awaiting admin approval.

Admin: 🔔 New Registration Request
       👤 Name: Alice | Chat ID: 987654321
       [✅ Approve] [❌ Reject]

Admin: [clicks Approve]
Bot→Alice: 🎉 Registration Approved! Welcome!
```

### Blocked Unregistered User

```
User:  /add Buy milk
Bot:   👋 Welcome! You need to register before using this bot.
       [📝 Register Now]
```

### Normal Task Usage

```
User:  /add Buy groceries | tomorrow 5pm | high #shopping
Bot:   ✅ Task added!
       ✅ 🔴 #42 Buy groceries
          📅 Mon, Oct 27 2026 17:00 (in 26 hours)
          🏷️ #shopping
       [✅ Done] [✏️ Edit] [🗑️ Delete]

User:  /list
Bot:   📋 Your Tasks (3 total, page 1/1)
       ⏳ 🔴 #42 Buy groceries
          📅 Mon, Oct 27 17:00
       ⏳ 🟡 #41 Read a book
       ⏳ 🟢 #40 Exercise
       [⬅️ Prev] [Next ➡️]

User:  /remind 42 tomorrow 4pm
Bot:   ⏰ Reminder set!
       📌 Task: Buy groceries
       🕐 Remind at: Mon, Oct 27 2026 16:00

User:  /done 42
Bot:   ✅ Task #42 marked as done! Buy groceries

User:  /stats
Bot:   📊 Your Week in Review
       Tasks this week: 5
       ✅ Completed: 3
       ⏳ Pending: 2
       🔥 Completion rate: 60%
```

### Admin Approval Flow

```
Admin: /admin_users
Bot:   👥 Users (3 total, page 1/1)
       ✅ Alice (987654321) — user — active
       ⏳ Bob (111222333) — user — pending
       ✅ Admin (123456789) — admin — active

Admin: /admin_approve 111222333
Bot:   ✅ User Bob (111222333) approved!
Bot→Bob: 🎉 Registration Approved! Welcome!

Admin: /admin_block 987654321
Bot:   🚫 User Alice (987654321) blocked.
```

### /unregister

```
User:  /unregister
Bot:   ⚠️ Delete Account
       This will permanently delete your profile, tasks, reminders, and tags.
       [🗑️ Yes, Delete My Account] [❌ Cancel]

User:  [clicks Yes]
Bot:   ✅ Account Deleted. All your data has been removed.
```

---

## ⚙️ Registration Modes

Set `REGISTRATION_MODE` in `.env`:

| Mode | Behavior |
|------|---------|
| `open` | Anyone can register immediately |
| `invite` | Requires `/register <code>` with a valid invite code |
| `approval` | Registration creates a pending user; admin must approve |

### Generate Invite Codes (invite mode)

As an admin:
```
/admin_invite
```
Bot returns a code to share. Recipients use:
```
/register XXXXXXXXXXX
```

---

## 🛠️ Admin Commands

All admin commands require your chat ID to be in `ADMIN_CHAT_IDS`.

| Command | Description |
|---------|-------------|
| `/admin_users` | Paginated list of all users |
| `/admin_approve <chat_id>` | Approve a pending user |
| `/admin_block <chat_id>` | Block an active user |
| `/admin_unblock <chat_id>` | Unblock a blocked user |
| `/admin_invite` | Generate a single-use invite code |
| `/admin_stats` | Total users, active users, task counts |

---

## 🗄️ Database Schema

See [`src/db/migrations/001_initial_schema.sql`](src/db/migrations/001_initial_schema.sql) for the full schema.

Key design decisions:
- All foreign keys use `ON DELETE CASCADE` — deleting a user wipes all their data
- `tasks.status` uses a soft-delete (`'deleted'`) rather than hard-deletes, preserving stats
- `reminders` uses `FOR UPDATE SKIP LOCKED` in the cron job to prevent duplicate sends
- Session state is stored as JSONB in `bot_sessions`, keyed by `chat_id`

---

## 🚢 Deployment

### Docker Compose (simplest)

```bash
# Fill in your .env values
docker compose up --build -d
```

The bot service runs migrations automatically before starting.

### Render.com

1. Push code to GitHub
2. Create a new **Web Service** on Render
3. Connect your repository
4. Set environment variables in the Render dashboard
5. Set **Start Command**: `node migrate.js && node src/app.js`
6. Add a **PostgreSQL** database in Render and copy the `DATABASE_URL`
7. Use the Render service URL as `WEBHOOK_URL`

### Railway

1. Create a new project on [Railway](https://railway.app)
2. Add a **PostgreSQL** plugin
3. Deploy from GitHub
4. Set environment variables in Railway dashboard
5. Use the Railway public URL as `WEBHOOK_URL`

### AWS EC2 + Amazon RDS

**RDS Setup:**
```bash
# Create PostgreSQL RDS instance (db.t3.micro for small scale)
aws rds create-db-instance \
  --db-instance-identifier taskbot-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 16 \
  --master-username postgres \
  --master-user-password yourpassword \
  --allocated-storage 20
```

**EC2 Setup:**
```bash
# On EC2 (Ubuntu 22.04)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

git clone <your-repo>
cd telegram-task-manager-bot
npm install --production

# Install PM2 for process management
npm install -g pm2

# Set up environment
cp .env.example .env
nano .env  # Fill in values

# Run migrations
npm run migrate

# Start with PM2
pm2 start src/app.js --name taskbot
pm2 save
pm2 startup
```

**HTTPS with Nginx + Certbot:**
```nginx
server {
    server_name your-domain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
```bash
sudo certbot --nginx -d your-domain.com
```

---

## 💡 Future Improvements

1. 🎙️ **Voice-to-Task** — Send a voice note; Whisper API transcribes it and creates a task automatically
2. 📅 **Google Calendar Sync** — Two-way OAuth2 sync; tasks become calendar events and vice versa
3. 🌐 **Multi-language Support** — i18n with `i18next`; detect from `ctx.from.language_code`
4. 👥 **Shared / Collaborative Lists** — Share a tag namespace between users; great for families or teams
5. 📊 **Analytics Web Dashboard** — A small web UI showing productivity trends, streaks, heatmaps

---

## 🔒 Security Notes

- Webhook updates are validated via `X-Telegram-Bot-Api-Secret-Token` header
- All SQL queries use parameterized `$1, $2, ...` — no SQL injection possible
- The bot token is never logged (pino redact config)
- Rate limiting on all endpoints (global + per-webhook)
- Non-root Docker user
- Graceful shutdown closes the DB pool on `SIGTERM`

---

## 🧪 Development Tips

```bash
# Check health endpoint
curl http://localhost:3000/health

# Watch logs
npm run dev

# Apply seed data (dev only)
psql $DATABASE_URL -f src/db/seeds/001_seed.sql

# Test webhook locally with ngrok
ngrok http 3000
# Then update WEBHOOK_URL in .env and restart
```
