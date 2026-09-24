import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from '@langchain/community/llms/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import clientPromise, { ensureVectorIndex } from '@/lib/mongodb';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { searchWeb, detectWebSearchIntent } from '@/lib/tools/webSearch';

export type ChatSource = {
  id: string;
  index: number;
  type: 'document' | 'web';
  title: string;
  source: string;
  url?: string;
  snippet: string;
  materia?: string;
};

export async function POST(req: NextRequest) {
  try {
    await ensureVectorIndex();
    const { messages, materia, webSearch } = await req.json();
    const currentMessageContent = messages[messages.length - 1].content;

    if (!materia) {
      return NextResponse.json({ error: 'Matéria não fornecida' }, { status: 400 });
    }

    const isGlobal = materia === 'Geral';
    const shouldSearchWeb = Boolean(webSearch) || detectWebSearchIntent(currentMessageContent);

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
      filter: isGlobal ? undefined : { preFilter: { materia: { $eq: materia } } },
      k: 4,
    });

    // 1. Retrieve documents from Vector Store
    let retrievedDocs: any[] = [];
    try {
      retrievedDocs = await retriever.invoke(currentMessageContent);
    } catch (err) {
      console.warn('Retriever fallback:', err);
    }

    // 2. Format structured generic sources (Perplexity style)
    const sources: ChatSource[] = [];
    const seen = new Set<string>();

    // 2a. Add document sources
    retrievedDocs.forEach((doc) => {
      const srcName = doc.metadata?.source || doc.source || 'Documento';
      const docMateria = doc.metadata?.materia || doc.materia || materia;
      const snippet = doc.pageContent ? doc.pageContent.trim() : '';

      // Avoid duplicate cards for same document and same snippet start
      const key = `${srcName}-${snippet.slice(0, 60)}`;
      if (!seen.has(key) && snippet.length > 0) {
        seen.add(key);
        const index = sources.length + 1;
        sources.push({
          id: `doc-${index}`,
          index,
          type: 'document',
          title: srcName,
          source: srcName,
          snippet: snippet.length > 350 ? snippet.slice(0, 350) + '...' : snippet,
          materia: docMateria,
        });
      }
    });

    // 2b. Add Web Search sources if enabled or detected
    if (shouldSearchWeb) {
      try {
        const webResults = await searchWeb(currentMessageContent, 4);
        webResults.forEach((item) => {
          const key = `web-${item.url}`;
          if (!seen.has(key) && item.snippet.length > 0) {
            seen.add(key);
            const index = sources.length + 1;
            sources.push({
              id: `web-${index}`,
              index,
              type: 'web',
              title: item.title,
              source: item.source,
              url: item.url,
              snippet: item.snippet.length > 350 ? item.snippet.slice(0, 350) + '...' : item.snippet,
              materia: 'Web',
            });
          }
        });
      } catch (webErr) {
        console.warn('Web search failed or timed out:', webErr);
      }
    }

    // 3. Format context string with [1], [2] labels for LLM grounding
    const contextString =
      sources.length > 0
        ? sources
            .map((s) => {
              if (s.type === 'web') {
                return `[${s.index}] Fonte Web: ${s.title} (Origem: ${s.source} | URL: ${s.url})\nConteúdo: ${s.snippet}`;
              }
              return `[${s.index}] Documento: ${s.title} (Matéria: ${s.materia})\nConteúdo: ${s.snippet}`;
            })
            .join('\n\n---\n\n')
        : 'Nenhum documento ou fonte web relevante encontrada.';

    // 4. Setup Ollama LLM
    const llm = new Ollama({
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
    });

    let scopeDescription = isGlobal
      ? 'em todas as matérias cadastradas no acervo global'
      : `na matéria "${materia}"`;

    if (shouldSearchWeb) {
      scopeDescription += ' e com acesso a pesquisas na Web em tempo real';
    }

    const prompt = PromptTemplate.fromTemplate(`
Você é um assistente acadêmico especializado {scopeDescription}.
Responda à pergunta do usuário baseando-se no contexto das fontes abaixo (documentos do acervo e/ou resultados da Web). Se não houver contexto suficiente ou nenhuma fonte relevante, informe educadamente que ainda não há informações cadastradas sobre o assunto.
Seja claro, objetivo, educado e use formatação Markdown quando necessário.

Diretriz de citação de fontes (estilo Perplexity):
Ao mencionar fatos, dados ou informações extraídas das fontes (documentos ou web), cite a referência numérica entre colchetes como [1], [2] ao final da frase correspondente.

Diretriz de formatação: Vá direto à explicação. NUNCA inicie sua resposta com títulos como "Resposta:", "**Resposta:**", "Resposta" ou repetindo a pergunta. Comece diretamente respondendo.

Contexto das Fontes:
{context}

Pergunta:
{question}
`);

    const chain = RunnableSequence.from([
      prompt,
      llm,
      new StringOutputParser(),
    ]);

    const stream = await chain.stream({
      context: contextString,
      question: currentMessageContent,
      scopeDescription,
    });

    // 5. Stream response via SSE with sources event followed by tokens
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        // Enqueue sources first so the client can display sources immediately
        controller.enqueue(
          encoder.encode(`event: sources\ndata: ${JSON.stringify(sources)}\n\n`)
        );

        for await (const chunk of stream) {
          controller.enqueue(
            encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`)
          );
        }

        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
        controller.close();
      },
    });

    return new Response(readableStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (e: any) {
    console.error('Error in /api/chat:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
