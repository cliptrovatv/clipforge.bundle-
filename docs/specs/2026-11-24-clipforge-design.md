# ClipForge — Design

*Working name. Personal clipping studio for content rewards campaigns.*

## Intent

One person (the owner) clips popular Twitch, Kick and YouTube streamers for paid
content rewards campaigns and posts to their own YouTube, Instagram and TikTok.
Pay is per view, so the winners are whoever posts the best moments **first** and
**most often**. ClipForge's job: shrink "moment happens on stream" → "4K short
scheduled on three platforms" to minutes, from a phone or a desktop.

## Goals

1. **Sources:** paste any YouTube video, Twitch VOD/clip or Kick VOD link; or
   **add a streamer just by pasting their channel** (YouTube, Twitch or Kick URL
   or handle). The app detects the platform and watches that channel 24/7.
2. **Multi-channel auto-recording:** as soon as any watched channel goes live
   (YouTube Live, Twitch, Kick), the app starts recording it automatically, the
   full stream, at best available quality. **Many channels record at the same
   time**, each in its own recorder. Recordings are saved to the library (kept 7
   days by default, adjustable; clips are kept forever).
3. **Live Moment Radar (the edge):** while recording, detect viral moments in real
   time from chat velocity, hype emotes/keywords, viewer clip creation (Twitch),
   and audio loudness spikes. On a spike, auto-cut the window and push a phone
   notification. After the stream ends, a full pass over the recording catches
   anything the live pass missed.
4. **Best clips per streamer:** every streamer gets their own ranked board of
   their top viral moments (per stream, per day, per week), so you can grab "the
   best 5 from each streamer" in one tap, save them, and post them.
5. **Viral scoring:** transcribe each candidate and have Claude score it
   (hook strength, payoff, standalone-ness, campaign fit), with a one-line reason.
6. **Shorts:** 9:16, speaker/face reframe, animated captions, hook title on the
   first frame, exported at **2160×3840 (4K)**.
