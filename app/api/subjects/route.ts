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
