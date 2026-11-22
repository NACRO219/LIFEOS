# LIFEOS: Personal Operating System

An offline-first Android app (plus browser version) for university, programming, languages,
fitness, habits and long-term goals. Everything is stored **on the phone** in a private SQLite
database; no account, no internet and no computer are needed to use it.

## What's inside

| Area | Features |
|---|---|
| Dashboard | Time-based greeting, date, daily completion % (real data), level/XP, streak, 3 priorities, today's tasks, GPA, university/programming/language/fitness/focus progress, daily challenges, upcoming deadlines, next reminder |
| Tasks & planner | Title, description, category, priority, deadline, planned day, estimate, status, course, project, recurrence, XP. Daily time-blocked plans around fixed commitments, realistic capacity (energy-based buffer), overload detection, rebalance proposals that **you confirm** (nothing is ever deleted), 3 priorities per day |
| Coach | Morning check-in (time, commitments, energy, priorities → plan) and 10-question evening review. Balanced, honest messages based only on what you confirm |
| University | Courses (code, credits, teacher, semester, colour, notes), weighted assessments, exam dates and countdown, assignments, lectures and revision logs, spaced revision plans, calendar, weekly study goal |
| GPA | Configurable grading scale, course grades, semester and cumulative GPA, past-semester records, what-if simulation, required average for a target GPA, required % on remaining work |
| Programming | Editable CS roadmap (Python, fundamentals, data structures, algorithms, discrete maths, OOP, databases, Git, projects): lessons, resources, notes, review dates; coding exercise log |
| Languages | Chinese / English / French: timed practice sessions per skill, daily goals and streaks, vocabulary with Leitner spaced repetition, HSK levels, tone quiz (pinyin), progress charts |
| Fitness | Workouts (exercises, sets, reps, weight), plans by weekday, attendance, body measurements and weight chart, automatic personal records |
| Habits & goals | Habit streaks with weekly targets, long-term goals with progress |
| Focus | Pomodoro (focus / short / long break, custom duration, pause/resume/reset), accurate in the background, end notification, history and statistics |
| Gamification | XP with de-duplicated events, levels, streaks, 23 achievements with unlock dates, daily and weekly challenges, XP history |
| Settings | Name, timezone, theme, notification toggles and times, focus durations, daily/weekly goals, XP values, privacy, export/import/reset, optional server backup |

### XP rules
University task +20 · programming exercise +30 · language lesson +20 · all daily priorities +50 ·
evening review +10. Each event can only be awarded once; undoing it (reopening a task,
deleting an exercise) removes its XP. Values are editable in Settings.

## Project structure
```
LIFEOS/
  frontend/            React + TypeScript + Vite app, packaged with Capacitor
    src/db/            storage backends (SQLite / IndexedDB / memory), store, migrations, seed data
    src/lib/           domain logic: planner, GPA, XP, stats, coach, spaced repetition, timer (+ tests)
    src/native/        Android integrations: notifications, back button, system bars, files
    src/pages/         screens
    android/           native Android project (Capacitor)
    assets/            icon and splash sources
  backend/             optional FastAPI server (original API + phone backup endpoint)
  scripts/             build-apk.ps1, create-keystore.ps1, setup-android-sdk.sh
```

## Build the Android app (Windows)

Prerequisites (already installed on this PC): Node.js, JDK 21, Android SDK in `D:\Android\Sdk`.
Android Studio is **not** required.

```powershell
cd C:\Users\Admin\Desktop\LIFEOS
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1            # debug APK  -> LIFEOS-debug.apk
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release   # signed APK -> LIFEOS-release.apk
powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 -Release -Install   # build + install over USB
```

### Install on your phone
**Option A, USB (recommended):**
1. Phone: Settings → About phone → tap **Build number** 7 times (enables Developer options).
2. Settings → System → Developer options → turn on **USB debugging**.
3. Connect the phone with a USB data cable; on the phone tap **Allow** on the "Allow USB debugging?" prompt.
4. `D:\Android\Sdk\platform-tools\adb.exe devices` should list your phone as `device`.
5. `D:\Android\Sdk\platform-tools\adb.exe install -r C:\Users\Admin\Desktop\LIFEOS\LIFEOS-release.apk`

