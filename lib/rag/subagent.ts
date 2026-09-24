import clientPromise from '@/lib/mongodb';
import { Ollama } from '@langchain/community/llms/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';

export type EvaluatedChunk = {
  id: string;
  text: string;
  source: string;
  materia: string;
  page?: number;
  relevante: boolean;
  nota: number;
  motivo?: string;
};

export type HistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type QueryExpansion = {
  mudouDeAssunto?: boolean;
  assuntoAtual?: string;
  termoTecnicoPrincipal: string;
  sinonimos: string[];
  consultasVetoriais: string[];
  palavrasChaveTexto: string[];
  evitar?: string[];
};

export type SubagentRetrievalResult = {
  expansion: QueryExpansion | null;
  candidatesCount: number;
  relevantDocs: EvaluatedChunk[];
};

function safeParseJson<T>(raw: string): T | null {
  try {
    const cleaned = raw.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
    }
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      return JSON.parse(cleaned.slice(firstBracket, lastBracket + 1)) as T;
    }
  } catch (err) {
    // ignore parse errors and fallback
  }
  return null;
}

/**
 * Intelligent RAG Subagent:
 * 1. Analyzes user intent, translates colloquial/slang terms into formal technical manual vocabulary.
 * 2. Retrieves candidate chunks using hybrid search (multi-query vector search + exact MongoDB text matching).
 * 3. Evaluates and filters candidates with strict relevance grading, discarding false cognates (e.g., "painel lateral" vs "painel digital").
 * 4. Self-corrects and retries with alternative technical terms if initial candidates are poor.
 */
