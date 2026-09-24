import clientPromise from '@/lib/mongodb';
import { extractDocumentMetadata } from './metadata';

/**
 * Atualiza todos os documentos existentes no MongoDB com metadados estruturados e palavras-chave.
 */
export async function syncAllDocumentMetadata(): Promise<{ total: number; updated: number }> {
  const client = await clientPromise;
  const db = client.db('ragchat');
  const collection = db.collection('documents');

  const cursor = collection.find({});
  let total = 0;
  let updated = 0;

  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (!doc) break;
    total++;

    const filename = doc.source || doc.metadata?.source || '';
    const text = doc.text || doc.pageContent || '';
    const meta = extractDocumentMetadata(filename, text);

    const updateFields: any = {
      keywords: meta.keywords,
    };

    if (meta.ua !== undefined) updateFields.ua = meta.ua;
    if (meta.uaCode !== undefined) updateFields.uaCode = meta.uaCode;
    if (meta.aula !== undefined) updateFields.aula = meta.aula;
    if (meta.unidade !== undefined) updateFields.unidade = meta.unidade;
    if (meta.capitulo !== undefined) updateFields.capitulo = meta.capitulo;
    if (meta.documentTitle !== undefined) updateFields.documentTitle = meta.documentTitle;

    // Também sincroniza dentro do objeto metadata embutido
    updateFields['metadata.keywords'] = meta.keywords;
    if (meta.ua !== undefined) updateFields['metadata.ua'] = meta.ua;
    if (meta.uaCode !== undefined) updateFields['metadata.uaCode'] = meta.uaCode;
    if (meta.aula !== undefined) updateFields['metadata.aula'] = meta.aula;
    if (meta.unidade !== undefined) updateFields['metadata.unidade'] = meta.unidade;

    await collection.updateOne({ _id: doc._id }, { $set: updateFields });
    updated++;
  }

  return { total, updated };
}
