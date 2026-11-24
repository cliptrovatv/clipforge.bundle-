# ClipForge M1 — Channel Watch List + Multi-Channel Auto-Recording — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste a YouTube/Twitch/Kick channel into a phone-friendly web app; whenever any watched channel goes live, a worker records the full stream at original quality, many channels at once, and the recordings appear in the app.

**Architecture:** One TypeScript package. A Next.js (App Router) web app for the UI and API; a separate long-running worker process (`src/worker/main.ts`) runs a supervisor loop that checks channels for live status with `yt-dlp`, and records with `streamlink | ffmpeg` (stream copy, no re-encode, 10-min `.ts` segments). Postgres via Drizzle is the shared state. All external processes go through an injectable runner so logic is unit-tested without network.

**Tech Stack:** Node 22, TypeScript, Next.js 15, Drizzle ORM + Postgres 16, Vitest, `yt-dlp`, `streamlink` (≥ 6.8, has Kick plugin), `ffmpeg`, Docker Compose, Caddy.

**Spec:** `docs/specs/2026-11-24-clipforge-design.md`

## Global Constraints

- Recordings are stored at exact original quality: streamlink quality `best`, ffmpeg `-c copy`. Never re-encode, never downscale.
- Segment length 600 s, MPEG-TS (`.ts`) so a crash loses at most the open segment.
- Defaults (env-overridable): `MAX_CONCURRENT_RECORDINGS=8`, `CHECK_INTERVAL_SECONDS=60`, `RETENTION_DAYS=7`, `MIN_FREE_DISK_GB=20`, `DATA_DIR=/data`.
- Platforms: exactly `youtube | twitch | kick`.
- Single user: one password from env `APP_PASSWORD`; signed session cookie (`SESSION_SECRET`).
- UI mobile-first; must work at 375 px width with no horizontal scroll.
- Secrets only via env; never committed.

## Review Focus

1. Same channel pasted in two forms (`youtube.com/@x`, `@x`-style URL with `/live`, mixed case) → one channel row, never two recorders. *(Task 2 + Task 3 test)*
2. Recorder dies mid-stream (network blip) while the channel is still live → a new part starts on the next tick; earlier segments are kept. *(Task 6 test)*
3. More channels live than the concurrency cap → extras show as `waiting` and start as soon as a slot frees. *(Task 6 test)*
4. Disk nearly full → no new recordings start, running ones continue, UI shows a warning. *(Task 6 test)*
5. Worker restarts while rows say `recording` → on boot they're marked `interrupted`, then re-recorded if still live. *(Task 6 test)*

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.example`, `.gitignore`, `docker-compose.dev.yml` (postgres only), `src/config.ts`, `tests/config.test.ts`, `app/layout.tsx`, `app/page.tsx`

**Interfaces:**
- Produces: `loadConfig(env = process.env): Config` with `{ databaseUrl, dataDir, maxConcurrentRecordings, checkIntervalSeconds, retentionDays, minFreeDiskGb, appPassword, sessionSecret }`. Throws `Error("Missing env: APP_PASSWORD")` style messages for required vars (`DATABASE_URL`, `APP_PASSWORD`, `SESSION_SECRET`).

- [ ] **Step 1:** `npm init`, install `next react react-dom drizzle-orm pg zod` and dev `typescript vitest @types/node @types/react @types/pg drizzle-kit tsx`. Scripts: `dev`, `build`, `start`, `worker` (`tsx src/worker/main.ts`), `test` (`vitest run`), `db:push`.
- [ ] **Step 2: Write failing test** `tests/config.test.ts`:
  - `loadConfig({DATABASE_URL:'x',APP_PASSWORD:'p',SESSION_SECRET:'s'})` → `maxConcurrentRecordings === 8`, `checkIntervalSeconds === 60`, `retentionDays === 7`, `minFreeDiskGb === 20`, `dataDir === '/data'`.
  - `MAX_CONCURRENT_RECORDINGS: '12'` → `12`.
  - Missing `APP_PASSWORD` → throws `/APP_PASSWORD/`.
- [ ] **Step 3:** Run `npm test` → FAIL (module not found).
- [ ] **Step 4:** Implement `src/config.ts` with zod.
- [ ] **Step 5:** Run `npm test` → PASS; `npm run build` → succeeds.
- [ ] **Step 6:** Commit `feat: scaffold project and config`.

### Task 2: Channel resolver

**Files:**
- Create: `src/channels/resolve.ts`, `tests/channels/resolve.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Platform = 'youtube' | 'twitch' | 'kick';
  interface ResolvedChannel { platform: Platform; handle: string; liveUrl: string; key: string }
  function resolveChannel(input: string): ResolvedChannel // throws ChannelInputError
  class ChannelInputError extends Error {}
  ```
  `handle` is lowercased; `key` = `${platform}:${handle}` (dedupe key). `liveUrl`: youtube `https://www.youtube.com/@{handle}/live` (or `/channel/{id}/live` for `UC…` ids, id case preserved), twitch `https://www.twitch.tv/{handle}`, kick `https://kick.com/{handle}`.

