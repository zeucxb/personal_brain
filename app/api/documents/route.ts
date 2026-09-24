import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const materia = searchParams.get('materia');

    const client = await clientPromise;
    const db = client.db('ragchat');

    const matchStage = materia ? { $match: { materia } } : { $match: {} };

    const documents = await db
      .collection('documents')
      .aggregate([
        matchStage,
        {
          $group: {
            _id: { source: '$source', materia: '$materia' },
            chunksCount: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            filename: '$_id.source',
            materia: '$_id.materia',
            chunksCount: 1,
          },
        },
        {
          $sort: { filename: 1 },
        },
      ])
      .toArray();

    return NextResponse.json({ documents });
  } catch (error: any) {
    console.error('Error fetching documents:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { materia, filename } = await req.json();

    if (!materia || !filename) {
      return NextResponse.json(
        { error: 'Parâmetros "materia" e "filename" são obrigatórios.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');

    const result = await db.collection('documents').deleteMany({
      materia,
      source: filename,
    });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('Error deleting document:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
