import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { ensureVectorIndex } from '@/lib/mongodb';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import pdfParse from 'pdf-parse';

export async function POST(req: NextRequest) {
  try {
    await ensureVectorIndex();
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const materia = formData.get('materia') as string;

    if (!file || !materia) {
      return NextResponse.json({ error: 'Faltando arquivo ou matéria' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdfData = await pdfParse(new Uint8Array(arrayBuffer) as unknown as Buffer);
    const text = pdfData.text;

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Nenhum texto legível encontrado no PDF.' }, { status: 400 });
    }

    // Chunking inteligente com RecursiveCharacterTextSplitter e overlap
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const docs = await splitter.createDocuments(
      [text],
      [{ materia, source: file.name }]
    );

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection('documents');

    const embeddings = new OllamaEmbeddings({
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
    });

    await MongoDBAtlasVectorSearch.fromDocuments(docs, embeddings, {
      collection,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding',
    });

    return NextResponse.json({ success: true, chunks: docs.length });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
