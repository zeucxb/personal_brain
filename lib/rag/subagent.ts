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

export type QueryExpansion = {
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
  onStatus?: (status: string) => void
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
  // PASSO 1: Subagente de Análise e Expansão de Termos Técnicos
  // -------------------------------------------------------------
  if (onStatus) onStatus('Analisando termos técnicos e sinônimos...');

  const expanderPrompt = `Você é um subagente de recuperação técnica para RAG.
Tópico/Escopo: "${materia}".
Pergunta do usuário: "${userQuestion}".

Em manuais e documentações formais, termos populares/coloquiais utilizam nomenclatura técnica dos fabricantes. Exemplos:
- "seta", "pisca" -> "indicador de direção", "luz indicadora de direção", "interruptor de direção"
- "painel digital", "painel" -> "visor dos instrumentos", "mostrador", "velocímetro", "tacômetro" (Cuidado: NUNCA confundir com "painel lateral")
- "óleo" -> "óleo do motor", "vareta de medição", "visômetro de nível", "especificação do óleo"
- "embreagem" -> "alavanca da embreagem", "folga da embreagem", "cabo de acionamento"

Analise a pergunta do usuário no contexto de "${materia}".
Retorne ESTRITAMENTE um objeto JSON no seguinte formato:
{
  "termoTecnicoPrincipal": "nome técnico mais provável",
  "sinonimos": ["termo técnico 1", "termo técnico 2"],
  "consultasVetoriais": ["frase formal 1", "frase formal 2"],
  "palavrasChaveTexto": ["termo exato 1", "termo exato 2"],
  "evitar": ["termos ou falsos cognatos a evitar"]
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
      existing.scoreHint = Math.max(existing.scoreHint, priorityWeight);
    }
  };

  const retriever = vectorStore.asRetriever({
    k: 4,
    filter: isGlobal ? undefined : { preFilter: { materia: { $eq: materia } } },
  });

  // 2a. Busca vetorial da pergunta original
  try {
    const origDocs = await retriever.invoke(userQuestion);
    origDocs.forEach((d) => addCandidate(d, 5));
  } catch (e) {
    console.warn('Falha na busca vetorial original:', e);
  }

  // 2b. Busca vetorial das variações geradas pelo subagente
  if (expansion?.consultasVetoriais && expansion.consultasVetoriais.length > 0) {
    for (const q of expansion.consultasVetoriais.slice(0, 2)) {
      try {
        const varDocs = await retriever.invoke(q);
        varDocs.forEach((d) => addCandidate(d, 8));
      } catch (e) {}
    }
  }

  // 2c. Busca textual / regex direta no MongoDB para os termos e sinônimos técnicos
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

        const txtMatches = await collection.find(filter).limit(6).toArray();
        txtMatches.forEach((d) => addCandidate(d, 10)); // Prioridade alta para correspondência lexical exata
      } catch (e) {
        console.warn('Falha na busca textual exata:', e);
      }
    }
  }

  let candidates = Array.from(candidateMap.values());

  // Prioriza candidatos com maior peso e seleciona os top 6 mais promissores para avaliação rápida
  candidates.sort((a, b) => b.scoreHint - a.scoreHint);
  const candidatesToEvaluate = candidates.slice(0, 6);

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
    ? `ATENÇÃO: Descarte completamente falsos cognatos ou trechos sobre: ${expansion.evitar.join(', ')}.`
    : '';

  const evalPrompt = `Você é um avaliador rigoroso de precisão para um sistema RAG de documentação técnica.
Pergunta original do usuário: "${userQuestion}"
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
- Seja ESTRITO: se o trecho fala de outro assunto ou parte diferente do veículo/assunto, marque "relevante": false e atribua nota baixa (0-4).
- Se o trecho responde ou ajuda diretamente a responder a pergunta do usuário, marque "relevante": true e nota (5-10).

Retorne ESTRITAMENTE um array JSON no formato:
[
  { "id": 1, "relevante": true, "nota": 9, "motivo": "explicação curta" },
  { "id": 2, "relevante": false, "nota": 2, "motivo": "fala de outro componente" }
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