- [ ] **Step 1: Write failing tests** — table test, each input → `key`:
  - `https://www.youtube.com/@IShowSpeed` → `youtube:ishowspeed`
  - `youtube.com/@ishowspeed/live` → `youtube:ishowspeed`
  - `https://m.youtube.com/@IShowSpeed/videos?x=1` → `youtube:ishowspeed`
  - `https://www.youtube.com/channel/UCWsDFcIhY2DBi3GB5uykGXA` → `youtube:UCWsDFcIhY2DBi3GB5uykGXA` (id not lowercased), liveUrl ends `/channel/UCWsDFcIhY2DBi3GB5uykGXA/live`
  - `https://twitch.tv/xQc` and `twitch.tv/xqc/videos` → `twitch:xqc`
  - `https://kick.com/AdinRoss` → `kick:adinross`
  - `  https://kick.com/adinross/  ` (whitespace, trailing slash) → `kick:adinross`
  - `xqc` (bare name), `https://example.com/x`, `https://www.youtube.com/watch?v=abc` → throw `ChannelInputError` with message containing `channel link`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with `new URL()` (prepend `https://` if no scheme); hosts `youtube.com|www.|m.`, `twitch.tv|www.|m.`, `kick.com|www.`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: channel link resolver`.

### Task 3: Database schema + repository

**Files:**
- Create: `src/db/schema.ts`, `src/db/client.ts`, `src/db/repo.ts`, `drizzle.config.ts`, `tests/db/repo.test.ts`, `tests/helpers/db.ts`

**Interfaces:**
- Consumes: `ResolvedChannel` (Task 2).
- Produces tables:
  - `channels`: `id serial`, `platform text`, `handle text`, `key text unique`, `liveUrl text`, `displayName text null`, `enabled bool default true`, `createdAt timestamptz`.
  - `recordings`: `id serial`, `channelId int fk cascade`, `title text null`, `status text` (`recording|done|failed|interrupted`), `dir text`, `bytes bigint default 0`, `startedAt`, `endedAt null`, `error text null`.
- Produces `Repo` (constructed `createRepo(db)`):
  ```ts
  addChannel(c: ResolvedChannel): Promise<{ channel: Channel; created: boolean }>  // upsert on key
  listChannels(): Promise<Channel[]>
  setChannelEnabled(id: number, enabled: boolean): Promise<void>
  deleteChannel(id: number): Promise<void>
  startRecording(channelId: number, dir: string, title: string | null): Promise<Recording>
  finishRecording(id: number, status: 'done'|'failed'|'interrupted', bytes: number, error?: string): Promise<void>
  activeRecordings(): Promise<Recording[]>        // status = 'recording'
  listRecordings(limit?: number): Promise<(Recording & { channel: Channel })[]>  // newest first
  recordingsOlderThan(cutoff: Date): Promise<Recording[]>  // ended, endedAt < cutoff
  deleteRecording(id: number): Promise<void>
  ```

- [ ] **Step 1:** `tests/helpers/db.ts` — connects to `TEST_DATABASE_URL` (from `docker-compose.dev.yml`), pushes schema, truncates tables per test.
- [ ] **Step 2: Write failing tests:**
  - `addChannel` twice with same key → second returns `created:false`, `listChannels().length === 1` (Review Focus #1).
  - start → `activeRecordings()` has 1; finish `'done'` with bytes 123 → 0 active, row has `bytes 123`, `endedAt` set.
  - `deleteChannel` cascades recordings.
  - `recordingsOlderThan` returns only ended rows before cutoff, never `recording` rows.
- [ ] **Step 3:** `docker compose -f docker-compose.dev.yml up -d`; run → FAIL.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run → PASS. Commit `feat: db schema and repo`.

### Task 4: Process runner + live checker

**Files:**
- Create: `src/proc/runner.ts`, `src/live/check.ts`, `tests/live/check.test.ts`, `tests/fixtures/ytdlp-live.json`, `tests/fixtures/ytdlp-notlive.txt`

**Interfaces:**
- Produces:
  ```ts
  interface RunResult { code: number; stdout: string; stderr: string }
  type Run = (cmd: string, args: string[], opts?: { timeoutMs?: number }) => Promise<RunResult>
  const realRun: Run   // child_process.execFile, never throws on non-zero exit
  interface LiveStatus { live: boolean; title: string | null; displayName: string | null }
  function checkLive(liveUrl: string, run?: Run): Promise<LiveStatus>
  ```
  Command: `yt-dlp --dump-single-json --no-download --no-warnings --skip-download <liveUrl>`, timeout 45 s.

- [ ] **Step 1: Write failing tests** with a fake `Run`:
  - stdout = fixture with `"is_live": true, "title": "...", "uploader": "xQc"` → `{live:true, title, displayName:'xQc'}`.
  - `live_status: "is_upcoming"` → `live:false`.
  - exit code 1, stderr contains `is not currently live` / `not currently live` / `will begin in` / `This live event will begin` / `Offline` → `live:false`, no throw.
  - exit code 1 with other stderr (e.g. `HTTP Error 429`) → throws `LiveCheckError` (supervisor logs and retries next tick; doesn't mark offline).
  - the args passed include the liveUrl and `--dump-single-json`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: live status checker`.