**Option B, copy the file:** copy `LIFEOS-release.apk` to the phone (USB file transfer, Google Drive,
email to yourself…), open it in the Files app, and allow "Install unknown apps" for that app when asked.

### First launch
Allow notifications when asked. Then send a test notification from **Settings → Notifications → Test**.
If your phone is a Xiaomi/Huawei/Samsung/OnePlus model, also set **Settings → Apps → LIFEOS → Battery → Unrestricted**.

## Updating the app later without losing data
1. Increase `versionCode` (and `versionName`) in `frontend/android/app/build.gradle`.
2. Build with `-Release` (same signing key!) and install with `adb install -r` or by opening the APK.
Android replaces the app and keeps its database. Never uninstall first, because uninstalling deletes the app's data.
Export a backup (Settings → Data → Export) before big updates anyway.

## Debug vs release APK
* **Debug**: for development; can be inspected with Chrome DevTools (`chrome://inspect`), slightly slower.
* **Release**: optimized, not debuggable, signed with *your* private key. Use this one daily.
Both builds here are signed with the same release key when `android/keystore.properties` exists, so you
can switch between them without uninstalling.

### Signing key
`scripts/create-keystore.ps1` creates `D:\LIFEOS-keys\lifeos-release.jks` and the git-ignored
`frontend/android/keystore.properties`. **Back up both** (USB drive or password manager). Without
the key you cannot install updates over the existing app.

## Notifications: how they work and their limits
* Native Android notifications (AlarmManager via Capacitor Local Notifications); they fire with
  the app closed and the phone locked. They are **not** browser notifications.
* Default 07:00 morning plan and 21:30 evening check-in; toggles and times in Settings; they follow the
  device timezone (or the timezone chosen in Settings). Tapping one opens the matching screen.
* Scheduled as a rolling window of the next 30 days of exact, Doze-allowed one-shot alarms, refreshed
  every time the app opens. Fixed IDs prevent duplicates. After a reboot the plugin restores them.
* Android 13+: permission is requested on first launch. Exact timing uses `USE_EXACT_ALARM` (granted
  automatically for sideloaded apps on Android 13+); on Android 12 you may need to allow
  "Alarms & reminders" (Settings shows a button).
* Limits: some manufacturers kill background apps aggressively (set battery to Unrestricted).
  If you don't open LIFEOS for 30+ days, reminders stop until you open it again. Force-stopping the app
  from Android settings cancels its alarms until the next launch (Android rule).

## Data, backup and privacy
* Phone: SQLite database in the app's private storage (also included in Android's own device backup).
* Browser version (`npm run dev`): IndexedDB.
* Export/Import: Settings → Data. Backups are validated before restore; secrets (sync token) are never exported.
* Optional server backup: run the backend with `LIFEOS_SYNC_TOKEN` set, then enter the server URL and
  token in Settings → Server backup. The app never needs it.

## Development
```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173 (browser version, IndexedDB storage)
npm test           # unit tests (vitest)
npm run typecheck
```

### Backend (optional)
```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
Copy-Item .env.example .env      # set LIFEOS_SYNC_TOKEN to enable phone backups
pytest                           # tests
uvicorn app.main:app --host 0.0.0.0 --port 8000   # 0.0.0.0 so the phone can reach it over Wi-Fi
```
API docs: http://127.0.0.1:8000/docs. The database is migrated automatically on start (a timestamped
copy of `lifeos.db` is made before any migration).

## Known limitations
* Interface language is English only.
* Server backup is whole-snapshot upload/restore (last write wins), not live multi-device sync.
* The Music page opens your saved playlist links in Spotify; it doesn't control playback.
  (The original starter's Spotify web login was broken, and web OAuth can't redirect into an APK.)
