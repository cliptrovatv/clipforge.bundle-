import { NextResponse } from 'next/server';
import { getContext } from '@/src/server/context';
import { getRecordings } from '@/src/server/handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { repo, config } = await getContext();
  const r = await getRecordings(repo, config.dataDir);
  return NextResponse.json(r.body, { status: r.status });
}
