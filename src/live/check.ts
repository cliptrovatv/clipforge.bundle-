import { realRun, type Run } from '../proc/runner';

export interface LiveStatus {
  live: boolean;
  title: string | null;
  displayName: string | null;
}

export class LiveCheckError extends Error {}

const OFFLINE = [
  /not currently live/i,
  /will begin in/i,
  /live event will begin/i,
  /premieres in/i,
  /\boffline\b/i,
  /is not live/i,
  /no live stream/i,
  /does not have a live stream/i,
];

const NOT_LIVE: LiveStatus = { live: false, title: null, displayName: null };

export async function checkLive(liveUrl: string, run: Run = realRun): Promise<LiveStatus> {
  const res = await run(
    'yt-dlp',
    ['--dump-single-json', '--no-download', '--no-warnings', '--skip-download', '--no-playlist', '--ignore-no-formats-error', liveUrl],
    { timeoutMs: 45_000 },
  );
  if (res.code !== 0) {
    if (OFFLINE.some((re) => re.test(res.stderr))) return NOT_LIVE;
    throw new LiveCheckError(res.stderr.trim().split('\n').pop() || `yt-dlp exited ${res.code}`);
  }
  let info: { is_live?: boolean; live_status?: string; title?: string; uploader?: string; channel?: string };
  try {
    info = JSON.parse(res.stdout);
  } catch {
    throw new LiveCheckError('yt-dlp returned invalid JSON');
  }
  const live = info.is_live === true || info.live_status === 'is_live';
  if (!live) return NOT_LIVE;
  return { live: true, title: info.title ?? null, displayName: info.uploader ?? info.channel ?? null };
}
