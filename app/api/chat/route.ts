import { NextRequest, NextResponse } from 'next/server';
import { Ollama } from '@langchain/community/llms/ollama';
import clientPromise, { ensureVectorIndex } from '@/lib/mongodb';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { searchWeb, detectWebSearchIntent } from '@/lib/tools/webSearch';
import { runIntelligentRAG } from '@/lib/rag/subagent';
import { CustomAgent } from '@/lib/agents/types';
import { DEFAULT_AGENTS } from '@/lib/agents/defaultAgents';

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
    const { messages, materia, webSearch, agentId } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma mensagem fornecida' }, { status: 400 });
    }

    const currentMessageContent = messages[messages.length - 1].content;
    const previousMessages = messages.slice(0, -1);

    if (!materia) {
      return NextResponse.json({ error: 'Tópico não fornecido' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db('ragchat');

    // Recupera o agente selecionado para a conversa
    let activeAgent: CustomAgent | null = null;
    if (agentId) {
      activeAgent = await db.collection<CustomAgent>('agents').findOne({ id: agentId });
    }
    if (!activeAgent) {
      activeAgent = DEFAULT_AGENTS[0];
    }

    // Identifica se uma matéria específica deve ser consultada pelo agente como ferramenta
    let consultMateria = materia;
    if (materia === 'Geral' && activeAgent.canConsultTopics) {
      const subjectsInDb = await db.collection('documents').distinct('materia');
      const lowerQuery = currentMessageContent.toLowerCase();
      const matched = subjectsInDb.find(
        (s) => s && s !== 'Geral' && lowerQuery.includes(s.toLowerCase())
      );
      if (matched) {
        consultMateria = matched;
      }
    }

    const isGlobal = consultMateria === 'Geral';
    const shouldSearchWeb = Boolean(webSearch) || detectWebSearchIntent(currentMessageContent);

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

          // 1. Interação e consulta ao Especialista da Matéria como ferramenta
          if (activeAgent && activeAgent.id !== 'agent_rag_general') {
            sendStatus(`${activeAgent.avatar || '🤖'} [${activeAgent.name}] Analisando solicitação e ativando persona...`);
          }

          if (consultMateria !== 'Geral') {
            sendStatus(`🔍 [${activeAgent?.name || 'Agente'}] Consultando especialista na matéria "${consultMateria}" como ferramenta...`);
          } else {
            sendStatus(`🔍 [${activeAgent?.name || 'Agente'}] Consultando acervo geral de documentos...`);
          }

          const ragResult = await runIntelligentRAG(
            currentMessageContent,
            consultMateria,
            sendStatus,
            previousMessages.slice(-4)
          );
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
            : `na matéria "${consultMateria}"`;

          if (shouldSearchWeb) {
            scopeDescription += ' e com acesso a pesquisas na Web em tempo real';
          }

          const technicalTermHint = ragResult.expansion?.termoTecnicoPrincipal
            ? `Termo técnico/formal correspondente no acervo: "${ragResult.expansion.termoTecnicoPrincipal}". Se a pergunta utilizou termos populares ou coloquiais, faça uma menção natural à nomenclatura formal adotada nos documentos para esclarecer o usuário com clareza.`
            : '';

          const topicTransitionHint = ragResult.expansion?.mudouDeAssunto
            ? `\nAVISO DE TRANSIÇÃO DE TÓPICO:
O usuário MUDOU DE ASSUNTO em relação às mensagens anteriores.
Novo assunto atual em foco: "${ragResult.expansion.assuntoAtual || currentMessageContent}".
Responda EXCLUSIVAMENTE sobre o novo assunto solicitado. NUNCA misture nem responda com elementos do assunto anterior da conversa.\n`
            : '';

          const agentPromptTemplate = activeAgent.systemPrompt || DEFAULT_AGENTS[0].systemPrompt;

          const prompt = PromptTemplate.fromTemplate(`
${agentPromptTemplate}

{technicalTermHint}
{topicTransitionHint}

CONSULTA TÉCNICA AO ESPECIALISTA DA MATÉRIA ("{consultMateria}"):
Abaixo estão os trechos e fontes oficiais levantados pelo especialista no acervo documental:
---
{context}
---

DIRETRIZES DE EXECUÇÃO:
- Assuma integralmente a sua persona, tom de voz e regras descritas no seu prompt acima.
- Utilize com rigor os dados e orientações fornecidos pelo especialista na "CONSULTA TÉCNICA" para fundamentar a resposta.
- Ao citar fatos, procedimentos ou dados das fontes, inclua a referência numérica entre colchetes como [1], [2] ao final da frase correspondente.
- NUNCA invente informações não presentes nas fontes ou no histórico.
- NUNCA inicie sua resposta com títulos como "Resposta:", "**Resposta:**", "Resposta" ou repetindo a pergunta. Comece diretamente com a sua resposta.

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
            consultMateria,
            scopeDescription,
            technicalTermHint,
            topicTransitionHint,
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
