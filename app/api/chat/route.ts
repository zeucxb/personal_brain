import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from '@langchain/community/llms/ollama';
import { ensureVectorIndex } from '@/lib/mongodb';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { searchWeb, detectWebSearchIntent } from '@/lib/tools/webSearch';
import { runIntelligentRAG } from '@/lib/rag/subagent';

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
  technicalTerm?: string;
  evalMotivo?: string;
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
      return NextResponse.json({ error: 'Tópico não fornecido' }, { status: 400 });
    }

    const isGlobal = materia === 'Geral';
    const shouldSearchWeb = Boolean(webSearch) || detectWebSearchIntent(currentMessageContent);

    // Contextual memory query refinement for follow-up questions
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

    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          const sendStatus = (statusText: string) => {
            try {
              controller.enqueue(
                encoder.encode(`event: status\ndata: ${JSON.stringify({ message: statusText })}\n\n`)
              );
            } catch (e) {}
          };

          // 1. Subagente Inteligente de RAG (Expansão, Busca Híbrida e Avaliação de Relevância)
          sendStatus('🔍 Analisando pergunta e identificando termos técnicos...');
          const ragResult = await runIntelligentRAG(searchQuery, materia, sendStatus);
          const relevantDocs = ragResult.relevantDocs;

          // 2. Formatação das fontes de documentos aprovadas pelo avaliador
          const sources: ChatSource[] = [];
          const seen = new Set<string>();

          relevantDocs.forEach((doc) => {
            const srcName = doc.source || 'Documento';
            const docMateria = doc.materia || materia;
            const docPage = doc.page;
            const snippet = doc.text.trim();

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
                technicalTerm: ragResult.expansion?.termoTecnicoPrincipal,
                evalMotivo: doc.motivo,
              });
            }
          });

          // 3. Busca Web adicional se ativada ou se nenhum documento relevante foi encontrado
          if (shouldSearchWeb || (sources.length === 0 && Boolean(webSearch))) {
            sendStatus('🌐 Consultando fontes e links relevantes na Web...');
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

          // Envia as fontes avaliadas e filtradas para o cliente imediatamente
          controller.enqueue(
            encoder.encode(`event: sources\ndata: ${JSON.stringify(sources)}\n\n`)
          );

          sendStatus('✍️ Gerando resposta fundamentada...');

          // 4. Histórico recente da conversa para contexto iterativo
          const recentHistory = previousMessages.slice(-8);
          const chatHistoryBlock =
            recentHistory.length > 0
              ? `Histórico recente da conversa:\n` +
                recentHistory
                  .map((m: any) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
                  .join('\n\n') +
                '\n\n---\n'
              : '';

          // 5. Contexto das fontes com referências [1], [2]
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

          // 6. Configuração do LLM
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

          const technicalTermHint = ragResult.expansion?.termoTecnicoPrincipal
            ? `Nota técnica de vocabulário do fabricante/manual: Termo técnico correspondente no acervo: "${ragResult.expansion.termoTecnicoPrincipal}". Se a pergunta usou termo popular (como "seta" ou "painel"), esclareça naturalmente ao usuário como o item é denominado no manual oficial para maior clareza.`
            : '';

          const prompt = PromptTemplate.fromTemplate(`
Você é um assistente técnico e acadêmico especializado {scopeDescription}.
Seu objetivo é ajudar o usuário com respostas precisas, claras e estritamente fundamentadas nas fontes consultadas.

${technicalTermHint}

Memória e Iteração da Conversa:
Você tem acesso ao histórico desta conversa. Quando o usuário pedir para refinar, resumir, expandir, alterar o tom ou construir um texto com base no que já foi discutido, utilize o histórico da conversa e as fontes consultadas para compor a resposta de forma coesa, precisa e bem fundamentada.

Diretriz de citação de fontes (estilo Perplexity):
Ao mencionar fatos, dados, orientações ou procedimentos extraídos das fontes (documentos ou web), cite a referência numérica entre colchetes como [1], [2] ao final da frase correspondente.

Diretriz de precisão estrita:
- NUNCA invente informações não presentes nas fontes ou no histórico.
- Responda diretamente ao que foi perguntado.
- NUNCA inicie sua resposta com títulos como "Resposta:", "**Resposta:**", "Resposta" ou repetindo a pergunta. Comece diretamente explicando.

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

          for await (const chunk of stream) {
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`)
            );
          }

          controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
          controller.close();
        } catch (streamErr: any) {
          console.error('Error during streaming in /api/chat:', streamErr);
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: streamErr.message })}\n\n`)
          );
          controller.close();
        }
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
