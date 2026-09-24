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
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Extrai texto página por página para preservar o número exato da página em cada chunk
    const pages: { pageNumber: number; text: string }[] = [];
    const render_page = (pageData: any) => {
      const render_options = { normalizeWhitespace: false, disableCombineTextItems: false };
      return pageData.getTextContent(render_options).then((textContent: any) => {
        let lastY: any, pageText = '';
        for (const item of textContent.items) {
          if (lastY === item.transform[5] || !lastY) {
            pageText += item.str;
          } else {
            pageText += '\n' + item.str;
          }
          lastY = item.transform[5];
        }
        const pageNumber = (pageData.pageIndex ?? 0) + 1;
        const trimmed = pageText.trim();
        if (trimmed.length > 0) {
          pages.push({ pageNumber, text: trimmed });
        }
        return pageText;
      });
    };

    const pdfData = await pdfParse(pdfBuffer, { pagerender: render_page });

    if (pages.length === 0 || !pdfData.text || pdfData.text.trim().length === 0) {
      return NextResponse.json({ error: 'Nenhum texto legível encontrado no PDF.' }, { status: 400 });
    }

    // Chunking inteligente com RecursiveCharacterTextSplitter e overlap por página
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const pageTexts = pages.map((p) => p.text);
    const pageMetadatas = pages.map((p) => ({
      materia,
      source: file.name,
      page: p.pageNumber,
    }));

    const docs = await splitter.createDocuments(pageTexts, pageMetadatas);

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection('documents');

    // Remove chunks antigos do mesmo documento neste tópico se houver
    await collection.deleteMany({ source: file.name, materia });

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
