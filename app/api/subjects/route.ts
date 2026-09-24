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
    await db.collection('conversations').deleteMany({ materia });

    // Remove arquivos do GridFS vinculados a essa matéria
    try {
      const { GridFSBucket } = await import('mongodb');
      const bucket = new GridFSBucket(db, { bucketName: 'pdf_files' });
      const files = await bucket.find({ 'metadata.materia': materia }).toArray();
      for (const f of files) {
        await bucket.delete(f._id);
      }
    } catch (fsErr) {
      console.warn('GridFS cascade delete warning:', fsErr);
    }

    return NextResponse.json({ success: true, deletedCount: result.deletedCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { oldName, newName } = await req.json();

    if (!oldName || !newName || !newName.trim()) {
      return NextResponse.json(
        { error: 'Nome antigo e novo nome do tópico são obrigatórios.' },
        { status: 400 }
      );
    }

    const trimmedNew = newName.trim();
    if (oldName === 'Geral' || trimmedNew === 'Geral') {
      return NextResponse.json(
        { error: 'O tópico "Geral" não pode ser renomeado nem utilizado como novo nome.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');

    // 1. Atualiza documentos vetoriais
    const docResult = await db.collection('documents').updateMany(
      { materia: oldName },
      { $set: { materia: trimmedNew } }
    );

    // 2. Atualiza conversas vinculadas
    const convResult = await db.collection('conversations').updateMany(
      { materia: oldName },
      { $set: { materia: trimmedNew } }
    );

    // 3. Atualiza arquivos no GridFS
    try {
      await db.collection('pdf_files.files').updateMany(
        { 'metadata.materia': oldName },
        { $set: { 'metadata.materia': trimmedNew } }
      );
    } catch (fsErr) {
      console.warn('GridFS rename warning:', fsErr);
    }

    return NextResponse.json({
      success: true,
      modifiedDocs: docResult.modifiedCount,
      modifiedConvs: convResult.modifiedCount,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


