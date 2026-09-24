import { NextRequest, NextResponse } from 'next/server';
import clientPromise, { ensureVectorIndex } from '@/lib/mongodb';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import pdfParse from 'pdf-parse';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';
import { recordBatchFileStatus } from '@/lib/queue/redisQueue';
import { extractDocumentMetadata } from '@/lib/rag/metadata';

export type ProcessFileResult = {
  filename: string;
  pages: number;
  chunks: number;
  success: boolean;
  error?: string;
};

async function processSingleDocument(
  file: File,
  materia: string,
  batchId?: string
): Promise<ProcessFileResult> {
  if (batchId) {
    await recordBatchFileStatus(batchId, file.name, {
      filename: file.name,
      materia,
      size: file.size,
      status: 'processing',
    });
  }

  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  const isPdf = ext === '.pdf';
  const isMarkdown = ext === '.md' || ext === '.markdown';
  const isText = ext === '.txt';

  if (!isPdf && !isMarkdown && !isText) {
    const errorMsg = `Formato "${ext}" não suportado. Por favor, envie arquivos .pdf, .md ou .txt.`;
    if (batchId) {
      await recordBatchFileStatus(batchId, file.name, {
        status: 'failed',
        error: errorMsg,
      });
    }
    throw new Error(errorMsg);
  }

  const arrayBuffer = await file.arrayBuffer();
  const pages: { pageNumber: number; text: string }[] = [];
  let contentType = 'application/pdf';

  if (isPdf) {
    const pdfBuffer = Buffer.from(arrayBuffer);
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
      if (batchId) {
        await recordBatchFileStatus(batchId, file.name, {
          status: 'failed',
          error: 'Nenhum texto legível encontrado no PDF.',
        });
      }
      throw new Error(`Nenhum texto legível encontrado no PDF "${file.name}".`);
    }
  } else {
    // Markdown (.md) ou Texto (.txt)
    contentType = isMarkdown ? 'text/markdown; charset=utf-8' : 'text/plain; charset=utf-8';
    const rawText = Buffer.from(arrayBuffer).toString('utf-8');

    if (!rawText || rawText.trim().length === 0) {
      if (batchId) {
        await recordBatchFileStatus(batchId, file.name, {
          status: 'failed',
          error: 'O arquivo de texto/markdown está vazio.',
        });
      }
      throw new Error(`O arquivo "${file.name}" está vazio.`);
    }

    // Divide arquivos Markdown e Texto em seções lógicas equivalentes a páginas (~1500 caracteres)
    const chunkSizeTarget = 1500;
    const paragraphs = rawText.split(/\n\s*\n/);
    let currentPageText = '';
    let pageNum = 1;

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      if (currentPageText.length + trimmedPara.length > chunkSizeTarget && currentPageText.length > 0) {
        pages.push({ pageNumber: pageNum++, text: currentPageText.trim() });
        currentPageText = trimmedPara;
      } else {
        currentPageText = currentPageText ? `${currentPageText}\n\n${trimmedPara}` : trimmedPara;
      }
    }

    if (currentPageText.trim().length > 0) {
      pages.push({ pageNumber: pageNum, text: currentPageText.trim() });
    }

    if (pages.length === 0) {
      pages.push({ pageNumber: 1, text: rawText.trim() });
    }
  }

  // Chunking inteligente com RecursiveCharacterTextSplitter e overlap
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const fullText = pages.map((p) => p.text).slice(0, 3).join('\n');
  const docMeta = extractDocumentMetadata(file.name, fullText);

  const pageTexts = pages.map((p) => p.text);
  const pageMetadatas = pages.map((p) => {
    const pageMeta = extractDocumentMetadata(file.name, p.text);
    return {
      materia,
      source: file.name,
      page: p.pageNumber,
      ua: pageMeta.ua ?? docMeta.ua,
      uaCode: pageMeta.uaCode ?? docMeta.uaCode,
      aula: pageMeta.aula ?? docMeta.aula,
      unidade: pageMeta.unidade ?? docMeta.unidade,
      keywords: Array.from(new Set([...docMeta.keywords, ...pageMeta.keywords])),
      title: docMeta.documentTitle,
    };
  });

  const docs = await splitter.createDocuments(pageTexts, pageMetadatas);

  const client = await clientPromise;
  const db = client.db('ragchat');
  const collection = db.collection('documents');

  // Remove chunks antigos do mesmo documento neste tópico se houver
  await collection.deleteMany({ source: file.name, materia });

  // Armazena o arquivo original no GridFS do MongoDB para visualização e download
  const bucket = new GridFSBucket(db, { bucketName: 'pdf_files' });

  // Remove versões antigas do mesmo arquivo na mesma matéria se houver
  const existing = await bucket.find({ filename: file.name, 'metadata.materia': materia }).toArray();
  for (const doc of existing) {
    await bucket.delete(doc._id);
  }

  const uploadStream = bucket.openUploadStream(file.name, {
    metadata: {
      materia,
      contentType,
      size: file.size,
      uploadedAt: new Date(),
    },
  });

  await new Promise<void>((resolve, reject) => {
    const nodeReadable = Readable.from(Buffer.from(arrayBuffer));
    nodeReadable
      .pipe(uploadStream)
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

  // Garante que campos top-level de metadados e keywords estejam sincronizados para queries rápidas e filtros
  try {
    await collection.updateMany(
      { source: file.name, materia },
      [
        {
          $set: {
            ua: '$metadata.ua',
            uaCode: '$metadata.uaCode',
            aula: '$metadata.aula',
            unidade: '$metadata.unidade',
            keywords: '$metadata.keywords',
            title: '$metadata.title',
          },
        },
      ]
    );
  } catch (err) {
    console.warn('Erro ao sincronizar campos top-level de metadados:', err);
  }

  if (batchId) {
    await recordBatchFileStatus(batchId, file.name, {
      status: 'completed',
      pages: pages.length,
      chunks: docs.length,
    });
  }

  return {
    filename: file.name,
    pages: pages.length,
    chunks: docs.length,
    success: true,
  };
}

export async function POST(req: NextRequest) {
  try {
    await ensureVectorIndex();
    const formData = await req.formData();
    const materia = formData.get('materia') as string;
    const batchId = (formData.get('batchId') as string) || `batch_${Date.now()}`;

    if (!materia) {
      return NextResponse.json({ error: 'Parâmetro "materia" é obrigatório.' }, { status: 400 });
    }

    // Suporta múltiplos arquivos enviados via "files" ou arquivo único via "file"
    let files = formData.getAll('files') as File[];
    if (files.length === 0) {
      const single = formData.get('file') as File;
      if (single) files.push(single);
    }

    if (files.length === 0) {
      return NextResponse.json(
        { error: 'Nenhum arquivo (PDF, Markdown ou Texto) fornecido para upload.' },
        { status: 400 }
      );
    }

    // Registra todos os arquivos na fila do Redis
    for (const f of files) {
      await recordBatchFileStatus(batchId, f.name, {
        filename: f.name,
        materia,
        size: f.size,
        status: 'queued',
      });
    }

    // Processamento sequencial em lote para garantir estabilidade do Ollama e MongoDB
    const results: ProcessFileResult[] = [];
    for (const file of files) {
      try {
        const res = await processSingleDocument(file, materia, batchId);
        results.push(res);
      } catch (err: any) {
        console.error(`Erro ao processar arquivo "${file.name}":`, err);
        results.push({
          filename: file.name,
          pages: 0,
          chunks: 0,
          success: false,
          error: err.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalChunks = results.reduce((acc, r) => acc + (r.chunks || 0), 0);

    return NextResponse.json({
      success: successCount > 0,
      batchId,
      totalFiles: files.length,
      successCount,
      totalChunks,
      results,
      // Retrocompatibilidade para chamadas de arquivo único
      chunks: totalChunks,
    });
  } catch (error: any) {
    console.error('Erro na rota de upload:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
