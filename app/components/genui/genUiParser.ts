import { ChatSource } from '../SourcesList';

export interface FlashcardItem {
  id: number;
  title: string;
  nivel?: string;
  frente: string;
  verso: string;
  dica?: string;
}

export interface QuizOption {
  letter: string;
  text: string;
}

export interface QuizQuestion {
  id: number;
  nivel?: string;
  enunciado: string;
  options: QuizOption[];
  correct: string;
  justificativa?: string;
  distratores?: string;
}

export interface InfographicData {
  title: string;
  resumo?: string;
  pilares: Array<{ label: string; value?: string; detail?: string }>;
  etapas: Array<{ step: number; title: string; description?: string }>;
  pontoChave?: string;
  pegadinha?: string;
  conclusoes: string[];
}

/**
 * Extrai dados de Flashcards de um texto markdown gerado pela skill
 */
export function parseFlashcardsFromMarkdown(text: string): FlashcardItem[] | null {
  // Procura por cabeçalhos como "### 🗂️ Card" ou "### 🗂️ Flashcard" ou "### Card"
  const cardRegex = /###\s*(?:🗂️\s*)?(?:Card|Flashcard)\s*(\d+)?:?\s*([^•\n]+)?(?:\s*•\s*\[?([^\]\n]+)\]?)?/gi;
  const matches = Array.from(text.matchAll(cardRegex));

  if (matches.length < 2) {
    return null;
  }

  const cards: FlashcardItem[] = [];

  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const startIndex = currentMatch.index! + currentMatch[0].length;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : text.length;
    const cardBlock = text.slice(startIndex, endIndex);

    const cardNum = currentMatch[1] ? parseInt(currentMatch[1], 10) : i + 1;
    const cardTitle = (currentMatch[2] || `Conceito ${cardNum}`).trim();
    const cardNivel = (currentMatch[3] || 'Geral').trim().replace(/[\[\]]/g, '');

    // Extrai Frente
    const frenteMatch = cardBlock.match(/\*\*Frente[^\*]*\*\*:\s*([\s\S]*?)(?=\*\*Verso|💡|\n###|$)/i);
    const frente = frenteMatch ? frenteMatch[1].trim() : '';

    // Extrai Verso
    const versoMatch = cardBlock.match(/\*\*Verso[^\*]*\*\*:\s*([\s\S]*?)(?=💡|\*Dica|\*\*Dica|###|$)/i);
    const verso = versoMatch ? versoMatch[1].trim() : '';

    // Extrai Dica
    const dicaMatch = cardBlock.match(/(?:💡|\*Dica|\*\*Dica)[^\*:]*[:\*\s]*([\s\S]*?)(?=###|$)/i);
    const dica = dicaMatch ? dicaMatch[1].trim().replace(/^\*+|\*+$/g, '').trim() : undefined;

    if (frente || verso) {
      cards.push({
        id: cardNum,
        title: cardTitle,
        nivel: cardNivel,
        frente: frente || cardBlock.slice(0, 100),
        verso: verso || 'Sem resposta especificada.',
        dica,
      });
    }
  }

  return cards.length >= 2 ? cards : null;
}

/**
 * Extrai dados de Simulado / Questões de Múltipla Escolha com Gabarito Comentado
 */
export function parseQuizFromMarkdown(text: string): QuizQuestion[] | null {
  // Procura por "#### Questão 1" ou "### Questão 1"
  const qRegex = /#{3,4}\s*Quest[aã]o\s*(\d+)[:\s]*(?:•\s*\[?([^\]\n]+)\]?)?/gi;
  const qMatches = Array.from(text.matchAll(qRegex));

  if (qMatches.length === 0) return null;

  // Procura seção de gabarito comentado
  const gabaritoSectionMatch = text.match(/(?:###|##|---)\s*(?:📋\s*)?Gabarito\s*(?:Oficial)?\s*Comentado([\s\S]*)$/i);
  const gabaritoText = gabaritoSectionMatch ? gabaritoSectionMatch[1] : '';

  const questions: QuizQuestion[] = [];

  for (let i = 0; i < qMatches.length; i++) {
    const m = qMatches[i];
    const startIndex = m.index! + m[0].length;
    // O final da questão é a próxima questão ou o início do gabarito
    const nextQIndex = i < qMatches.length - 1 ? qMatches[i + 1].index! : (gabaritoSectionMatch ? gabaritoSectionMatch.index! : text.length);
    const qBlock = text.slice(startIndex, nextQIndex);

    const qNum = parseInt(m[1], 10);
    const qNivel = m[2] ? m[2].trim() : 'Médio';

    // Enunciado
    const enunciadoMatch = qBlock.match(/(?:\*\*(?:Contexto\s*\/\s*)?Enunciado\*\*:\s*)?([\s\S]*?)(?=\n[A-E]\)|\n\*\*[A-E]\))/i);
    const enunciado = enunciadoMatch ? enunciadoMatch[1].replace(/^\*\*Enunciado\*\*:\s*/i, '').trim() : '';

    // Alternativas A, B, C, D, E
    const optRegex = /(?:^|\n)\s*(?:\*\*)?([A-E])\)?(?:\*\*)?[:\s]+([^\n]+)/gi;
    const options: QuizOption[] = [];
    let optM;
    while ((optM = optRegex.exec(qBlock)) !== null) {
      options.push({
        letter: optM[1].toUpperCase(),
        text: optM[2].trim(),
      });
    }

    // Procura resolução correspondente no gabarito
    let correct = 'A';
    let justificativa = '';
    let distratores = '';

    if (gabaritoText) {
      const qGabaritoRegex = new RegExp(`(?:Quest[aã]o|Resolu[cç][aã]o\\s*da\\s*Quest[aã]o)\\s*${qNum}[^\\n]*([\\s\\S]*?)(?=(?:Quest[aã]o|Resolu[cç][aã]o\\s*da\\s*Quest[aã]o)\\s*\\d+|$)`, 'i');
      const gMatch = gabaritoText.match(qGabaritoRegex);
      if (gMatch) {
        const gContent = gMatch[1];
        const correctMatch = gContent.match(/(?:Alternativa\s*Correta|Correta|Resposta)\s*[:\*\s]*([A-E])/i);
        if (correctMatch) correct = correctMatch[1].toUpperCase();

        const justMatch = gContent.match(/(?:Justificativa\s*T[eé]cnica|Justificativa)\s*[:\*\s]*([^\n]+(?:\n(?![-\*]\s*(?:An[aá]lise|Alternativa))[^\n]+)*)/i);
        if (justMatch) justificativa = justMatch[1].trim();

        const distMatch = gContent.match(/(?:An[aá]lise\s*dos\s*Distratores|Distratores|Pegadinhas)\s*[:\*\s]*([\s\S]*?)(?=\n-|\n###|$)/i);
        if (distMatch) distratores = distMatch[1].trim();
      }
    }

    if (options.length >= 2) {
      questions.push({
        id: qNum,
        nivel: qNivel,
        enunciado: enunciado || `Questão ${qNum}`,
        options,
        correct,
        justificativa,
        distratores,
      });
    }
  }

  return questions.length > 0 ? questions : null;
}

/**
 * Extrai dados de Infográfico Executivo
 */
export function parseInfographicFromMarkdown(text: string): InfographicData | null {
  const isInfographic =
    text.includes('Título de Impacto') ||
    text.includes('Pilares & Indicadores') ||
    text.includes('Fluxo do Processo') ||
    text.includes('Ponto Chave de Atenção');

  if (!isInfographic) return null;

  // Título e Resumo
  const titleMatch = text.match(/(?:\*\*Título[^\*]*\*\*[:\s]*)([\s\S]*?)(?=\n\*\*⚡|\n\*\*Pilares|\n##|$)/i);
  let title = 'Infográfico Executivo da Matéria';
  let resumo = '';

  if (titleMatch) {
    const lines = titleMatch[1].trim().split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length > 0) title = lines[0].replace(/^#+\s*/, '').replace(/^\*+|\*+$/g, '');
    if (lines.length > 1) resumo = lines.slice(1).join(' ').replace(/^\*+|\*+$/g, '');
  }

  // Pilares (Tabela ou lista)
  const pilares: Array<{ label: string; value?: string; detail?: string }> = [];
  const tableRows = text.match(/\|([^|\n]+)\|([^|\n]+)\|(?:([^|\n]+)\|)?/g);
  if (tableRows && tableRows.length > 2) {
    // Pula header e divisor
    for (let i = 2; i < tableRows.length; i++) {
      const parts = tableRows[i].split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        pilares.push({
          label: parts[0],
          value: parts[1],
          detail: parts[2],
        });
      }
    }
  }

  // Fluxo de Etapas (1. ... ➔ 2. ...)
  const etapas: Array<{ step: number; title: string; description?: string }> = [];
  const etapaRegex = /(?:^|\n)\s*(\d+)[\.\)]\s*([^➔\n]+)(?:➔\s*([^\n]+))?/g;
  let eMatch;
  const fluxoSection = text.match(/\*\*Fluxo[^\*]*\*\*([\s\S]*?)(?=\n\*\*💡|\n\*\*Ponto|$)/i);
  const fluxoText = fluxoSection ? fluxoSection[1] : '';

  while ((eMatch = etapaRegex.exec(fluxoText)) !== null) {
    etapas.push({
      step: parseInt(eMatch[1], 10),
      title: eMatch[2].trim(),
      description: eMatch[3] ? eMatch[3].trim() : undefined,
    });
  }

  // Ponto Chave
  const pontoMatch = text.match(/\*\*💡\s*Ponto\s*Chave[^\*]*\*\*[:\s]*([^\n]+)/i);
  const pontoChave = pontoMatch ? pontoMatch[1].trim() : undefined;

  // Pegadinha
  const pegadinhaMatch = text.match(/\*\*⚠️\s*Pegadinha[^\*]*\*\*[:\s]*([^\n]+)/i);
  const pegadinha = pegadinhaMatch ? pegadinhaMatch[1].trim() : undefined;

  // Conclusões
  const conclusoes: string[] = [];
  const concSection = text.match(/\*\*🎯\s*(?:3\s*)?Conclus[oõ]es[^\*]*\*\*([\s\S]*?)$/i);
  if (concSection) {
    const lines = concSection[1].split('\n');
    for (const l of lines) {
      const cleaned = l.replace(/^[\s\d\.\-\*]+/, '').trim();
      if (cleaned.length > 3) conclusoes.push(cleaned);
    }
  }

  return {
    title,
    resumo,
    pilares: pilares.slice(0, 6),
    etapas: etapas.slice(0, 5),
    pontoChave,
    pegadinha,
    conclusoes: conclusoes.slice(0, 4),
  };
}

export interface PromptProposal {
  target: 'agent' | 'skill';
  id?: string;
  name?: string;
  description?: string;
  systemPrompt: string;
  rationale?: string;
}

function safeParseProposalJson(rawJson: string): any {
  if (!rawJson) return null;
  const clean = rawJson.trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    // 1. Tenta consertar quebras de linha literais dentro de strings
    try {
      const sanitized = clean.replace(/"systemPrompt"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"[a-zA-Z]+"|\s*})/g, (m, p1) => {
        return `"systemPrompt": ${JSON.stringify(p1)}`;
      });
      return JSON.parse(sanitized);
    } catch (e2) {}

    // 2. Extração via Regex campo a campo caso o JSON esteja com caracteres de controle
    try {
      const targetMatch = clean.match(/"target"\s*:\s*"([^"]+)"/);
      const nameMatch = clean.match(/"name"\s*:\s*"([^"]+)"/);
      const idMatch = clean.match(/"id"\s*:\s*"([^"]+)"/);
      const descMatch = clean.match(/"description"\s*:\s*"([^"]+)"/);
      const rationaleMatch = clean.match(/"rationale"\s*:\s*"([^"]+)"/);

      const promptMatch = clean.match(/"systemPrompt"\s*:\s*"([\s\S]*?)"(?=\s*,\s*"[a-zA-Z]+"|\s*})/);
      if (promptMatch && promptMatch[1]) {
        return {
          target: targetMatch ? targetMatch[1] : 'agent',
          id: idMatch ? idMatch[1] : undefined,
          name: nameMatch ? nameMatch[1] : undefined,
          description: descMatch ? descMatch[1] : undefined,
          systemPrompt: promptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
          rationale: rationaleMatch ? rationaleMatch[1] : undefined,
        };
      }
    } catch (e3) {}
    return null;
  }
}

