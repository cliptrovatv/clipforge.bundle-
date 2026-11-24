import { describe, it, expect } from 'vitest';
import { resolveChannel, ChannelInputError } from '@/src/channels/resolve';

describe('resolveChannel', () => {
  const cases: [string, string][] = [
    ['https://www.youtube.com/@IShowSpeed', 'youtube:ishowspeed'],
    ['youtube.com/@ishowspeed/live', 'youtube:ishowspeed'],
    ['https://m.youtube.com/@IShowSpeed/videos?x=1', 'youtube:ishowspeed'],
    ['https://www.youtube.com/channel/UCWsDFcIhY2DBi3GB5uykGXA', 'youtube:UCWsDFcIhY2DBi3GB5uykGXA'],
    ['https://twitch.tv/xQc', 'twitch:xqc'],
    ['twitch.tv/xqc/videos', 'twitch:xqc'],
    ['https://kick.com/AdinRoss', 'kick:adinross'],
    ['  https://kick.com/adinross/  ', 'kick:adinross'],
  ];
  it.each(cases)('%s → %s', (input, key) => {
    expect(resolveChannel(input).key).toBe(key);
  });

  it('builds live URLs', () => {
    expect(resolveChannel('https://www.youtube.com/@IShowSpeed').liveUrl).toBe('https://www.youtube.com/@ishowspeed/live');
    expect(resolveChannel('https://www.youtube.com/channel/UCWsDFcIhY2DBi3GB5uykGXA').liveUrl).toBe(
      'https://www.youtube.com/channel/UCWsDFcIhY2DBi3GB5uykGXA/live',
    );
    expect(resolveChannel('twitch.tv/XQC').liveUrl).toBe('https://www.twitch.tv/xqc');
    expect(resolveChannel('kick.com/AdinRoss').liveUrl).toBe('https://kick.com/adinross');
  });

  it.each(['xqc', 'https://example.com/x', 'https://www.youtube.com/watch?v=abc', 'https://twitch.tv/'])(
    'rejects %s',
    (input) => {
      expect(() => resolveChannel(input)).toThrow(ChannelInputError);
      expect(() => resolveChannel(input)).toThrow(/channel link/);
    },
  );
});
