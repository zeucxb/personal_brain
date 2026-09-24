import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const materia = searchParams.get('materia');

    const client = await clientPromise;
    const db = client.db('ragchat');

    const query = materia ? { materia } : {};

    const conversations = await db
      .collection('conversations')
      .find(query)
      .sort({ updatedAt: -1 })
      .toArray();

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error('Error fetching conversations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { id, title, materia, messages, agentId, skillId } = await req.json();

    if (!id || !materia) {
      return NextResponse.json(
        { error: 'ID e matéria são obrigatórios.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');

    const now = Date.now();

    await db.collection('conversations').updateOne(
      { id },
      {
        $set: {
          id,
          title: title || 'Nova conversa',
          materia,
          messages: messages || [],
          agentId: agentId || 'agent_rag_general',
          skillId: skillId || null,
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving conversation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, title } = await req.json();

    if (!id || !title) {
      return NextResponse.json(
        { error: 'ID e novo título são obrigatórios.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');

    await db.collection('conversations').updateOne(
      { id },
      {
        $set: {
          title,
          updatedAt: Date.now(),
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating conversation title:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get('id');

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id) {
      return NextResponse.json(
        { error: 'ID da conversa é obrigatório.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');

    const result = await db.collection('conversations').deleteOne({ id });

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
