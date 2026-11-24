export type Platform = 'youtube' | 'twitch' | 'kick';

export interface ResolvedChannel {
  platform: Platform;
  handle: string;
  liveUrl: string;
  key: string;
}

export class ChannelInputError extends Error {}

const HELP =
  'Paste a channel link, e.g. https://www.youtube.com/@name, https://www.twitch.tv/name or https://kick.com/name';

const TWITCH_RESERVED = new Set(['videos', 'directory', 'search', 'settings', 'downloads', 'p', 'subscriptions', 'inventory', 'drops', 'wallet']);
const KICK_RESERVED = new Set(['video', 'categories', 'search', 'browse', 'following', 'dashboard', 'clips']);
const NAME = /^[a-z0-9_][a-z0-9_.-]{0,59}$/i;

function bad(): never {
  throw new ChannelInputError(HELP.replace('Paste a channel link', 'Not a channel link. Paste a channel link'));
}

function make(platform: Platform, handle: string, liveUrl: string): ResolvedChannel {
  return { platform, handle, liveUrl, key: `${platform}:${handle}` };
}

export function resolveChannel(input: string): ResolvedChannel {
  const raw = input.trim();
  if (!raw) bad();
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    bad();
  }
  if (!raw.includes('.')) bad();
  const host = url.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const parts = url.pathname.split('/').filter(Boolean);
  const first = parts[0] ?? '';

  if (host === 'youtube.com') {
    if (first.startsWith('@') && NAME.test(first.slice(1))) {
      const h = first.slice(1).toLowerCase();
      return make('youtube', h, `https://www.youtube.com/@${h}/live`);
    }
    if (first === 'channel' && /^UC[\w-]{22}$/.test(parts[1] ?? '')) {
      const id = parts[1];
      return make('youtube', id, `https://www.youtube.com/channel/${id}/live`);
    }
    bad();
  }
  if (host === 'twitch.tv') {
    if (NAME.test(first) && !TWITCH_RESERVED.has(first.toLowerCase())) {
      const h = first.toLowerCase();
      return make('twitch', h, `https://www.twitch.tv/${h}`);
    }
    bad();
  }
  if (host === 'kick.com') {
    if (NAME.test(first) && !KICK_RESERVED.has(first.toLowerCase())) {
      const h = first.toLowerCase();
      return make('kick', h, `https://kick.com/${h}`);
    }
    bad();
  }
  bad();
}
