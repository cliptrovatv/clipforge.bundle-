import { NextResponse, type NextRequest } from 'next/server';
import { getContext } from '@/src/server/context';

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const id = Number((await params).id);
  const { enabled } = (await req.json().catch(() => ({}))) as { enabled?: unknown };
  if (!Number.isInteger(id) || typeof enabled !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { repo } = await getContext();
  await repo.setChannelEnabled(id, enabled);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  const { repo } = await getContext();
  await repo.deleteChannel(id);
  return NextResponse.json({ ok: true });
}