export async function runIntelligentRAG(
  userQuestion: string,
  materia: string,
  onStatus?: (status: string) => void,
  recentHistory?: HistoryMessage[]
): Promise<SubagentRetrievalResult> {
  const llm = new Ollama({
    model: 'llama3',
    baseUrl: 'http://localhost:11434',
  });

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

  const isGlobal = materia === 'Geral';

  // -------------------------------------------------------------
  // PASSO 1: Subagente de Análise de Intenção e Expansão de Termos
  // -------------------------------------------------------------
  if (onStatus) onStatus('Analisando intenção e termos técnicos no acervo...');

  let historyContext = '';
  if (recentHistory && recentHistory.length > 0) {
    const lastUser = [...recentHistory].reverse().find((m) => m.role === 'user');
    const lastAssistant = [...recentHistory].reverse().find((m) => m.role === 'assistant');
    if (lastUser) {
      historyContext = `\nHISTÓRICO RECENTE DA CONVERSA:
Pergunta anterior do usuário: "${lastUser.content.slice(0, 180)}"
${lastAssistant ? `Resposta anterior (resumo): "${lastAssistant.content.slice(0, 200).replace(/\n/g, ' ')}..."` : ''}\n`;
    }
  }

  const expanderPrompt = `Você é um subagente especialista em análise de intenção, recuperação semântica e vocabulário técnico para um sistema RAG.
Tópico/Escopo do Acervo: "${materia}".
${historyContext}
Pergunta atual do usuário: "${userQuestion}"

SUAS MISSÕES:
1. DETECÇÃO DE MUDANÇA DE ASSUNTO vs CONTINUAÇÃO:
   - Se a pergunta atual for um NOVO ASSUNTO (ex: o usuário mudou de seta/pisca para corrente/transmissão, ou de um artigo de lei para outro, ou de um tema para outro diferente):
     * Defina "mudouDeAssunto": true.
     * Defina "assuntoAtual" com o novo tema/objeto da pergunta.
     * DESCARTE completamente o assunto da conversa anterior!
     * Em "evitar", inclua os termos e componentes do assunto anterior para que não haja contaminação nem falsos positivos!
   - Se a pergunta atual for uma CONTINUAÇÃO direta ou pergunta com referências/pronomes (ex: "e do outro lado?", "como aciono ele?", "qual o prazo disso?", "resuma o procedimento"):
     * Defina "mudouDeAssunto": false.
     * Defina "assuntoAtual" combinando o sujeito anterior com a nova dúvida.

2. ADAPTAÇÃO VOCABULAR AO ACERVO ("${materia}"):
   Em documentos formais (manuais técnicos, legislações, doutrinas, apostilas, códigos e normas), termos coloquiais ou populares utilizam a nomenclatura oficial e formal do documento.
   Exemplos em diferentes áreas:
   - Motos/Veículos: "corrente" -> "corrente de transmissão", "tensão da corrente", "ajuste da folga da corrente"
   - Motos/Veículos: "seta", "pisca" -> "indicador de direção", "interruptor de direção"
   - Motos/Veículos: "painel" -> "painel de instrumentos", "mostrador de instrumentos" (CUIDADO: NUNCA "painel lateral")
   - Direito/Jurídico: "abrir falência" -> "pedido de autofalência", "decretação de falência", "recuperação judicial"
   - Direito/Jurídico: "empresa individual" -> "sociedade limitada unipessoal", "empresário individual"
   - TI/Geral: "subir arquivo" -> "upload de arquivo", "ingestão de dados", "processamento em lote"

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "mudouDeAssunto": true,
  "assuntoAtual": "tensão e ajuste da corrente de transmissão",
  "termoTecnicoPrincipal": "termo técnico/formal mais provável nos documentos",
  "sinonimos": ["sinônimo formal 1", "sinônimo formal 2"],
  "consultasVetoriais": ["consulta formal 1", "consulta formal 2"],
  "palavrasChaveTexto": ["palavra-chave exata 1", "palavra-chave exata 2"],
  "evitar": ["termos do assunto anterior a descartar se mudou de assunto, ou falsos cognatos"]
}
Responda APENAS com o JSON.`;

  let expansion: QueryExpansion | null = null;
  try {
    const rawExp = await llm.invoke(expanderPrompt);
    expansion = safeParseJson<QueryExpansion>(rawExp);
  } catch (err) {
    console.warn('Erro na expansão de termos do subagente:', err);
  }

  // -------------------------------------------------------------
  // PASSO 2: Coleta Híbrida de Candidatos (Vetorial + Textual)
  // -------------------------------------------------------------
  if (onStatus) onStatus('Buscando trechos no acervo com termos refinados...');

  const candidateMap = new Map<string, {
    id: string;
    text: string;
    source: string;
    materia: string;
    page?: number;
    scoreHint: number;
  }>();

  const addCandidate = (doc: any, priorityWeight: number = 0) => {
    const text = doc.pageContent || doc.text || '';
    if (!text || text.trim().length === 0) return;
    const src = doc.metadata?.source || doc.source || 'Documento';
    const mat = doc.metadata?.materia || doc.materia || materia;
    const page = doc.metadata?.page || doc.page;
    const id = doc.metadata?._id?.toString() || doc._id?.toString() || `${src}-${page}-${text.slice(0, 40)}`;

    if (!candidateMap.has(id)) {
      candidateMap.set(id, {
        id,
        text: text.trim(),
        source: src,
        materia: mat,
        page,
        scoreHint: priorityWeight,
      });
    } else {
      const existing = candidateMap.get(id)!;
      existing.scoreHint += priorityWeight;
    }
  };

  const retriever = vectorStore.asRetriever({
    k: 5,
    filter: isGlobal ? undefined : { preFilter: { materia: { $eq: materia } } },
  });

  // 2a. Busca vetorial da pergunta original
  try {
    const origDocs = await retriever.invoke(userQuestion);
    origDocs.forEach((d) => addCandidate(d, 10));
  } catch (e) {
    console.warn('Falha na busca vetorial original:', e);
  }

  // 2b. Busca vetorial das variações geradas pelo subagente
  if (expansion?.consultasVetoriais && expansion.consultasVetoriais.length > 0) {
    for (const q of expansion.consultasVetoriais.slice(0, 3)) {
      try {
        const varDocs = await retriever.invoke(q);
        varDocs.forEach((d) => addCandidate(d, 9));
      } catch (e) {}
    }
  }

  // 2c. Busca textual direta no MongoDB com boost para confirmação léxica
  const textTerms = [
    ...(expansion?.palavrasChaveTexto || []),
    ...(expansion?.sinonimos || []),
    expansion?.termoTecnicoPrincipal,
  ].filter(Boolean) as string[];

  if (textTerms.length > 0) {
    const validTerms = textTerms
      .filter((t) => typeof t === 'string' && t.trim().length >= 4)
      .slice(0, 5);

    if (validTerms.length > 0) {
      try {
        const regexStr = validTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        const filter: any = isGlobal ? {} : { materia };
        filter.text = { $regex: regexStr, $options: 'i' };

        const txtMatches = await collection.find(filter).limit(15).toArray();
        txtMatches.forEach((d) => {
          const lower = (d.text || '').toLowerCase();
          const matchCount = validTerms.filter((term) => lower.includes(term.toLowerCase())).length;
          const weight = Math.min(matchCount * 2, 6);
          addCandidate(d, weight);
        });
      } catch (e) {
        console.warn('Falha na busca textual exata:', e);
      }
    }
  }

  let candidates = Array.from(candidateMap.values());

  // Penaliza candidatos que contenham termos proibidos/antigos da lista 'evitar'
  if (expansion?.evitar && expansion.evitar.length > 0) {
    const avoidRegexes = expansion.evitar
      .filter((t) => typeof t === 'string' && t.trim().length >= 3)
      .map((t) => new RegExp(`\\b${t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));

    for (const cand of candidates) {
      const containsAvoid = avoidRegexes.some((re) => re.test(cand.text));
      if (containsAvoid) {
        cand.scoreHint -= 15;
      }
    }
  }

  // Prioriza candidatos com maior peso acumulado e seleciona os top 8 mais promissores para avaliação rápida
  candidates.sort((a, b) => b.scoreHint - a.scoreHint);
  const candidatesToEvaluate = candidates.slice(0, 8);

  if (candidatesToEvaluate.length === 0) {
    return {
      expansion,
      candidatesCount: 0,
      relevantDocs: [],
    };
  }

  // -------------------------------------------------------------
  // PASSO 3: Subagente Avaliador / Reranker de Relevância
  // -------------------------------------------------------------
  if (onStatus) onStatus('Avaliando relevância e descartando falsos positivos...');

  const avoidHint = expansion?.evitar && expansion.evitar.length > 0
    ? `ATENÇÃO: Descarte completamente qualquer trecho que trate de: ${expansion.evitar.join(', ')}.`
    : '';

  const currentTopicHint = expansion?.assuntoAtual
    ? `Assunto específico em foco: "${expansion.assuntoAtual}".`
    : '';

  const evalPrompt = `Você é um avaliador rigoroso de precisão para um sistema RAG de acervo documental.
Pergunta atual do usuário: "${userQuestion}"
${currentTopicHint}
Tópico: "${materia}"
${avoidHint}

Avalie os seguintes trechos candidatos:
${candidatesToEvaluate
  .map(
    (c, i) =>
      `[Trecho ${i + 1}] (Pág. ${c.page || '?'}, Fonte: ${c.source}):\n${c.text.slice(0, 260)}`
  )
  .join('\n\n')}

Instruções:
- Seja ESTRITO: se o trecho fala de outro assunto ou componente diferente do que foi perguntado, marque "relevante": false e atribua nota baixa (0-4).
- Se o trecho responde ou ajuda diretamente a responder a pergunta atual sobre ${expansion?.assuntoAtual || userQuestion}, marque "relevante": true e nota (5-10).

Retorne ESTRITAMENTE um array JSON no formato:
[
  { "id": 1, "relevante": true, "nota": 9, "motivo": "explicação curta" },
  { "id": 2, "relevante": false, "nota": 2, "motivo": "fala de outro componente/assunto" }
]
Responda APENAS com o array JSON.`;

  type EvalItem = { id: number; relevante: boolean; nota: number; motivo?: string };
  let evaluations: EvalItem[] = [];

  try {
    const rawEval = await llm.invoke(evalPrompt);
    evaluations = safeParseJson<EvalItem[]>(rawEval) || [];
  } catch (err) {
    console.warn('Erro no avaliador de relevância:', err);
  }

  const scoredCandidates: EvaluatedChunk[] = candidatesToEvaluate.map((cand, idx) => {
    const ev = evaluations.find((e) => e.id === idx + 1);
    const isRel = ev ? Boolean(ev.relevante) : true;
    const score = ev && typeof ev.nota === 'number' ? ev.nota : 5;
    return {
      id: cand.id,
      text: cand.text,
      source: cand.source,
      materia: cand.materia,
      page: cand.page,
      relevante: isRel && score >= 5,
      nota: score,
      motivo: ev?.motivo || '',
    };
  });

  let approved = scoredCandidates.filter((c) => c.relevante);
  approved.sort((a, b) => b.nota - a.nota);

  // -------------------------------------------------------------
  // PASSO 4: Loop de Autocorreção / Retentativa (CRAG)
  // -------------------------------------------------------------
  if (approved.length === 0 && expansion?.termoTecnicoPrincipal) {
    if (onStatus) onStatus('Nenhum trecho direto aprovado. Refinando busca com termo formal...');
    try {
      const retryDocs = await retriever.invoke(expansion.termoTecnicoPrincipal);
      const retryCandidates = retryDocs.slice(0, 3).map((doc) => {
        const d = doc as any;
        return {
          id: d.metadata?._id?.toString() || d.pageContent.slice(0, 40),
          text: (d.pageContent || '').trim(),
          source: d.metadata?.source || d.source || 'Documento',
          materia: d.metadata?.materia || d.materia || materia,
          page: d.metadata?.page || d.page,
          relevante: true,
          nota: 6,
          motivo: 'Recuperado na retentativa formal de autocorreção',
        };
      });

      approved = retryCandidates;
    } catch (e) {
      console.warn('Falha na retentativa do subagente:', e);
    }
  }

  return {
    expansion,
    candidatesCount: candidates.length,
    relevantDocs: approved.slice(0, 4),
  };
}