/**
 * Extrai dados de Proposta de Alteração de Prompt/Skill do texto markdown
 */
export function parsePromptProposalFromMarkdown(text: string): PromptProposal | null {
  if (!text) return null;

  // 1. Procura por bloco delimitado: ```prompt-proposal, ```agent-proposal, ```tool-edit-prompt, etc.
  const codeBlockMatch = text.match(/```(?:prompt-proposal|agent-proposal|tool-edit-prompt|tool_edit_prompt|json:prompt-update)\s*([\s\S]*?)```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    const data = safeParseProposalJson(codeBlockMatch[1]);
    if (data && (data.target === 'agent' || data.target === 'skill') && data.systemPrompt) {
      return {
        target: data.target,
        id: data.id,
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        rationale: data.rationale,
      };
    }
  }

  // 2. Procura em blocos ```json padrão que contenham target agent/skill e systemPrompt
  const jsonMatches = Array.from(text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const jm of jsonMatches) {
    if (jm[1]) {
      const data = safeParseProposalJson(jm[1]);
      if (data && (data.target === 'agent' || data.target === 'skill') && data.systemPrompt) {
        return {
          target: data.target,
          id: data.id,
          name: data.name,
          description: data.description,
          systemPrompt: data.systemPrompt,
          rationale: data.rationale,
        };
      }
    }
  }

  // 3. Procura por formato estruturado em Markdown:
  const proposalHeaderMatch = text.match(/###\s*(?:🛠️\s*|✨\s*)?Proposta\s*de\s*(?:Atualiza[çc][ãa]o|Altera[çc][ãa]o)\s*(?:do\s*Agente|da\s*Skill)?/i);
  if (proposalHeaderMatch) {
    const section = text.slice(proposalHeaderMatch.index!);
    const targetMatch = section.match(/\*\*(?:Alvo|Tipo|Target)\*\*:?\s*([^\n]+)/i);
    const target = targetMatch && targetMatch[1].toLowerCase().includes('skill') ? 'skill' : 'agent';

    const descMatch = section.match(/\*\*(?:Nova\s*Descri[çc][ãa]o|Descri[çc][ãa]o)\*\*:?\s*([^\n]+)/i);
    const description = descMatch ? descMatch[1].trim() : undefined;

    const ratMatch = section.match(/\*\*(?:Motivo|Rationale|Justificativa)\*\*:?\s*([^\n]+)/i);
    const rationale = ratMatch ? ratMatch[1].trim() : undefined;

    const promptMatch = section.match(/\*\*(?:Novo\s*Prompt|Prompt\s*de\s*Sistema|Instru[çc][õo]es)\*\*:?\s*```(?:markdown|text)?\s*([\s\S]*?)```/i) ||
                        section.match(/\*\*(?:Novo\s*Prompt|Prompt\s*de\s*Sistema|Instru[çc][õo]es)\*\*:?\s*([^\n]+(?:\n[^\n]+)*)/i);
    const systemPrompt = promptMatch ? promptMatch[1].trim() : '';

    if (systemPrompt && systemPrompt.length > 20) {
      return {
        target,
        description,
        systemPrompt,
        rationale,
      };
    }
  }

  // 4. Reconhece saída em texto livre do tipo "Prompt melhorado:\n\n<prompt>"
  const promptMelhoradoMatch = text.match(
    /(?:Prompt\s+melhorado|Novo\s+prompt(?:\s+do\s+agente)?|Prompt\s+atualizado|Sugest[ãa]o\s+de\s+prompt)[:\s]*\n+([\s\S]*?)(?=\n\n(?:\*\*?Objetivos|\*\*?Estrutura|\*\*?Especificar|Espero\s+que)|$)/i
  );
  if (promptMelhoradoMatch && promptMelhoradoMatch[1]) {
    const candidatePrompt = promptMelhoradoMatch[1].trim();
    if (candidatePrompt.length > 25) {
      return {
        target: 'agent',
        systemPrompt: candidatePrompt,
        rationale: 'Aprimoramento do prompt conforme solicitado no chat',
      };
    }
  }

  return null;
}


