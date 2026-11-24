import { NextResponse, type NextRequest } from 'next/server';
import { getContext } from '@/src/server/context';
import { getChannels, postChannel } from '@/src/server/handlers';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { repo, config } = await getContext();
  const r = await getChannels(repo, config.dataDir);
  return NextResponse.json(r.body, { status: r.status });
}

export async function POST(req: NextRequest) {
  const { repo } = await getContext();
  const r = await postChannel(repo, await req.json().catch(() => null));
  return NextResponse.json(r.body, { status: r.status });
}
