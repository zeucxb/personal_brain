import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { ensureVectorIndex } from '@/lib/mongodb';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import pdfParse from 'pdf-parse';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';

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

    // Armazena o arquivo PDF original no GridFS do MongoDB para visualização e download
    const bucket = new GridFSBucket(db, { bucketName: 'pdf_files' });

    // Remove versões antigas do mesmo arquivo na mesma matéria se houver
    const existing = await bucket.find({ filename: file.name, 'metadata.materia': materia }).toArray();
    for (const doc of existing) {
      await bucket.delete(doc._id);
    }

    const uploadStream = bucket.openUploadStream(file.name, {
      metadata: {
        materia,
        contentType: 'application/pdf',
        size: file.size,
        uploadedAt: new Date(),
      },
    });

    await new Promise<void>((resolve, reject) => {
      const nodeReadable = Readable.from(Buffer.from(arrayBuffer));
      nodeReadable.pipe(uploadStream)
        .on('finish', () => resolve())
        .on('error', reject);
    });

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
