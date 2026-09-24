import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { GridFSBucket } from 'mongodb';
import { Readable } from 'stream';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get('filename');
    const materia = searchParams.get('materia');

    if (!filename) {
      return NextResponse.json({ error: 'Parâmetro "filename" é obrigatório.' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const bucket = new GridFSBucket(db, { bucketName: 'pdf_files' });

    // Tenta encontrar o arquivo por nome e matéria
    const filter: any = { filename };
    if (materia && materia !== 'Geral') {
      filter['metadata.materia'] = materia;
    }

    let files = await bucket.find(filter).sort({ uploadDate: -1 }).limit(1).toArray();

    // Fallback: se não achar com filtro de matéria, busca só por nome
    if (files.length === 0) {
      files = await bucket.find({ filename }).sort({ uploadDate: -1 }).limit(1).toArray();
    }

    if (files.length === 0) {
      const htmlNotice = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Arquivo PDF - Não Disponível</title>
  <style>
    body {
      background-color: #0b0f19;
      color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 1.5rem;
      box-sizing: border-box;
    }
    .card {
      background: #131c2e;
      border: 1px solid #1e293b;
      padding: 2.5rem;
      border-radius: 1rem;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    h2 { color: #60a5fa; margin-top: 0; }
    p { color: #94a3b8; line-height: 1.6; }
    .badge {
      display: inline-block;
      background: rgba(59, 130, 246, 0.15);
      color: #93c5fd;
      padding: 0.35rem 0.75rem;
      border-radius: 0.4rem;
      font-weight: 600;
      margin: 0.75rem 0;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>📄 Arquivo PDF não armazenado</h2>
    <div class="badge">${filename}</div>
    <p>Os trechos e embeddings deste documento estão indexados e funcionando normalmente no RAG, porém o arquivo PDF bruto foi carregado antes da ativação do armazenamento de arquivos completos.</p>
    <p>Para poder visualizar e folhear o PDF original, basta fazer o upload novamente no painel de matérias.</p>
  </div>
</body>
</html>`;
      return new NextResponse(htmlNotice, {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const fileDoc = files[0];
    const nodeStream = bucket.openDownloadStream(fileDoc._id);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': fileDoc.length.toString(),
      },
    });
  } catch (error: any) {
    console.error('Error streaming PDF file:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
