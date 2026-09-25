import { runIntelligentRAG, EvaluatedChunk, HistoryMessage } from '@/lib/rag/subagent';
import { searchWeb } from './webSearch';

export type ToolDecisionResult = {
  needsSearch: boolean;
  searchQuery?: string;
  reason: string;
};

/**
 * Esquema compatível com Ollama / OpenAI Native Tool Calling
 */
export const OLLAMA_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'search_knowledge_base',
      description:
        'Busca trechos em apostilas, manuais, livros e documentos indexados no acervo acadêmico/pessoal da matéria ativa. Invoque quando a pergunta exigir dados factuais, leis, procedimentos, tabelas ou conceitos das apostilas.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Pergunta ou termos de busca específicos para localizar os trechos no acervo.',
          },
          materia: {
            type: 'string',
            description: 'Nome da matéria ou tópico de estudo (opcional).',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description:
        'Pesquisa informações, notícias e fatos em tempo real na internet quando o assunto exigir dados externos ao acervo.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Termos de busca na internet.',
          },
        },
        required: ['query'],
      },
    },
  },
];

// Padrões óbvios que nunca precisam de consulta ao acervo de documentos
const NON_SEARCH_PATTERNS = [
  /^(?:ol[áa]|oi|bom dia|boa tarde|boa noite|tudo bem|opa|valeu|obrigad[oa]|e a[ií]|tchau|at[eé] logo|hello|hi)[!.,? ]*$/i,
  /^(?:quem [eé] voc[eê]|qual [eé] o seu nome|o que voc[eê] pode fazer|como voc[eê] funciona|ajuda|help)[!.,? ]*$/i,
  /^(?:conte uma piada|escreva um poema|me fale uma curiosidade|escreva uma hist[oó]ria)[!.,? ]*$/i,
  /(?:escreva|crie|gere)\s+(?:uma\s+fun[çc][ãa]o|um\s+script|um\s+c[oó]digo|um\s+regex|um\s+algoritmo)\s+(?:em|para)\s+(?:python|javascript|typescript|java|c\+\+|sql|php|rust|go|html|css)/i,
];

// Padrões que explicitamente pedem consulta a apostilas e documentos
const EXPLICIT_SEARCH_PATTERNS = [
  /(?:acervo|apostila|apostilas|manual|livro|artigo|conforme o texto|segundo o material|no documento|nos documentos|na unidade|ua\s*\d+|aula\s*\d+|cap[ií]tulo\s*\d+)/i,
  /(?:o que diz|o que consta|segundo a apostila|segundo o manual|o que [eé] abordado|quais s[ãa]o os t[oó]picos da aula)/i,
];

/**
 * Avalia de forma ultrarrápida (~100ms) se a pergunta do usuário requer a tool de busca no acervo.
 * Se for conversa casual, saudação, código genérico ou raciocínio puro, dispensa a busca vetorial.
 */
export async function decideKnowledgeSearchNeed(params: {
  userMessage: string;
  materia: string;
  model?: string;
  baseUrl?: string;
}): Promise<ToolDecisionResult> {
  const { userMessage, materia, model = 'llama3', baseUrl = 'http://localhost:11434' } = params;
  const trimmed = userMessage.trim();
  const lower = trimmed.toLowerCase();

  // 1. Checagem rápida de padrões não-documentais (0ms)
  if (NON_SEARCH_PATTERNS.some((p) => p.test(lower))) {
    return {
      needsSearch: false,
      reason: 'conversa_ou_geral',
    };
  }

  // 2. Checagem rápida de termos explícitos de acervo (0ms)
  if (EXPLICIT_SEARCH_PATTERNS.some((p) => p.test(lower))) {
    return {
      needsSearch: true,
      searchQuery: trimmed,
      reason: 'referencia_explicita_documentos',
    };
  }

  // 3. Decisão do LLM via prompt leve e ultrarrápido (num_predict: 5, ~100ms)
  try {
    const decisionPrompt = `Você é o orquestrador de ferramentas. Decida se a mensagem necessita consultar o acervo de apostilas da matéria "${materia}" (responda APENAS SIM ou NAO):
Mensagem: "${trimmed}"
Resposta:`;

    const res = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: decisionPrompt,
        stream: false,
        options: {
          temperature: 0.0,
          num_predict: 5,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const rawAnswer = (data.response || '').trim().toUpperCase();
      const needsSearch = rawAnswer.includes('SIM');
      return {
        needsSearch,
        searchQuery: trimmed,
        reason: needsSearch ? 'decisao_agente_necessita_acervo' : 'decisao_agente_conhecimento_geral',
      };
    }
  } catch (err) {
    console.warn('[agenticRag] Decisor leve falhou, utilizando fallback:', err);
  }

  // Fallback seguro: se a matéria for específica (diferente de "Geral"), busca; se for "Geral", dispensa busca desnecessária
  const fallbackNeed = materia !== 'Geral';
  return {
    needsSearch: fallbackNeed,
    searchQuery: trimmed,
    reason: fallbackNeed ? 'fallback_materia_especifica' : 'fallback_geral_dispensado',
  };
}
