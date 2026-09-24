import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db('ragchat');
    
    // Obter matérias únicas baseadas nos documentos embedados
    const subjects = await db.collection('documents').distinct('materia');
    
    return NextResponse.json({ subjects });
  } catch (e) {
    return NextResponse.json({ error: 'Erro ao buscar matérias' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { materia } = await req.json();
    if (!materia) {
      return NextResponse.json({ error: 'Matéria não informada' }, { status: 400 });
    }
    const client = await clientPromise;
    const db = client.db('ragchat');
    const result = await db.collection('documents').deleteMany({ materia });
    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

