# LIFEOS — Personal Development OS

A runnable starter application for Windows with:
- Dashboard and daily tasks
- Courses and credit tracking
- GPA calculator (credit-weighted)
- Daily check-ins and XP
- Study / coding / gym / relax focus modes
- Browser reminder notifications (requires browser permission and the app to be open)
- Spotify account connection using OAuth PKCE (requires your own Spotify Developer app credentials)

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Python + FastAPI
- Database: SQLite for easy local development (can later migrate to PostgreSQL)

## 1. Requirements
- Python 3.11+
- Node.js 20+
- npm

## 2. Start the backend (Windows PowerShell)
```powershell
cd LIFEOS\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload
```
Backend: http://127.0.0.1:8000
API docs: http://127.0.0.1:8000/docs

## 3. Start the frontend (new PowerShell window)
```powershell
cd LIFEOS\frontend
npm install
Copy-Item .env.example .env
npm run dev
```
Frontend: http://localhost:5173

## 4. Spotify setup
1. Create an app at https://developer.spotify.com/dashboard
2. Add this Redirect URI exactly: `http://localhost:5173/spotify-callback`
3. Copy the Spotify Client ID into `frontend/.env` as `VITE_SPOTIFY_CLIENT_ID=...`
4. Save and restart the frontend.
5. Connect Spotify from the Music section.

Spotify features depend on your account, device, app approval and current Spotify API policies. This starter uses PKCE and does not ask for or store your Spotify password. Playback control may require Premium and a compatible active device. If playback isn't available, use the Spotify open-playlist link.

## Important limitations in this starter
- This is a local MVP, not a production-ready multi-user service.
- There is no account login yet; the local database is for one local user.
- Reminders use browser notifications while the app is open. Reliable background push notifications require HTTPS, a service worker, push subscription storage and a push delivery service.
- AI coaching is represented by deterministic coaching prompts; connect an AI provider later using a server-side API key.
- Spotify token is held in sessionStorage in the browser for this starter. Do not deploy publicly without reviewing token storage, security, HTTPS, authentication, rate limits and Spotify policy requirements.
- Database backups are your responsibility. Back up `backend/lifeos.db`.

## Project structure
```
LIFEOS/
  backend/
    app/
      __init__.py
      database.py
      models.py
      schemas.py
      main.py
    requirements.txt
    .env.example
  frontend/
    src/
      main.tsx
      App.tsx
      api.ts
      spotify.ts
      styles.css
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    .env.example
```
