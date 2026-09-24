import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import pdfParse from 'pdf-parse';
import { Document } from '@langchain/core/documents';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const materia = formData.get('materia') as string;

    if (!file || !materia) {
      return NextResponse.json({ error: 'Faltando arquivo ou matéria' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const pdfData = await pdfParse(buffer);
    const text = pdfData.text;

    // Chunking simples
    const chunkSize = 1000;
    const chunks = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }

    const docs = chunks.map(
      (chunk) => new Document({ pageContent: chunk, metadata: { materia, source: file.name } })
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

    return NextResponse.json({ success: true, chunks: chunks.length });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