### Task 5: Recorder

**Files:**
- Create: `src/record/recorder.ts`, `tests/record/recorder.test.ts`

**Interfaces:**
- Produces:
  ```ts
  function buildStreamlinkArgs(liveUrl: string): string[]
  function buildFfmpegArgs(outDir: string): string[]
  interface RecorderHandle { readonly done: Promise<{ code: number; stderrTail: string }>; stop(): void; bytesWritten(): Promise<number> }
  type Spawn = (cmd: string, args: string[]) => ChildProcessLike   // injectable
  function startRecorder(liveUrl: string, outDir: string, spawn?: Spawn): RecorderHandle
  ```
  streamlink args: `[liveUrl, 'best', '--stdout', '--twitch-disable-ads', '--hls-live-restart', '--retry-streams', '5', '--retry-max', '3', '--stream-segment-threads', '3']`.
  ffmpeg args: `['-hide_banner','-loglevel','error','-i','pipe:0','-map','0','-c','copy','-f','segment','-segment_time','600','-segment_format','mpegts','-reset_timestamps','1', `${outDir}/part_%05d.ts`]`.
  streamlink stdout pipes to ffmpeg stdin. `done` resolves when ffmpeg exits. `stop()` sends SIGINT to streamlink (ffmpeg then flushes and exits). `bytesWritten()` sums `.ts` sizes in `outDir`.

