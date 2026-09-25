# NEON ARENA

A five-round multiplayer mind battle for 2–8 players. The Node.js server owns room state, timers, challenges, scoring, reconnects, and rematches. Browsers connect over WebSockets; players do not need accounts.

## Local development

Requirements: Node.js 22 or newer and npm.

In PowerShell, from the project directory:

```powershell
npm.cmd ci
npm.cmd start
```

Open <http://localhost:3000>. To test two players on one computer, use two isolated browser profiles (or a private window), open the same URL in both, create a room in one, then join with its five-character code in the other. Keep the Node server running while you play.

The health endpoint is <http://localhost:3000/health>. It returns `{"ok":true}`. Active rooms are held in memory and are cleared when the server restarts. A disconnected player can reclaim their seat for 60 seconds while that server process remains alive.

## GitHub setup

Create an empty repository on GitHub named `neon-arena` (do not initialize it with a README, license, or `.gitignore`). Then run these commands from the project directory, replacing the username placeholder:

```powershell
git init
git add .gitignore README.md package.json package-lock.json render.yaml server.js public
git commit -m "Build NEON ARENA multiplayer game"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/neon-arena.git
git push -u origin main
```

If this directory is already a Git repository, skip `git init`; if `origin` already exists, use `git remote set-url origin https://github.com/<YOUR_GITHUB_USERNAME>/neon-arena.git` instead of `git remote add origin ...`. GitHub CLI or Git Credential Manager can handle authentication; do not put an access token in the remote URL.

## Render deployment

1. Sign in to Render and connect the GitHub account containing the repository.
2. Choose **New + → Blueprint**, select `neon-arena`, and choose the `main` branch. Render detects `render.yaml` at the repository root automatically. Review the Blueprint and apply it.
3. The Blueprint creates one Node web-service instance on Render's paid `0.5c-512mb` plan. A single instance is required because room state is in memory. Check Render's current pricing before applying the Blueprint; the lowest always-on web plan was listed at $7/month when this README was written. The free plan can spin down after inactivity and is intended for previews.
4. No application secrets or custom environment variables are required. Render provides `PORT`; locally the app defaults to port `3000`. The browser uses the current page origin to select `wss:` for HTTPS or `ws:` for HTTP.
5. After the first deploy succeeds, open the service URL shown by Render (typically `https://neon-arena.onrender.com`) and verify `https://<service-host>/health` returns `{"ok":true}`.
6. Open the service URL on two separate devices. Create a room on one, join from the other with its room code, then play through all rounds and rematch. Confirm both clients show **LIVE** and update together.

Render terminates HTTPS at its edge and supports WebSocket connections to web services. Do not set a separate static-site service: the Node service serves both the browser files and `/ws` from the same origin. Do not scale this in-memory version above one instance; that would require shared room storage and coordination.

## Match rules

1. **Flash:** react to the signal; fastest hits score 100, 70, and 45, then 20.
2. **Memory Grid:** repeat the shown tile sequence; each correct tile scores 25 (up to 150).
3. **Decoy:** find the symbol that differs; correct answers score 100.
4. **Risk:** choose safe (+40), or risky (+100 if lucky, −30 otherwise).
5. **Chaos Finale:** tap targets; each hit scores 40 after the ×2 multiplier.
