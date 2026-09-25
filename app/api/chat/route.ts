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
import { CustomSkill } from '@/lib/skills/types';
import { DEFAULT_SKILLS } from '@/lib/skills/defaultSkills';
import { AVAILABLE_TOOLS, AvailableToolId } from '@/lib/tools/catalog';
import { getBestAvailableVisionModel, streamOllamaVision } from '@/lib/tools/visionHelper';

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

function detectEditPromptIntent(msg: string): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase().trim();

  // Se for apenas uma dúvida geral sobre o que é um prompt ou como funciona conceitualmente, não é edição do agente
  if (lower.startsWith('o que é prompt') || lower.startsWith('o que e prompt') || lower.startsWith('como funciona o prompt')) {
    return false;
  }

  const patterns = [
    // Verbos de ação + prompt / persona / regras / instruções / diretrizes
    /(?:melhor(?:a|e|ar)|mud(?:a|e|ar)|alter(?:a|e|ar)|edit(?:a|e|ar)|atualiz(?:a|e|ar)|ajust(?:a|e|ar)|troc(?:a|e|ar)|redefin(?:a|e|ir)|otimiz(?:a|e|ar))\s+(?:o\s+|a\s+|seu\s+|sua\s+|os\s+|as\s+)?(?:prompt|persona|instru[çc][õo]es|regras|comportamento|tom\s+de\s+voz|diretrizes)/i,
    // "prompt do agente", "regras da skill", etc.
    /(?:prompt|persona|instru[çc][õo]es|regras|diretrizes)\s+(?:d[oe]\s+|para\s+o\s+)?(?:agent[ea]|skill|assistente|sistema)/i,
    // "adicione ao seu prompt", "inclua nas suas regras", etc.
    /(?:adicion(?:a|e|ar)|inclu(?:a|i|ir)|salv(?:a|e|ar)|incorpor(?:a|e|ar)|coloqu(?:e|a|ar))\s+(?:ao|na|no|nas|nos)\s+(?:seu\s+|sua\s+)?(?:prompt|persona|regras|instru[çc][õo]es|diretrizes)/i,
    // "passe a responder", "mude o seu tom"
    /(?:pass(?:e|a|ar)\s+a\s+responder|comport(?:e|a|ar)-se|aja\s+como|mude\s+(?:o\s+)?(?:seu\s+)?tom)/i,
    // "atualize o agente", "edite a skill", etc.
    /(?:atualiz(?:a|e|ar)|edit(?:a|e|ar)|melhor(?:a|e|ar)|modific(?:a|e|ar))\s+(?:o\s+|a\s+)?(?:agente|skill)/i,
    /auto-evolu[çc][ãa]o/i,
  ];

  return patterns.some((p) => p.test(lower));
}