7. **Mashups:** long-form 16:9 compilations at **3840×2160** ("Top 10 moments this
   week", "Every rage moment", multi-streamer) — Claude picks and orders moments,
   writes the title card text, the app assembles with transitions.
8. **Campaign manager:** each campaign stores streamer(s), allowed platforms, rules
   (length, required tags/mentions/links, banned content), payout rate, deadline.
   Every clip is checked against its campaign's rules before it can be scheduled.
   Tracks posted links, views and estimated earnings per campaign.
9. **Posting assistant:** Claude writes per-platform titles, captions, hashtags and
   creator credit lines, plus 2–3 hook variants; you approve/edit; schedules via
   Postiz into best-time slots on a calendar. Chat box to ask it anything
   ("what's my best campaign this week?", "make 5 more from yesterday's stream").
10. **Autopilot mode (per campaign):** moments scoring above a threshold go
   straight through edit → upscale → schedule with no tap needed.
11. **Works on phone and desktop:** installable web app (PWA), single login.

## Quality bar (approved: "best quality, no blurry videos, 4K")

- Every exported short and mashup is 4K (2160×3840 vertical / 3840×2160 wide),
  default on all platforms (overrides the earlier "YouTube-only" cost default).
- Always pull the highest source quality and frame rate available (keep 60 fps).
- Use the top-tier AI upscaler (Topaz-class), never a plain resize.
- Export high bitrate: H.264/H.265 at YouTube's recommended 4K rates
  (~35–45 Mbps at 30 fps, ~53–68 Mbps at 60 fps), high-quality audio (AAC 320k).
- **Quality gate:** before scheduling, an automatic sharpness/blur check runs on
  sampled frames; blurry results are re-processed or flagged, never auto-posted.
  Sources below 720p are flagged as "may look soft even after upscaling."

## Non-goals

- Multi-user / selling it as SaaS.
- A full timeline editor (light trims, caption edits and hook text only).
- Ad generation, AI avatars, voice cloning.

## Anti-goals (failure even if it "works")

- Posting a streamer who isn't covered by an active campaign. The app blocks
  scheduling for streamers with no active campaign unless you override per clip.
- Removing creator credit or watermarks from source content.
- Running up surprise bills: every job shows its estimated cost before running
  (upscaling is the expensive part), and a monthly spend cap halts autopilot.

## Constraints and honest facts

- **4K is upscaled.** Twitch/Kick top out around 1080p60; most streams have no 4K.
  ClipForge always pulls the best source available, then AI-upscales to 4K. It
  looks sharper; it can't invent true detail.
- **TikTok and Instagram re-compress to ~1080p on display.** 4K pays off mainly on
  YouTube. Option per platform to skip upscaling and save money (default: upscale
  for YouTube only, 1080p for TikTok/IG) — superseded: owner chose 4K everywhere.
- **Everygen has no public API** — it's usable from Claude chats but not from a
  standalone app. Upscaling goes to a dedicated upscaling API instead.
- **Kick:** use Kick's official developer API/webhooks for chat where available;
  fall back to its public chat websocket, which is unofficial and may break.
- **Recordings are stored at exact original quality** (stream copied, never
  re-encoded): 4K when the streamer broadcasts 4K (some YouTube streams,
  ~10–20 GB/hour), otherwise their native 1080p/720p. Upscaling to 4K happens
  only on the clips and mashups you make, not on whole recordings.
- **Storage/bandwidth:** a 1080p60 stream is ~3 GB/hour. Ten channels streaming
  8 h a day ≈ 240 GB/day before cleanup, which is why recordings expire.
- Must run 24/7 for live monitoring → hosted on a small cloud server, not the
  owner's PC.
- Platform rate limits: Postiz ~90–100 posts/hour; Opus Clip API 30 req/min.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| A | Workflow inside Claude chats driving the Opus Clip / Everygen / Postiz connectors | Fastest to set up, top quality; but not its own app, no 24/7 live watching |
| B | Standalone app doing everything itself (own editing, own GPU upscaling) | Full control, cheapest per clip; needs a GPU, longest build, editing quality lags |
| **C (chosen)** | **Standalone app for monitoring, detection, campaigns, mashups, posting; hands editing, upscaling and scheduling to APIs** | Owner's choice. Live radar is the speed edge and needs its own app; using pro APIs gives top quality from day one. Costs: API fees per clip |

## How it's built (builder's calls, stated)

- **App:** Next.js + TypeScript web app, installable PWA, mobile-first layout.
  Single-user login (password + optional passkey).
- **Workers:** Node/TypeScript job workers (BullMQ on Redis):
  - *Channel resolver:* turns a pasted channel URL/handle into platform + channel
    ID (YouTube channel ID, Twitch login, Kick slug).
  - *Live checkers:* poll each watched channel every ~60 s (Twitch EventSub
    `stream.online` webhooks where possible; Kick API; YouTube via the channel's
    `/live` page with yt-dlp, which avoids burning YouTube API quota).
  - *Recorders:* one `streamlink`/`yt-dlp` process per live channel, copying the
    stream without re-encoding (light on CPU) into 10-min segments uploaded to
    storage. Concurrency limit setting; a ~4 vCPU server with good bandwidth
    handles roughly 8–10 channels at once (more = bigger server).
  - *Chat listeners:* Twitch anonymous IRC, Twitch clip activity via Helix API,
    Kick chat via Kick API/websocket, YouTube live chat via YouTube Data API
    (quota-limited: polled sparingly, falls back to audio + transcript signals).
  - *Spike detector:* z-score of chat msgs/sec + hype-emote ratio + loudness
    (ffmpeg), tunable per streamer.
  - *VOD ingest:* `yt-dlp` at best available quality.
  - *Candidate finding on VODs:* Twitch chat replay where available + transcript.
- **Transcription:** Opus Clip / a speech-to-text API (word timestamps for captions).
- **AI brain:** Claude API (`claude-sonnet-5-5` for scoring and captions at volume;
  `claude-opus-5-5` for mashup planning and the assistant chat).
- **Editing (reframe + captions):** Opus Clip API, given the cut segment.
- **Upscaling to 4K:** an upscaling API (Topaz-class, e.g. via Magic Hour /
  Upsampler / Venice), behind one adapter so the provider can be swapped.
- **Mashup assembly:** ffmpeg on the worker (concat, crossfades, title cards,
  loudness normalize), using already-upscaled segments.
- **Scheduling + analytics:** Postiz API (cloud) to post to YouTube, Instagram,
  TikTok and pull post analytics for earnings tracking.
- **Data:** Postgres (streamers, campaigns, moments, clips, posts, costs).
  Media in S3-compatible storage (Cloudflare R2 — no egress fees for big 4K files).
  Full stream recordings auto-deleted after 7 days (setting); saved clips kept.
- **Hosting:** one cloud VPS (~4 vCPU / 8 GB, ~$25–40/mo) running Docker Compose,
  HTTPS via Caddy. Web push notifications to the phone.
- **Secrets the owner provides:** Claude API key, Opus Clip API key, upscaler API
  key, Postiz API key, Twitch app client ID/secret, Kick API creds, R2 keys.

## Screens

```
[Radar]      who's live + recording now, hype meter, fresh moments (score, preview, ✓ / ✗)
[Streamers]  add by channel link; each streamer's ranked best-clips board; recordings
[Clips]      queue: processing → ready → scheduled → posted; edit hook/captions
[Mashups]    pick moments or "auto: top N this week" → plan → render
[Campaigns]  rules, streamers, payout, views, est. earnings, autopilot toggle
[Calendar]   scheduled posts across YT / IG / TikTok
[Assistant]  chat with the posting assistant
[Settings]   keys, accounts, spend cap, quality per platform
```

## Build order (milestones)

1. Channel watch list + multi-channel auto-recording (moved first by owner).
2. Campaign manager + rule checker + credit lines.
3. Paste-a-link → scored moments → 4K short → schedule; Live Moment Radar, push
   notifications, per-streamer best-clips boards.
4. Mashups.
5. Autopilot, analytics/earnings, assistant chat.

## Left to the builder

Exact spike-detector thresholds, caption styles, transition styles, DB schema,
which upscaling vendor to start with (pick on price/quality test), UI details.
