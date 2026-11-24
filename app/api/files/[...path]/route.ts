import fs from 'node:fs';
import { Readable } from 'node:stream';
import { NextResponse, type NextRequest } from 'next/server';
import { loadConfig } from '@/src/config';
import { resolveDataPath } from '@/src/server/handlers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path.map(decodeURIComponent);
  const abs = resolveDataPath(loadConfig().dataDir, parts);
  if (!abs) return NextResponse.json({ error: 'Bad path' }, { status: 400 });
  const stat = await fs.promises.stat(abs).catch(() => null);
  if (!stat?.isFile()) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const headers: Record<string, string> = {
    'Content-Type': 'video/mp2t',
    'Accept-Ranges': 'bytes',
    'Content-Disposition': `attachment; filename="${parts.slice(-3).join('_').replace(/"/g, '')}"`,
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      return new NextResponse(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } });
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  const stream = Readable.toWeb(fs.createReadStream(abs, { start, end })) as ReadableStream;
  return new NextResponse(stream, { status, headers });
}
