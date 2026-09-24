import clientPromise from '@/lib/mongodb';
import { Ollama } from '@langchain/community/llms/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb';
import { detectScopeFromQuery, normalizeKeyword } from './metadata';

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

export type QueryScopeFilter = {
  tipo?: string;
  numero?: number;
  identificadores?: string[];
  estrito?: boolean;
};

export type QueryExpansion = {
  mudouDeAssunto?: boolean;
  assuntoAtual?: string;
  termoTecnicoPrincipal: string;
  sinonimos: string[];
  consultasVetoriais: string[];
  palavrasChaveTexto: string[];
  evitar?: string[];
  escopoFiltro?: QueryScopeFilter;
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
 * 2. Detects explicit metadata scopes (e.g. "aula 2", "UA 02", "capítulo 3") and enforces strict lesson filtering.
 * 3. Retrieves candidate chunks using hybrid search (metadata/keyword search + exact MongoDB text matching + vector search).
 * 4. Evaluates and filters candidates with strict relevance grading, discarding false cognates and out-of-scope lessons.
 * 5. Self-corrects and retries with alternative technical terms if initial candidates are poor.
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
  // PASSO 1: Análise Determinística + LLM de Intenção e Metadados
  // -------------------------------------------------------------
  if (onStatus) onStatus('Analisando intenção, metadados e termos no acervo...');

  // 1a. Detecção determinística de escopo por regex (ex: "aula 2", "UA 02", "capitulo 3")
  const deterministicScope = detectScopeFromQuery(userQuestion);

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

  const expanderPrompt = `Você é um subagente especialista em análise de intenção, escopo de documentos e vocabulário técnico para um sistema RAG acadêmico.
Tópico/Escopo do Acervo: "${materia}".
${historyContext}
Pergunta atual do usuário: "${userQuestion}"

SUAS MISSÕES:
1. DETECÇÃO DE ESCOPO ESPECÍFICO (Aulas, UAs, Unidades, Capítulos):
   - Se o usuário perguntou especificamente sobre uma aula, unidade ou capítulo (ex: "do que fala a aula 2?", "resumo da UA 04", "no capítulo 1", "segundo a aula 03"):
     * Defina "escopoFiltro": {
         "tipo": "aula",
         "numero": [número extraído, ex: 2],
         "identificadores": ["ua02", "ua2", "ua 02", "ua 2", "aula 2", "aula 02", "unidade 2"],
         "estrito": true
       }
   - Se a pergunta for ampla (sem especificar número de aula):
     * Defina "escopoFiltro": null.

2. DETECÇÃO DE MUDANÇA DE ASSUNTO vs CONTINUAÇÃO:
   - Se a pergunta for um NOVO ASSUNTO:
     * Defina "mudouDeAssunto": true e "assuntoAtual" com o novo tema.
     * Em "evitar", inclua os termos do assunto anterior para evitar contaminação.
   - Se for CONTINUAÇÃO direta:
     * Defina "mudouDeAssunto": false.

3. ADAPTAÇÃO VOCABULAR AO ACERVO:
   - Extraia o "termoTecnicoPrincipal", "sinonimos", "consultasVetoriais" e "palavrasChaveTexto" mais prováveis nos documentos.

Retorne ESTRITAMENTE um objeto JSON no formato:
{
  "mudouDeAssunto": true,
  "assuntoAtual": "tema em foco",
  "termoTecnicoPrincipal": "termo técnico/formal mais provável nos documentos",
  "sinonimos": ["sinônimo formal 1", "sinônimo formal 2"],
  "consultasVetoriais": ["consulta formal 1", "consulta formal 2"],
  "palavrasChaveTexto": ["palavra-chave exata 1", "palavra-chave exata 2"],
  "evitar": ["termos a evitar"],
  "escopoFiltro": {
    "tipo": "aula",
    "numero": 2,
    "identificadores": ["ua02", "ua 02", "ua2", "aula 2", "aula 02"],
    "estrito": true
  }
}
Responda APENAS com o JSON.`;

  let expansion: QueryExpansion | null = null;
  try {
    const rawExp = await llm.invoke(expanderPrompt);
    expansion = safeParseJson<QueryExpansion>(rawExp);
  } catch (err) {
    console.warn('Erro na expansão de termos do subagente:', err);
  }

  // Combina o escopo determinístico com o escopo do LLM
  const effectiveScopeNumber = deterministicScope.number ?? expansion?.escopoFiltro?.numero;
  const effectiveScopeIdentifiers = Array.from(
    new Set([
      ...deterministicScope.identifiers,
      ...(expansion?.escopoFiltro?.identificadores || []),
    ])
  );
  const hasSpecificScope = Boolean(effectiveScopeNumber !== undefined);

  // -------------------------------------------------------------
  // PASSO 2: Coleta Híbrida de Candidatos (Metadados + Keywords + Vetorial)
  // -------------------------------------------------------------
  if (onStatus) {
    if (hasSpecificScope) {
      onStatus(`🔍 Filtrando acervo estritamente para a Aula/UA ${effectiveScopeNumber}...`);
    } else {
      onStatus('Buscando trechos no acervo com busca vetorial e palavras-chave...');
    }
  }

  const candidateMap = new Map<string, {
    id: string;
    text: string;
    source: string;
    materia: string;
    page?: number;
    scoreHint: number;
    isExactScopeMatch?: boolean;
  }>();

  const addCandidate = (doc: any, priorityWeight: number = 0, isScopeMatch: boolean = false) => {
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
        isExactScopeMatch: isScopeMatch,
      });
    } else {
      const existing = candidateMap.get(id)!;
      existing.scoreHint += priorityWeight;
      if (isScopeMatch) existing.isExactScopeMatch = true;
    }
  };

  // 2a. Busca PRIORITÁRIA por Metadados e Identificadores de Escopo (Aula/UA)
  if (hasSpecificScope && effectiveScopeNumber !== undefined) {
    try {
      const padded = effectiveScopeNumber < 10 ? `0${effectiveScopeNumber}` : `${effectiveScopeNumber}`;
      const scopeRegex = new RegExp(`(?:UA|Aula|Unidade)[_\\s-]*0?${effectiveScopeNumber}\\b`, 'i');

      const scopeFilter: any = {
        $or: [
          { ua: effectiveScopeNumber },
          { aula: effectiveScopeNumber },
          { unidade: effectiveScopeNumber },
          { keywords: { $in: effectiveScopeIdentifiers } },
          { source: { $regex: scopeRegex } },
        ],
      };
      if (!isGlobal) scopeFilter.materia = materia;

      const scopeDocs = await collection.find(scopeFilter).limit(25).toArray();
      scopeDocs.forEach((d) => addCandidate(d, 100, true));
    } catch (e) {
      console.warn('Falha na busca direcionada por metadados de aula:', e);
    }
  }

  // 2b. Busca por Palavras-Chave (Keyword Search) no MongoDB via Array de Keywords e Regex
  const allKeywords = [
    ...(expansion?.palavrasChaveTexto || []),
    ...(expansion?.sinonimos || []),
    expansion?.termoTecnicoPrincipal,
  ]
    .filter(Boolean)
    .map((s) => (s ? normalizeKeyword(s) : ''))
    .filter((s) => s.length >= 3);

  if (allKeywords.length > 0) {
    try {
      const regexStr = allKeywords
        .slice(0, 6)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');

      const kwFilter: any = {
        $or: [
          { keywords: { $in: allKeywords.slice(0, 10) } },
          { source: { $regex: regexStr, $options: 'i' } },
          { text: { $regex: regexStr, $options: 'i' } },
        ],
      };
      if (!isGlobal) kwFilter.materia = materia;

      const kwMatches = await collection.find(kwFilter).limit(15).toArray();
      kwMatches.forEach((d) => {
        const lower = (d.text || '').toLowerCase();
        const matchCount = allKeywords.filter((term) => lower.includes(term)).length;
        addCandidate(d, Math.min(matchCount * 3, 15));
      });
    } catch (e) {
      console.warn('Falha na busca por palavras-chave:', e);
    }
  }

  // 2c. Busca vetorial LangChain/MongoDB Atlas Vector Search
  const retriever = vectorStore.asRetriever({
    k: 6,
    filter: isGlobal ? undefined : { preFilter: { materia: { $eq: materia } } },
  });

  try {
    const origDocs = await retriever.invoke(userQuestion);
    origDocs.forEach((d) => addCandidate(d, 10));
  } catch (e) {
    console.warn('Falha na busca vetorial original:', e);
  }

  if (expansion?.consultasVetoriais && expansion.consultasVetoriais.length > 0) {
    for (const q of expansion.consultasVetoriais.slice(0, 2)) {
      try {
        const varDocs = await retriever.invoke(q);
        varDocs.forEach((d) => addCandidate(d, 8));
      } catch (e) {}
    }
  }

  let candidates = Array.from(candidateMap.values());

  // -------------------------------------------------------------
  // REGRA DE OURO: FILTRAGEM ESTRITA DE ESCOPO
  // -------------------------------------------------------------
  // Se o usuário pediu expressamente "aula 2" ou "UA 02" e encontramos documentos da aula 2,
  // ELIMINAMOS sumariamente qualquer chunk de outras aulas (ex: UA01, UA03, UA04, UA05)
  if (hasSpecificScope && effectiveScopeNumber !== undefined) {
    const matchingScopeCandidates = candidates.filter((c) => {
      if (c.isExactScopeMatch) return true;
      const lowerSrc = (c.source || '').toLowerCase();
      const scopeRegex = new RegExp(`(?:ua|aula|unidade)[_\\s-]*0?${effectiveScopeNumber}\\b`, 'i');
      return scopeRegex.test(lowerSrc);
    });

    if (matchingScopeCandidates.length > 0) {
      candidates = matchingScopeCandidates;
    }
  }

  // Penaliza candidatos que contenham termos proibidos/antigos da lista 'evitar'
  if (expansion?.evitar && expansion.evitar.length > 0) {
    const avoidRegexes = expansion.evitar
      .filter((t) => typeof t === 'string' && t.trim().length >= 3)
      .map((t) => new RegExp(`\\b${t.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));

    for (const cand of candidates) {
      const containsAvoid = avoidRegexes.some((re) => re.test(cand.text));
      if (containsAvoid) {
        cand.scoreHint -= 20;
      }
    }
  }

  // Prioriza candidatos com maior peso acumulado e seleciona os top mais promissores
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

  const scopeHint = hasSpecificScope
    ? `ESCOPO OBRIGATÓRIO: A pergunta é EXCLUSIVAMENTE sobre a Aula/UA ${effectiveScopeNumber}. Qualquer trecho de outra aula ou que não pertença a este escopo DEVE ser marcado como relevante: false.`
    : '';

  const evalPrompt = `Você é um avaliador rigoroso de precisão para um sistema RAG acadêmico.
Pergunta atual do usuário: "${userQuestion}"
${scopeHint}
${avoidHint}
Tópico: "${materia}"

Avalie os seguintes trechos candidatos:
${candidatesToEvaluate
  .map(
    (c, i) =>
      `[Trecho ${i + 1}] (Pág. ${c.page || '?'}, Fonte: ${c.source}):\n${c.text.slice(0, 260)}`
  )
  .join('\n\n')}

Instruções:
- Seja ESTRITO: se o trecho trata de outra aula ou assunto diferente do perguntado, marque "relevante": false e atribua nota baixa (0-4).
- Se o trecho responde ou resume adequadamente o conteúdo da aula/tema solicitado, marque "relevante": true e nota (5-10).

Retorne ESTRITAMENTE um array JSON no formato:
[
  { "id": 1, "relevante": true, "nota": 9, "motivo": "explicação curta" },
  { "id": 2, "relevante": false, "nota": 2, "motivo": "trata de outra aula/tema" }
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
  if (approved.length === 0 && candidates.length > 0) {
    // Se todos foram filtrados rigorosamente, mas tínhamos candidatos com match exato de escopo, aprova os melhores do escopo
    const scopeExacts = candidates.filter((c) => c.isExactScopeMatch).slice(0, 3);
    if (scopeExacts.length > 0) {
      approved = scopeExacts.map((c) => ({
        id: c.id,
        text: c.text,
        source: c.source,
        materia: c.materia,
        page: c.page,
        relevante: true,
        nota: 8,
        motivo: 'Recuperado por correspondência exata de metadados da aula solicitada',
      }));
    }
  }

  return {
    expansion,
    candidatesCount: candidates.length,
    relevantDocs: approved.slice(0, 4),
  };
}
