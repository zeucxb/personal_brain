import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { DEFAULT_AGENTS } from '@/lib/agents/defaultAgents';
import { CustomAgent } from '@/lib/agents/types';

export async function GET(req: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomAgent>('agents');

    const count = await collection.countDocuments();
    if (count === 0) {
      // Seed default agents
      await collection.insertMany(DEFAULT_AGENTS.map(a => {
        const { _id, ...rest } = a as any;
        return { ...rest };
      }));
    }

    const agents = await collection.find({}).sort({ isBuiltIn: -1, createdAt: 1 }).toArray();
    return NextResponse.json({ agents });
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, avatar, description, systemPrompt, defaultMateria, canConsultTopics } = body;

    if (!name || !name.trim() || !systemPrompt || !systemPrompt.trim()) {
      return NextResponse.json(
        { error: 'Nome do agente e Prompt do Sistema são obrigatórios.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomAgent>('agents');

    const id = `agent_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const newAgent: CustomAgent = {
      id,
      name: name.trim(),
      avatar: avatar?.trim() || '🤖',
      description: description?.trim() || '',
      systemPrompt: systemPrompt.trim(),
      defaultMateria: defaultMateria?.trim() || undefined,
      canConsultTopics: canConsultTopics !== false,
      createdAt: now,
      updatedAt: now,
      isBuiltIn: false,
    };

    await collection.insertOne(newAgent);
    return NextResponse.json({ success: true, agent: newAgent });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, avatar, description, systemPrompt, defaultMateria, canConsultTopics } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID do agente é obrigatório.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomAgent>('agents');

    const updateFields: any = {
      updatedAt: Date.now(),
    };

    if (name) updateFields.name = name.trim();
    if (avatar) updateFields.avatar = avatar.trim();
    if (description !== undefined) updateFields.description = description ? description.trim() : '';
    if (systemPrompt) updateFields.systemPrompt = systemPrompt.trim();
    if (defaultMateria !== undefined) {
      updateFields.defaultMateria = defaultMateria && typeof defaultMateria === 'string' ? defaultMateria.trim() : null;
    }
    if (canConsultTopics !== undefined) updateFields.canConsultTopics = Boolean(canConsultTopics);

    await collection.updateOne({ id }, { $set: updateFields });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating agent:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID do agente é obrigatório.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomAgent>('agents');

    const agent = await collection.findOne({ id });
    if (agent?.isBuiltIn) {
      return NextResponse.json(
        { error: 'Agentes padrão do sistema não podem ser excluídos.' },
        { status: 400 }
      );
    }

    await collection.deleteOne({ id });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting agent:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
