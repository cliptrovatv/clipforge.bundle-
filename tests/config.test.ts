import { describe, it, expect } from 'vitest';
import { loadConfig } from '@/src/config';

const base = { DATABASE_URL: 'x', APP_PASSWORD: 'p', SESSION_SECRET: 's' };

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(base);
    expect(c.maxConcurrentRecordings).toBe(8);
    expect(c.checkIntervalSeconds).toBe(60);
    expect(c.retentionDays).toBe(7);
    expect(c.minFreeDiskGb).toBe(20);
    expect(c.dataDir).toBe('/data');
  });
  it('reads overrides', () => {
    expect(loadConfig({ ...base, MAX_CONCURRENT_RECORDINGS: '12' }).maxConcurrentRecordings).toBe(12);
  });
  it('throws on missing required var', () => {
    const { APP_PASSWORD, ...rest } = base;
    expect(() => loadConfig(rest)).toThrow(/APP_PASSWORD/);
  });
});
