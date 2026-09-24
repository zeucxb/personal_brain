import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { DEFAULT_SKILLS } from '@/lib/skills/defaultSkills';
import { CustomSkill } from '@/lib/skills/types';

export async function GET(req: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomSkill>('skills');

    const count = await collection.countDocuments();
    if (count === 0) {
      // Seed default skills
      await collection.insertMany(DEFAULT_SKILLS);
    } else {
      // Garante que skills novas e atualizações de embutidas sejam refletidas
      for (const def of DEFAULT_SKILLS) {
        const exists = await collection.findOne({ id: def.id });
        if (!exists) {
          await collection.insertOne(def);
        } else if (def.isBuiltIn) {
          await collection.updateOne(
            { id: def.id },
            {
              $set: {
                name: def.name,
                icon: def.icon,
                description: def.description,
                category: def.category,
                promptInstruction: def.promptInstruction,
              },
            }
          );
        }
      }
    }

    const skills = await collection.find({}).sort({ isBuiltIn: -1, createdAt: 1 }).toArray();
    return NextResponse.json({ skills });
  } catch (error: any) {
    console.error('Error fetching skills:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, icon, description, category, promptInstruction } = body;

    if (!name || !name.trim() || !promptInstruction || !promptInstruction.trim()) {
      return NextResponse.json(
        { error: 'Nome da skill e Instruções do Prompt são obrigatórios.' },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomSkill>('skills');

    const id = `skill_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = Date.now();

    const newSkill: CustomSkill = {
      id,
      name: name.trim(),
      icon: icon?.trim() || '⚡',
      description: description?.trim() || '',
      category: category || 'estudo',
      promptInstruction: promptInstruction.trim(),
      createdAt: now,
      updatedAt: now,
      isBuiltIn: false,
    };

    await collection.insertOne(newSkill);
    return NextResponse.json({ success: true, skill: newSkill });
  } catch (error: any) {
    console.error('Error creating skill:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, icon, description, category, promptInstruction } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID da skill é obrigatório.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomSkill>('skills');

    const updateFields: any = {
      updatedAt: Date.now(),
    };

    if (name) updateFields.name = name.trim();
    if (icon) updateFields.icon = icon.trim();
    if (description !== undefined) updateFields.description = description.trim();
    if (category) updateFields.category = category;
    if (promptInstruction) updateFields.promptInstruction = promptInstruction.trim();

    await collection.updateOne({ id }, { $set: updateFields });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating skill:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID da skill é obrigatório.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection<CustomSkill>('skills');

    const skill = await collection.findOne({ id });
    if (!skill) {
      return NextResponse.json({ error: 'Skill não encontrada.' }, { status: 404 });
    }

    if (skill.isBuiltIn) {
      return NextResponse.json(
        { error: 'Skills embutidas do sistema não podem ser excluídas.' },
        { status: 403 }
      );
    }

    await collection.deleteOne({ id });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting skill:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
