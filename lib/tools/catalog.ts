export type AvailableToolId =
  | 'tool_html_preview'
  | 'tool_generate_pdf'
  | 'tool_generate_image'
  | 'tool_diagram'
  | 'tool_web_search';

export type ToolDefinition = {
  id: AvailableToolId;
  name: string;
  icon: string;
  description: string;
  category: 'visual' | 'documento' | 'codigo' | 'pesquisa';
  systemPromptInstruction: string;
};

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'tool_html_preview',
    name: 'Gerador de HTML / Web UI Interativa',
    icon: '🌐',
    description: 'Permite ao modelo criar páginas HTML5, CSS e JS completas com visualização interativa (Live Preview Sandbox) no chat.',
    category: 'codigo',
    systemPromptInstruction: `
FERRAMENTA HABILITADA: GERADOR DE HTML / WEB UI INTERATIVA (🌐)
- Quando solicitado ou relevante para criar páginas, componentes, simuladores, calculadoras ou protótipos visuais, você DEVE gerar o código HTML5 completo (com CSS embutido em <style> e JavaScript funcional em <script>).
- Envolva SEMPRE o código em um bloco de código markdown delimitado por:
\`\`\`html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>...</title>
  <style>
    /* Estilos modernos e responsivos */
  </style>
</head>
<body>
  <!-- Conteúdo e componentes -->
  <script>
    // Scripts e interatividade funcional
  </script>
</body>
</html>
\`\`\`
- O sistema renderizará automaticamente uma janela de visualização interativa (Live Sandbox) no chat com alternância entre Preview, Código e abertura em Nova Aba.
`,
  },
  {
    id: 'tool_generate_pdf',
    name: 'Exportador e Gerador de PDF',
    icon: '📄',
    description: 'Estrutura apostilas, resumos e relatórios com diagramação limpa pronta para exportação e download em PDF em 1 clique.',
    category: 'documento',
    systemPromptInstruction: `
FERRAMENTA HABILITADA: EXPORTADOR DE DOCUMENTOS PDF (📄)
- Estruture a sua resposta de forma limpa, elegante e editorial, ideal para impressão ou salvamento em PDF.
- Use cabeçalhos hierárquicos (# Título Principal, ## Seção, ### Tópico), separadores horizontais (---), tabelas organizadas e caixas de destaque.
- O sistema fornecerá ao usuário um botão de 1 clique "📥 Baixar em PDF" que compilará a sua resposta em um documento pronto para impressão e salvamento.
`,
  },
  {
    id: 'tool_generate_image',
    name: 'Gerador de Imagens & Ilustrações',
    icon: '🎨',
    description: 'Permite criar ilustrações conceituais, fotos e desenhos explicativos usando modelos visuais abertos gratuitos (Pollinations/Flux).',
    category: 'visual',
    systemPromptInstruction: `
FERRAMENTA HABILITADA: GERADOR DE IMAGENS & ILUSTRAÇÕES (🎨)
- Você pode criar e inserir imagens e ilustrações conceituais para enriquecer o estudo ou explicar visualmente o tema.
- Para gerar uma imagem, insira no seu texto o formato Markdown apontando para o gerador visual de alta resolução:
![Descrição concisa em português](https://image.pollinations.ai/prompt/{prompt_em_ingles_descritivo_e_detalhado}?width=1024&height=768&nologo=true)
- IMPORTANTE: No parâmetro do prompt na URL, escreva SEMPRE em inglês rico em detalhes descritivos e estéticos (ex: "detailed educational illustration of human circulatory system, medical textbook style, clean 3d render, high quality").
- O chat renderizará um Card Visual completo com imagem, zoom e botão de download em alta resolução.
`,
  },
  {
    id: 'tool_diagram',
    name: 'Diagramas & Mapas Mentais (Mermaid)',
    icon: '🧠',
    description: 'Gera árvores conceituais, fluxogramas de processos e mapas mentais renderizáveis em Mermaid.',
    category: 'visual',
    systemPromptInstruction: `
FERRAMENTA HABILITADA: DIAGRAMAS & MAPAS MENTAIS MERMAID (🧠)
- Você pode gerar diagramas visuais e conceituais utilizando blocos de código \`\`\`mermaid.
- Suporta: mindmap, flowchart TD, graph LR, sequenceDiagram.
- REGRA CRÍTICA PARA MINDMAP: Nunca utilize dois-pontos (:) nas ramificações (use hífens como "Eixo 1 - Conceitos Chave") e evite parênteses ou aspas soltas no texto das folhas para garantir a renderização perfeita.
`,
  },
  {
    id: 'tool_web_search',
    name: 'Pesquisa Web em Tempo Real',
    icon: '🔍',
    description: 'Permite buscar notícias e conteúdos atualizados na internet como fonte complementar.',
    category: 'pesquisa',
    systemPromptInstruction: `
FERRAMENTA HABILITADA: PESQUISA WEB EM TEMPO REAL (🔍)
- Acesso a fontes de informação públicas da internet em tempo real como complemento aos documentos do acervo.
`,
  },
];