- [ ] **Step 1: Write failing tests:**
  - `buildStreamlinkArgs` contains `'best'` and `'--stdout'`; never contains a lower quality name.
  - `buildFfmpegArgs` contains `'-c','copy'` adjacent and `'600'`; no `-vf`, `-s`, `-b:v`, `-crf` (Global Constraint: no re-encode).
  - With a fake spawn: `startRecorder` creates `outDir`, pipes streamlink→ffmpeg, `done` resolves with ffmpeg's exit code; `stop()` signals streamlink with `SIGINT`.
  - `bytesWritten` on a temp dir with two files of 10 and 20 bytes → 30.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: stream recorder (stream copy, segmented)`.

### Task 6: Supervisor

**Files:**
- Create: `src/worker/supervisor.ts`, `src/worker/disk.ts`, `tests/worker/supervisor.test.ts`

**Interfaces:**
- Consumes: `Repo` (T3), `checkLive` (T4), `startRecorder` (T5), `Config` (T1).
- Produces:
  ```ts
  type ChannelState = 'offline' | 'recording' | 'waiting' | 'error'
  interface SupervisorDeps { repo: Repo; checkLive: typeof checkLive; startRecorder: typeof startRecorder; freeDiskGb: () => Promise<number>; now: () => Date; config: Config }
  class Supervisor {
    constructor(deps: SupervisorDeps)
    recover(): Promise<void>          // on boot: every 'recording' row → 'interrupted'
    tick(): Promise<void>             // one pass
    stopAll(): Promise<void>          // graceful shutdown
    status(): Record<number, ChannelState>  // by channelId
    diskLow(): boolean
  }
  function freeDiskGb(path: string): Promise<number>  // fs.statfs
  ```
  Tick rules: check enabled channels not currently recording, at most 4 checks in parallel. Live + under cap + disk OK → `repo.startRecording` with dir `${dataDir}/recordings/${platform}-${handle}/${ISO timestamp}`, start recorder. Live but at cap → `waiting`. On recorder `done`: `finishRecording('done', bytes)` if code 0 else `'failed'` with stderr tail; channel becomes eligible on the next tick (so a still-live channel resumes as a new part). `LiveCheckError` → state `error`, retried next tick. Write `status()` + `diskLow()` to `${dataDir}/status.json` each tick for the web app.

- [ ] **Step 1: Write failing tests** with fakes (in-memory repo fake implementing `Repo`, fake recorder with a controllable `done`):
  - 3 channels live, cap 2 → 2 recorders started, third `waiting`; resolve one recorder's `done` → next tick starts the third (Review Focus #3).
  - Recorder ends with code 1 while channel still live → recording row `failed`, next tick starts a new recording for that channel (Review Focus #2).
  - `freeDiskGb` returns 5 (< 20) → no new recorders start, active one untouched, `diskLow() === true` (Review Focus #4).
  - `recover()` turns existing `recording` rows into `interrupted`; following tick re-records a live channel (Review Focus #5).
  - Channel already recording is not re-checked/started twice in the same or next tick.
  - Disabled channels are never checked.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Commit `feat: recording supervisor`.

### Task 7: Retention cleanup + worker entrypoint

**Files:**
- Create: `src/worker/retention.ts`, `src/worker/main.ts`, `tests/worker/retention.test.ts`

**Interfaces:**
- Produces: `cleanupOldRecordings(repo: Repo, now: Date, retentionDays: number, rm?: (dir: string) => Promise<void>): Promise<number>` → count deleted (removes dir, then row).
- `main.ts`: `loadConfig`, `recover()`, `tick()` every `checkIntervalSeconds`, cleanup hourly, SIGTERM/SIGINT → `stopAll()` then exit.

- [ ] **Step 1: Failing test:** recordings ended 8 days and 2 days ago, retention 7 → returns 1, `rm` called with the 8-day dir only; an active recording started 10 days ago is untouched.
- [ ] **Step 2:** FAIL. **Step 3:** Implement. **Step 4:** PASS.
- [ ] **Step 5:** Manual: `npm run worker` with a real currently-live Twitch channel added → within 2 min `part_00000.ts` appears and grows; `ffprobe` shows the source resolution/fps (e.g. 1920×1080 60fps) and codec unchanged. Ctrl-C → recording row `done`.
- [ ] **Step 6:** Commit `feat: worker entrypoint and retention`.

### Task 8: Web app — login, Streamers, Recordings

**Files:**
- Create: `src/auth/session.ts`, `middleware.ts`, `app/login/page.tsx`, `app/api/login/route.ts`, `app/api/channels/route.ts` (GET, POST), `app/api/channels/[id]/route.ts` (PATCH, DELETE), `app/api/recordings/route.ts`, `app/api/files/[...path]/route.ts`, `app/streamers/page.tsx`, `app/recordings/page.tsx`, `app/globals.css`, `public/manifest.webmanifest`, `tests/auth/session.test.ts`, `tests/api/channels.test.ts`

**Interfaces:**
- Consumes: `resolveChannel` (T2), `Repo` (T3), `status.json` (T6).
- Produces:
  - `signSession(secret): string`, `verifySession(token, secret): boolean` (HMAC-SHA256, 30-day expiry embedded).
  - `POST /api/channels {input}` → 201 `{channel, created}` / 200 if existing / 400 `{error}` with the `ChannelInputError` message.
  - `GET /api/channels` → channels with `state` from `status.json` (missing → `offline`) and `diskLow`.
  - `GET /api/files/...` streams a segment file from `dataDir/recordings` with `Range` support; rejects paths escaping that dir (`..`) with 400.

- [ ] **Step 1: Failing tests:**
  - session: valid token verifies; tampered or expired token fails.
  - `POST /api/channels` with `twitch.tv/xqc` then `https://www.twitch.tv/XQC` → second response `created:false` (Review Focus #1); `xqc` → 400 with `channel link` in error.
  - files route: `../../etc/passwd` → 400.
  - middleware: unauthenticated `/streamers` → redirect `/login`; `/api/*` → 401.
