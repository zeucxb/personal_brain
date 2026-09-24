import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from '@langchain/community/llms/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import clientPromise, { ensureVectorIndex } from '@/lib/mongodb';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';

function formatDocumentsAsString(documents: any[]) {
  if (!documents || documents.length === 0) return 'Nenhum documento encontrado para esta matéria.';
  return documents
    .map((doc) => {
      const src = doc.metadata?.source ? `[Documento: ${doc.metadata.source}]\n` : '';
      return `${src}${doc.pageContent}`;
    })
    .join('\n\n---\n\n');
}

export async function POST(req: NextRequest) {
  try {
    await ensureVectorIndex();
    const { messages, materia } = await req.json();
    const currentMessageContent = messages[messages.length - 1].content;

    if (!materia) {
      return NextResponse.json({ error: 'Matéria não fornecida' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');
    const collection = db.collection('documents');

    const embeddings = new OllamaEmbeddings({
      model: 'nomic-embed-text',
      baseUrl: 'http://localhost:11434',
    });

    const vectorStore = new MongoDBAtlasVectorSearch(embeddings, {
      collection,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding',
    });

    const retriever = vectorStore.asRetriever({
      filter: { preFilter: { materia: { $eq: materia } } },
      k: 5,
    });

    const llm = new Ollama({
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
    });

    const prompt = PromptTemplate.fromTemplate(`
Você é um assistente acadêmico especializado na matéria "{materia}".
Responda à pergunta do usuário baseando-se no contexto extraído dos documentos abaixo. Se não houver contexto suficiente ou nenhum documento relevante, informe educadamente que ainda não há documentos sobre o assunto cadastrados para essa matéria.
Seja claro, educado e use formatação Markdown quando necessário.

Contexto dos Documentos:
{context}

Pergunta: {question}

Resposta:
`);

    const chain = RunnableSequence.from([
      {
        context: async (input: { question: string; materia: string }) => {
          try {
            const docs = await retriever.invoke(input.question);
            return formatDocumentsAsString(docs);
          } catch (err) {
            console.warn('Retriever fallback:', err);
            return 'Nenhum documento encontrado.';
          }
        },
        question: (input: { question: string; materia: string }) => input.question,
        materia: (input: { question: string; materia: string }) => input.materia,
      },
      prompt,
      llm,
      new StringOutputParser(),
    ]);

    const stream = await chain.stream({
      question: currentMessageContent,
      materia,
    });

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
