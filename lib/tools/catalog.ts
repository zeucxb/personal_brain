export type AvailableToolId =
  | 'tool_html_preview'
  | 'tool_generate_pdf'
  | 'tool_generate_image'
  | 'tool_diagram'
  | 'tool_web_search'
  | 'tool_edit_prompt';

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
![Descrição concisa em português](https://image.pollinations.ai/prompt/{prompt_em_ingles_descritivo_e_detalhado}?width=1280&height=720&nologo=true)
- PROPORÇÕES DE TELA (Width x Height):
  * 16:9 (Panorâmico): width=1280&height=720
  * 4:3 (Editorial / Didático): width=1024&height=768
  * 1:1 (Quadrado): width=1024&height=1024
  * 9:16 (Vertical / Mobile): width=720&height=1280
- PRESETS DE ESTILOS RECOMENDADOS (escreva no prompt em inglês):
  * "scientific": detailed academic diagram, medical/anatomical illustration, clean textbook style
  * "photorealistic": 8k photography, cinematic natural lighting, highly detailed textures
  * "digital_art": stunning digital concept art, trending on ArtStation, dynamic volumetric lighting
  * "infographic": educational infographic, structured visual flowchart, clean iconography
  * "minimalist_vector": flat minimalist vector art, clean geometric design, modern SVG aesthetic
- O chat renderizará um Card Visual completo com badges de estilo, proporção e dimensões, modal de zoom interativo e botão de download em 1 clique com feedback visual.
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
  {
    id: 'tool_edit_prompt',
    name: 'Auto-Evolução de Agente / Skill (Prompt Tuning)',
    icon: '✨',
    description: 'Permite ao agente propor atualizações em seu próprio prompt de sistema, persona, tom de voz ou nas instruções da skill ativa via chat com aprovação do usuário.',
    category: 'codigo',
    systemPromptInstruction: `
FERRAMENTA HABILITADA: AUTO-EVOLUÇÃO DE AGENTE E SKILL (✨)
- Quando o usuário solicitar para você mudar suas regras, sua persona, seu tom de voz, editar seu prompt de sistema, alterar sua descrição, ou atualizar a skill ativa:
1. Explique na sua resposta de forma amigável e clara o que você adaptou para atender ao pedido do usuário.
2. Invoque esta ferramenta gerando OBRIGATORIAMENTE um bloco de código markdown delimitado por \`\`\`prompt-proposal contendo o seguinte JSON:
\`\`\`prompt-proposal
{
  "target": "agent",
  "id": "{current_agent_id}",
  "name": "{current_agent_name}",
  "description": "{nova descrição concisa}",
  "systemPrompt": "{novo prompt de sistema completo e detalhado com as novas regras e persona incorporadas}",
  "rationale": "{resumo de 1 a 2 frases explicando o que foi ajustado nesta proposta}"
}
\`\`\`
- Se a solicitação do usuário for para atualizar a SKILL ATIVA, use "target": "skill", o id da skill ativa e o campo "systemPrompt" contendo as novas instruções da skill.
- O sistema apresentará um Card Interativo e um Modal de Aprovação para o usuário revisar e aprovar a atualização com 1 clique.
- REGRA CRÍTICA: No campo "systemPrompt", forneça o prompt COMPLETO e aprimorado (nunca corte com reticências). Mantenha as diretrizes pedagógicas fundamentais e incorpore as novas regras pedidas pelo usuário.
`,
  },
];