- [ ] **Step 2:** FAIL. **Step 3:** Implement routes. **Step 4:** PASS.
- [ ] **Step 5:** Build pages (mobile-first, bottom tab bar Streamers / Recordings):
  - Streamers: paste box + Add; list rows = platform badge, handle, state pill (red `● REC`, amber `waiting`, grey `offline`), enable toggle, delete. Disk-low banner. Auto-refresh every 10 s.
  - Recordings: newest first; channel, title, started, duration, size, status; tap → list of parts with download / play links.
- [ ] **Step 6:** Verify with Playwright at 375×812: login → add `twitch.tv/xqc` → row appears; no horizontal scroll (`document.documentElement.scrollWidth <= 375`). Screenshot.
- [ ] **Step 7:** Commit `feat: web app streamers and recordings`.

### Task 9: Deploy package

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `Caddyfile`, `README.md`

- [ ] **Step 1:** `Dockerfile` (node:22-bookworm-slim + `ffmpeg`, `python3-pip`, `pip install yt-dlp "streamlink>=6.8"`), one image, two commands (`npm start`, `npm run worker`).
- [ ] **Step 2:** `docker-compose.yml`: `postgres` (volume), `web`, `worker` (shares `/data` volume with web), `caddy` (HTTPS for `${DOMAIN}`), restart `unless-stopped`.
- [ ] **Step 3:** README: VPS sizing (4 vCPU / 8 GB, ≥ 500 GB disk, ~8–10 concurrent channels), env vars, `docker compose up -d`, `npm run db:push`, how to update yt-dlp/streamlink (`docker compose build --pull`), adding to phone home screen.
- [ ] **Step 4:** Verify `docker compose build` succeeds (if Docker available); otherwise `npm run build && npm test` green and note it.
- [ ] **Step 5:** Commit `chore: docker deploy`.

---

## Later plans (not in M1)

M2 campaigns + rule checker · M3 moment detection, scoring, 4K shorts, quality gate, Postiz scheduling, push notifications, per-streamer best-clips boards · M4 4K long videos (mashups + highlight cuts, horizontal 3840×2160 or vertical 2160×3840) · M5 autopilot, earnings, assistant chat. Note for M3: Twitch EventSub `stream.online` can replace polling for faster starts.
