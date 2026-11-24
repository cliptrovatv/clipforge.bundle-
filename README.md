# ClipForge

Your private clipping studio. **Milestone 1:** paste YouTube, Twitch or Kick
channels; whenever any of them goes live, the server records the full stream
at its original quality, many channels at once. Open it from your phone or
desktop.

Coming next (see `docs/specs/2026-11-24-clipforge-design.md`): campaigns,
viral-moment detection, 4K shorts, scheduling, 4K long videos.

## What you need

- A cloud server (VPS): **4 vCPU, 8 GB RAM, 500 GB+ disk**, Ubuntu 24.04.
  Records roughly 8–10 channels at the same time. A 1080p60 stream uses
  ~3 GB per hour; 4K streams ~10–20 GB per hour.
- A domain or subdomain (e.g. `clips.yourname.com`) pointing at the server's IP
  (an `A` record at your domain provider).

## Install (one time, ~15 minutes)

1. SSH into the server and install Docker:

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

2. Copy this folder to the server (or `git clone` it), then:

   ```bash
   cd clipforge
   cp .env.example .env
   nano .env
   ```

   Set `DOMAIN`, `APP_PASSWORD` (your login), and long random values for
   `POSTGRES_PASSWORD` and `SESSION_SECRET`:

   ```bash
   openssl rand -hex 32
   ```

3. Start everything:

   ```bash
   docker compose up -d --build
   ```

4. Open `https://<your domain>` and sign in. HTTPS is set up automatically.

## On your phone

Open the site in Safari (iPhone) or Chrome (Android) → Share / menu →
**Add to Home Screen**. It opens like an app.

## Using it

- **Streamers tab:** paste a channel link, e.g. `https://www.twitch.tv/name`,
  `https://kick.com/name`, `https://www.youtube.com/@name`. The app checks
  every channel about once a minute. When one goes live it shows a red
  **REC** and recording starts. More live than the limit (8 by default)?
  The extras show **waiting** and start as soon as a slot frees.
  The switch pauses a channel; ✕ removes it.
- **Recordings tab:** every stream, with its parts (10-minute pieces) to
  download. Files are the exact original stream, never re-encoded.
  Full recordings are deleted after 7 days (`RETENTION_DAYS`).
- If the disk gets below 20 GB free (`MIN_FREE_DISK_GB`), new recordings
  pause and a warning shows. Running ones continue.

## Maintenance

- **Update the recording tools** (do this if a platform stops recording;
  sites change often):

  ```bash
  docker compose build --pull && docker compose up -d
  ```

- **Logs:**

  ```bash
  docker compose logs -f worker
  ```

- **Settings:** edit `.env`, then run:

  ```bash
  docker compose up -d
  ```

## Development

```bash
npm install
docker compose -f docker-compose.dev.yml up -d
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/clipforge_test npm test
```

Needs `ffmpeg`, `yt-dlp` and `streamlink` on your PATH to run the worker locally
(`npm run worker`).
