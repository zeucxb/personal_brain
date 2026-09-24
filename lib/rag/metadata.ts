export interface ExtractedMetadata {
  ua?: number;
  uaCode?: string;
  aula?: number;
  unidade?: number;
  capitulo?: number;
  documentTitle?: string;
  keywords: string[];
}

/**
 * Normaliza uma string para comparação léxica (remove acentos, pontuações e converte para minúsculas)
 */
export function normalizeKeyword(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Extrai metadados estruturados (UA, Aula, Unidade, Capítulo, Título e Keywords)
 * a partir do nome do arquivo e opcionalmente do conteúdo do texto.
 */
export function extractDocumentMetadata(filename: string, text?: string): ExtractedMetadata {
  const result: ExtractedMetadata = {
    keywords: [],
  };

  const cleanFilename = filename.replace(/\.[^/.]+$/, ''); // Remove extensão
  const lowerFilename = cleanFilename.toLowerCase();

  // 1. Extração de UA / Unidade de Aprendizagem / Aula
  // Padrões como: UA02, UA 02, UA2, OSM_UA01, Aula 2, Aula_02, Unidade 2, Unidade_02, Capitulo 3
  const uaMatch =
    cleanFilename.match(/(?:UA|Unidade(?:\s+de\s+Aprendizagem)?)[_\s-]*0?(\d+)/i) ||
    cleanFilename.match(/Aula[_\s-]*0?(\d+)/i) ||
    cleanFilename.match(/Cap[ií]tulo[_\s-]*0?(\d+)/i);

  if (uaMatch && uaMatch[1]) {
    const num = parseInt(uaMatch[1], 10);
    const padded = num < 10 ? `0${num}` : `${num}`;

    result.ua = num;
    result.aula = num;
    result.unidade = num;
    result.uaCode = `UA${padded}`;

    // Gera todas as variações canônicas de termos para busca rápida por keyword
    result.keywords.push(
      `ua${num}`,
      `ua${padded}`,
      `ua ${num}`,
      `ua ${padded}`,
      `aula ${num}`,
      `aula ${padded}`,
      `aula${num}`,
      `aula${padded}`,
      `unidade ${num}`,
      `unidade ${padded}`,
      `unidade de aprendizagem ${num}`,
      `unidade de aprendizagem ${padded}`,
      `capitulo ${num}`,
      `capitulo ${padded}`
    );
  }

  // 2. Extração do título limpo do documento a partir do nome do arquivo
  // Ex: "UA02 - Fluxos na Comunicação Empresarial Integrada" -> "Fluxos na Comunicação Empresarial Integrada"
  const titlePart = cleanFilename
    .replace(/^(?:OSM_)?(?:UA|Aula|Unidade)[_\s-]*0?\d+[_\s-]*/i, '')
    .trim();

  if (titlePart.length > 2) {
    result.documentTitle = titlePart;
    const normalizedTitle = normalizeKeyword(titlePart);
    result.keywords.push(normalizedTitle);

    // Adiciona termos significativos do título (palavras com 4 ou mais letras)
    const titleWords = normalizedTitle
      .split(/[\s\-_–—]+/)
      .filter((w) => w.length >= 4 && !['para', 'como', 'onde', 'sobre', 'pela', 'pelo', 'com'].includes(w));
    result.keywords.push(...titleWords);
  }

  // 3. Inspeção de cabeçalhos no texto se fornecido
  if (text) {
    const textPreview = text.slice(0, 1000);
    // Verifica menções explícitas de "Unidade de Aprendizagem X" ou "Aula X" no corpo se o nome do arquivo não continha
    if (!result.ua) {
      const bodyMatch =
        textPreview.match(/(?:Unidade\s+de\s+Aprendizagem|UA|Aula|Cap[ií]tulo)\s*0?(\d+)/i);
      if (bodyMatch && bodyMatch[1]) {
        const num = parseInt(bodyMatch[1], 10);
        const padded = num < 10 ? `0${num}` : `${num}`;
        result.ua = num;
        result.aula = num;
        result.unidade = num;
        result.uaCode = `UA${padded}`;
        result.keywords.push(
          `ua${num}`,
          `ua${padded}`,
          `ua ${num}`,
          `ua ${padded}`,
          `aula ${num}`,
          `aula ${padded}`,
          `unidade ${num}`,
          `unidade ${padded}`
        );
      }
    }
  }

  // Deduplica e normaliza as palavras-chave
  result.keywords = Array.from(new Set(result.keywords.map(normalizeKeyword).filter(Boolean)));

  return result;
}

/**
 * Detecta intenção de escopo específico na pergunta do usuário (ex: "do que fala a aula 2?", "resumo da UA 04", "no capítulo 1")
 */
export function detectScopeFromQuery(query: string): {
  hasSpecificScope: boolean;
  type?: 'aula' | 'ua' | 'unidade' | 'capitulo';
  number?: number;
  identifiers: string[];
} {
  const normalized = normalizeKeyword(query);

  // Regex para capturar padrões como "aula 2", "aula 02", "ua 2", "ua02", "unidade 2", "capítulo 3"
  const match = normalized.match(
    /\b(?:aula|ua|unidade(?:\s+de\s+aprendizagem)?|capitulo|modulo)\s*(?:n[oº°]?\s*)?0?(\d+)\b/i
  ) || normalized.match(/\bua0?(\d+)\b/i);

  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    const padded = num < 10 ? `0${num}` : `${num}`;

    let type: 'aula' | 'ua' | 'unidade' | 'capitulo' = 'aula';
    if (normalized.includes('capitulo')) type = 'capitulo';
    else if (normalized.includes('unidade')) type = 'unidade';
    else if (normalized.includes('ua')) type = 'ua';

    return {
      hasSpecificScope: true,
      type,
      number: num,
      identifiers: [
        `ua${num}`,
        `ua${padded}`,
        `ua ${num}`,
        `ua ${padded}`,
        `aula ${num}`,
        `aula ${padded}`,
        `aula${num}`,
        `unidade ${num}`,
        `unidade ${padded}`,
        `unidade de aprendizagem ${num}`,
        `unidade de aprendizagem ${padded}`,
      ],
    };
  }

  return {
    hasSpecificScope: false,
    identifiers: [],
  };
}