export async function POST(req: NextRequest) {
  try {
    await ensureVectorIndex();
    const { messages, materia, webSearch, agentId, skillId, image, images } = await req.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Nenhuma mensagem fornecida' }, { status: 400 });
    }

    const rawImages: string[] = [];
    if (typeof image === 'string' && image.trim()) {
      rawImages.push(image.trim());
    }
    if (Array.isArray(images)) {
      for (const img of images) {
        if (typeof img === 'string' && img.trim()) {
          rawImages.push(img.trim());
        }
      }
    }
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.image && typeof lastMsg.image === 'string' && !rawImages.includes(lastMsg.image)) {
      rawImages.push(lastMsg.image);
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

    // Recupera a skill / ferramenta selecionada (Fórum, Flashcards, Simulado, Mapa Mental, Infográfico)
    let activeSkill: CustomSkill | null = null;
    if (skillId) {
      activeSkill = await db.collection<CustomSkill>('skills').findOne({ id: skillId });
      if (!activeSkill) {
        activeSkill = DEFAULT_SKILLS.find((s) => s.id === skillId) || null;
      }
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

    // Identifica ferramentas habilitadas (via Skill ou intenção explícita na mensagem)
    const activeToolIds = new Set<AvailableToolId>(activeSkill?.tools || []);

    const lowerMsg = currentMessageContent.toLowerCase();
    if (lowerMsg.includes('html') || lowerMsg.includes('web app') || lowerMsg.includes('página web') || lowerMsg.includes('interface web')) {
      activeToolIds.add('tool_html_preview');
    }
    if (lowerMsg.includes('imagem') || lowerMsg.includes('ilustração') || lowerMsg.includes('desenhe') || lowerMsg.includes('desenho') || lowerMsg.includes('foto')) {
      activeToolIds.add('tool_generate_image');
    }
    if (lowerMsg.includes('pdf') || lowerMsg.includes('apostila') || lowerMsg.includes('imprimir') || lowerMsg.includes('relatório')) {
      activeToolIds.add('tool_generate_pdf');
    }
    if (lowerMsg.includes('diagrama') || lowerMsg.includes('fluxograma') || lowerMsg.includes('mapa mental') || lowerMsg.includes('mindmap')) {
      activeToolIds.add('tool_diagram');
    }
    const isEditPromptIntent = detectEditPromptIntent(currentMessageContent);
    if (isEditPromptIntent) {
      activeToolIds.add('tool_edit_prompt');
    }

    const activeToolDefs = AVAILABLE_TOOLS.filter((t) => activeToolIds.has(t.id));

    const isGlobal = consultMateria === 'Geral';
    const shouldSearchWeb = Boolean(webSearch) || detectWebSearchIntent(currentMessageContent) || activeToolIds.has('tool_web_search');

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

          if (activeSkill) {
            sendStatus(`⚡ [Skill: ${activeSkill.name}] ${activeSkill.icon} Aplicando diretrizes de formatação especializada...`);
          }

          if (activeToolDefs.length > 0) {
            const toolBadges = activeToolDefs.map((t) => `${t.icon} ${t.name}`).join(' • ');
            sendStatus(`🛠️ [Tools Ativadas] ${toolBadges}`);
          }

          // Se for intenção explícita de Auto-Evolução / edição de prompt, executa branch dedicada sem poluição de RAG
          if (isEditPromptIntent) {
            sendStatus('✨ [Auto-Evolução] Analisando regras atuais e gerando proposta para aprovação...');

            // Limpa fontes no cliente para evitar poluição visual de acervo documental
            controller.enqueue(
              encoder.encode(`event: sources\ndata: ${JSON.stringify([])}\n\n`)
            );

            const recentHistory = previousMessages.slice(-8);
            const chatHistoryBlock =
              recentHistory.length > 0
                ? `HISTÓRICO RECENTE DA CONVERSA:\n` +
                  recentHistory
                    .map((m: any) => `${m.role === 'user' ? 'Usuário' : 'Assistente'}: ${m.content}`)
                    .join('\n\n') +
                  '\n\n---\n'
                : '';

            const targetType = lowerMsg.includes('skill') && activeSkill ? 'skill' : 'agent';
            const targetName = targetType === 'skill' ? activeSkill!.name : activeAgent.name;
            const targetId = targetType === 'skill' ? activeSkill!.id : activeAgent.id;
            const currentPrompt = targetType === 'skill' ? activeSkill!.promptInstruction : activeAgent.systemPrompt;
            const currentDesc = (targetType === 'skill' ? activeSkill!.description : activeAgent.description) || '';

            const evolutionPrompt = `
Você é uma inteligência artificial especialista em ENGENHARIA DE PROMPTS e AUTO-EVOLUÇÃO DE AGENTES.
O usuário está conversando com você com o objetivo explícito de AJUSTAR, MELHORAR ou ATUALIZAR as diretrizes do seu próprio sistema (${targetType === 'skill' ? 'da Skill' : 'do Agente'} "${targetName}").

DADOS ATUAIS (${targetType === 'skill' ? 'DA SKILL' : 'DO AGENTE'} "${targetName}"):
- ID: "${targetId}"
- Nome: "${targetName}"
- Descrição Atual: "${currentDesc}"
- Prompt de Sistema Atual:
"""
${currentPrompt}
"""

${chatHistoryBlock}

SOLICITAÇÃO DO USUÁRIO:
"${currentMessageContent}"

SUA MISSÃO OBRIGATÓRIA:
1. Responda em português com 1 ou 2 parágrafos amigáveis e explicativos explicando detalhadamente o que você ajustou e aprimorou no prompt do ${targetType === 'skill' ? 'da skill' : 'do agente'} para atender ao pedido do usuário (por exemplo: adicionando regras contra redundâncias, garantindo escrita fluida e natural, definindo tom de voz, removendo seções burocráticas, etc.).
2. Em seguida, você DEVE OBRIGATORIAMENTE gerar um bloco de código markdown no formato exato \`\`\`prompt-proposal contendo o seguinte JSON:

\`\`\`prompt-proposal
{
  "target": "${targetType}",
  "id": "${targetId}",
  "name": "${targetName}",
  "description": "${currentDesc}",
  "systemPrompt": "<coloque aqui o prompt de sistema COMPLETO, combinando o prompt original com as novas diretrizes solicitadas pelo usuário>",
  "rationale": "<resumo conciso de 1 frase do que foi adicionado ou modificado nesta proposta>"
}
\`\`\`

REGRAS CRÍTICAS:
- O bloco de código DEVE usar a tag \`\`\`prompt-proposal no início e fechar com \`\`\`.
- O campo "systemPrompt" NUNCA deve conter reticências (...) nem ser resumido. Ele deve ser o prompt COMPLETO pronto para ser executado e salvo no banco de dados.
- Mantenha toda a boa estrutura do prompt original e integre cirurgicamente as novas orientações pedidas pelo usuário.
- NÃO dê apenas dicas soltas em texto. Você DEVE obrigatoriamente gerar o bloco \`\`\`prompt-proposal para acionar o modal de aprovação na tela do usuário.
`.trim();

            const llm = new Ollama({
              model: 'llama3',
              baseUrl: 'http://localhost:11434',
            });

            const stream = await llm.stream(evolutionPrompt);
            for await (const chunk of stream) {
              controller.enqueue(
                encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`)
              );
            }

            controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
            controller.close();
            return;
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

          const skillInstructionBlock = activeSkill
            ? `\n=======================================================\nDIRETRIZES DA SKILL ESPECIALIZADA ATIVADA (${activeSkill.name} ${activeSkill.icon}):\n${activeSkill.promptInstruction}\n=======================================================\n`
            : '';

          let toolsInstructionBlock = '';
          if (activeToolDefs.length > 0) {
            toolsInstructionBlock =
              `\n=======================================================\nFERRAMENTAS (TOOLS) HABILITADAS PARA USO:\n` +
              activeToolDefs
                .map((t) => {
                  let instruction = t.systemPromptInstruction.trim();
                  if (t.id === 'tool_edit_prompt') {
                    instruction = instruction
                      .replace(/{current_agent_id}/g, activeAgent.id)
                      .replace(/{current_agent_name}/g, activeAgent.name);
                    instruction += `\n[DADOS ATUAIS DO AGENTE ATIVO]:\n- ID: "${activeAgent.id}"\n- Nome: "${activeAgent.name}"\n- Descrição Atual: "${activeAgent.description || ''}"\n- Prompt Atual do Agente:\n"""\n${activeAgent.systemPrompt}\n"""\n`;
                    if (activeSkill) {
                      instruction += `\n[DADOS ATUAIS DA SKILL ATIVA]:\n- ID: "${activeSkill.id}"\n- Nome: "${activeSkill.name}"\n- Descrição Atual: "${activeSkill.description || ''}"\n- Instruções Atuais da Skill:\n"""\n${activeSkill.promptInstruction}\n"""\n`;
                    }
                  }
                  return `• [${t.name} ${t.icon}]:\n${instruction}`;
                })
                .join('\n\n') +
              `\n=======================================================\n`;
          }

          // Roteamento Multimodal se houver imagem anexada
          if (rawImages.length > 0) {
            sendStatus('👁️ Localizando melhor modelo de visão instalado...');
            const visionModel = await getBestAvailableVisionModel();
            sendStatus(`👁️ Analisando imagem com modelo visual [${visionModel}]...`);

            const visionSystemPrompt = `
${agentPromptTemplate}

${skillInstructionBlock}
${toolsInstructionBlock}
${technicalTermHint}
${topicTransitionHint}

CONSULTA TÉCNICA AO ESPECIALISTA DA MATÉRIA ("${consultMateria}"):
Abaixo estão os trechos e fontes oficiais levantados pelo especialista no acervo documental:
---
${contextString}
---

DIRETRIZES DE EXECUÇÃO MULTIMODAL:
- Analise detalhadamente a(s) imagem(ns) enviada(s) pelo usuário juntamente com a pergunta.
- Se a imagem contiver texto, tabelas, código, diagramas ou fórmulas, faça a transcrição e interpretação precisa.
- Assuma integralmente a sua persona, tom de voz e regras descritas no seu prompt acima.
- Se uma SKILL especializada estiver ativada acima, siga RIGOROSAMENTE todas as diretrizes de formato, estrutura e regras da skill.
- Se FERRAMENTAS (TOOLS) estiverem habilitadas acima, utilize-as quando o formato exigir (ex: blocos de código html para páginas, diagramas mermaid).
- Utilize com rigor os dados fornecidos pelo especialista no acervo documental para fundamentar a resposta se relevante.
- NUNCA invente informações não presentes na imagem ou nas fontes.
- NUNCA inicie sua resposta com títulos como "Resposta:", "**Resposta:**", "Resposta" ou repetindo a pergunta. Comece diretamente com a sua resposta.
`.trim();

            try {
              await streamOllamaVision({
                model: visionModel,
                systemPrompt: visionSystemPrompt,
                userPrompt: currentMessageContent || 'Descreva e analise esta imagem detalhadamente.',
                images: rawImages,
                previousMessages: previousMessages.map((m: any) => ({ role: m.role, content: m.content })),
                onToken: (chunk) => {
                  controller.enqueue(
                    encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`)
                  );
                },
                onError: async (err) => {
                  console.warn(`Vision model ${visionModel} failed, trying fallback to moondream:`, err);
                  sendStatus('🔄 Alternando para modelo visual alternativo (moondream)...');
                  try {
                    await streamOllamaVision({
                      model: 'moondream',
                      systemPrompt: visionSystemPrompt,
                      userPrompt: currentMessageContent || 'Descreva e analise esta imagem detalhadamente.',
                      images: rawImages,
                      onToken: (chunk) => {
                        controller.enqueue(
                          encoder.encode(`event: token\ndata: ${JSON.stringify({ text: chunk })}\n\n`)
                        );
                      },
                    });
                  } catch (fallbackErr: any) {
                    controller.enqueue(
                      encoder.encode(`event: token\ndata: ${JSON.stringify({ text: `\n\n⚠️ Não foi possível processar a imagem com os modelos de visão locais: ${fallbackErr.message}` })}\n\n`)
                    );
                  }
                },
              });
            } catch (visionErr: any) {
              console.error('Vision streaming error:', visionErr);
              controller.enqueue(
                encoder.encode(`event: token\ndata: ${JSON.stringify({ text: `\n\n⚠️ Erro ao analisar imagem: ${visionErr.message}` })}\n\n`)
              );
            }

            controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
            controller.close();
            return;
          }

          const prompt = PromptTemplate.fromTemplate(`
${agentPromptTemplate}

{skillInstruction}
{toolsInstruction}
{technicalTermHint}
{topicTransitionHint}

CONSULTA TÉCNICA AO ESPECIALISTA DA MATÉRIA ("{consultMateria}"):
Abaixo estão os trechos e fontes oficiais levantados pelo especialista no acervo documental:
---
{context}
---

DIRETRIZES DE EXECUÇÃO:
- Assuma integralmente a sua persona, tom de voz e regras descritas no seu prompt acima.
- Se uma SKILL especializada estiver ativada acima, siga RIGOROSAMENTE todas as diretrizes de formato, estrutura e regras da skill.
- Se FERRAMENTAS (TOOLS) estiverem habilitadas acima, utilize-as quando o formato exigir (ex: blocos de código html para páginas, links de imagem para ilustrações, diagramas mermaid).
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
            skillInstruction: skillInstructionBlock,
            toolsInstruction: toolsInstructionBlock,
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
