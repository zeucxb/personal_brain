import { NextRequest, NextResponse } from 'next/server';
import { getBatchStatus } from '@/lib/queue/redisQueue';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get('batchId');

    if (!batchId) {
      return NextResponse.json({ error: 'Parâmetro batchId é obrigatório.' }, { status: 400 });
    }

    const status = await getBatchStatus(batchId);
    if (!status) {
      return NextResponse.json({ error: 'Lote não encontrado no Redis.' }, { status: 404 });
    }

    return NextResponse.json(status);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
