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
  page?: number;
  snippet: string;
  materia?: string;
};

export async function POST(req: NextRequest) {
  try {
    await ensureVectorIndex();
    const { messages, materia, webSearch } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma mensagem fornecida' }, { status: 400 });
    }

    const currentMessageContent = messages[messages.length - 1].content;
    const previousMessages = messages.slice(0, -1);

    if (!materia) {
      return NextResponse.json({ error: 'Matéria não fornecida' }, { status: 400 });
    }

    const isGlobal = materia === 'Geral';
    const shouldSearchWeb = Boolean(webSearch) || detectWebSearchIntent(currentMessageContent);

    // If current message is a follow-up/refinement (e.g. "resuma isso", "elabore um texto para o fórum"),
    // combine with previous user topic so vector search/web search continues retrieving relevant chunks.
    let searchQuery = currentMessageContent;
    if (previousMessages.length > 0) {
      const lastUserMsg = [...previousMessages].reverse().find((m: any) => m.role === 'user');
      const isFollowUp =
        /^(isso|esse|essa|ele|ela|o mesmo|resuma|transforme|elabore|reescreva|melhore|adapte|faça|monte|adicione|retire|coloque)\b/i.test(
          currentMessageContent.trim()
        ) || currentMessageContent.trim().length < 50;

      if (lastUserMsg && isFollowUp) {
        searchQuery = `${lastUserMsg.content} - ${currentMessageContent}`;
      }
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
      filter: isGlobal ? undefined : { preFilter: { materia: { $eq: materia } } },
      k: 4,
    });

    // 1. Retrieve documents from Vector Store
    let retrievedDocs: any[] = [];
    try {
      retrievedDocs = await retriever.invoke(searchQuery);
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
      const docPage = doc.metadata?.page || doc.page;
      const snippet = doc.pageContent ? doc.pageContent.trim() : '';

      // Avoid duplicate cards for same document and same snippet start
      const key = `${srcName}-p${docPage || 0}-${snippet.slice(0, 60)}`;
      if (!seen.has(key) && snippet.length > 0) {
        seen.add(key);
        const index = sources.length + 1;
        let fileUrl = `/api/documents/file?filename=${encodeURIComponent(srcName)}&materia=${encodeURIComponent(docMateria)}`;
        if (docPage) {
          fileUrl += `#page=${docPage}`;
        }
        sources.push({
          id: `doc-${index}`,
          index,
          type: 'document',
          title: srcName,
          source: srcName,
          url: fileUrl,
          page: typeof docPage === 'number' ? docPage : undefined,
          snippet: snippet.length > 350 ? snippet.slice(0, 350) + '...' : snippet,
          materia: docMateria,
        });
      }
    });

    // 2b. Add Web Search sources if enabled or detected
    if (shouldSearchWeb) {
      try {
        const webResults = await searchWeb(searchQuery, 4);
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

    // 3. Format conversational memory history (last 8 messages)
    const recentHistory = previousMessages.slice(-8);
    const chatHistoryBlock =
      recentHistory.length > 0
        ? `Histórico recente da conversa:\n` +
          recentHistory
            .map((m: any) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
            .join('\n\n') +
          '\n\n---\n'
        : '';

    // 4. Format context string with [1], [2] labels for LLM grounding
    const contextString =
      sources.length > 0
        ? sources
            .map((s) => {
              if (s.type === 'web') {
                return `[${s.index}] Fonte Web: ${s.title} (Origem: ${s.source} | URL: ${s.url})\nConteúdo: ${s.snippet}`;
              }
              return `[${s.index}] Documento: ${s.title} (Tópico: ${s.materia}${s.page ? ` | Pág. ${s.page}` : ''})\nConteúdo: ${s.snippet}`;
            })
            .join('\n\n---\n\n')
        : 'Nenhum documento ou fonte web relevante encontrada.';

    // 5. Setup Ollama LLM
    const llm = new Ollama({
      model: 'llama3',
      baseUrl: 'http://localhost:11434',
    });

    let scopeDescription = isGlobal
      ? 'em todos os tópicos cadastrados no acervo global'
      : `no tópico "${materia}"`;

    if (shouldSearchWeb) {
      scopeDescription += ' e com acesso a pesquisas na Web em tempo real';
    }

    const prompt = PromptTemplate.fromTemplate(`
Você é um assistente acadêmico especializado {scopeDescription}.
Seu objetivo é ajudar o usuário a estudar, esclarecer dúvidas, estruturar respostas para fóruns acadêmicos, redações e atividades.

Memória e Iteração da Conversa:
Você tem acesso ao histórico desta conversa. Quando o usuário pedir para refinar, resumir, expandir, alterar o tom ou construir um texto (como para um fórum da faculdade) com base no que já foi discutido, utilize o histórico da conversa e as fontes consultadas para compor a resposta de forma coesa, precisa e bem fundamentada.

Diretriz de citação de fontes (estilo Perplexity):
Ao mencionar fatos, dados ou informações extraídas das fontes (documentos ou web), cite a referência numérica entre colchetes como [1], [2] ao final da frase correspondente. Mantenha ou adapte as citações de fontes relevantes mesmo ao reformular o texto.

Diretriz de formatação: Vá direto à explicação ou ao texto solicitado. NUNCA inicie sua resposta com títulos como "Resposta:", "**Resposta:**", "Resposta" ou repetindo a pergunta. Comece diretamente respondendo.

Contexto das Fontes:
{context}

{chatHistory}
Mensagem atual do Usuário:
{question}
`);

    const chain = RunnableSequence.from([
      prompt,
      llm,
      new StringOutputParser(),
    ]);

    const stream = await chain.stream({
      context: contextString,
      chatHistory: chatHistoryBlock,
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
