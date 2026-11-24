import { describe, expect, it } from 'vitest';
import { loadConfig } from '@/src/config';

const required = { DATABASE_URL: 'x', APP_PASSWORD: 'p', SESSION_SECRET: 's' };

describe('loadConfig', () => {
  it('applies defaults', () => {
    const c = loadConfig(required);
    expect(c.maxConcurrentRecordings).toBe(8);
    expect(c.checkIntervalSeconds).toBe(60);
    expect(c.retentionDays).toBe(7);
    expect(c.minFreeDiskGb).toBe(20);
    expect(c.dataDir).toBe('/data');
    expect(c.databaseUrl).toBe('x');
    expect(c.appPassword).toBe('p');
    expect(c.sessionSecret).toBe('s');
  });

  it('reads overrides as numbers', () => {
    expect(loadConfig({ ...required, MAX_CONCURRENT_RECORDINGS: '12' }).maxConcurrentRecordings).toBe(12);
  });

  it('names the missing required variable', () => {
    const { APP_PASSWORD: _omit, ...rest } = required;
    expect(() => loadConfig(rest)).toThrow(/APP_PASSWORD/);
  });

  it('rejects a non-numeric number setting', () => {
    expect(() => loadConfig({ ...required, RETENTION_DAYS: 'abc' })).toThrow(/RETENTION_DAYS/);
  });
});
