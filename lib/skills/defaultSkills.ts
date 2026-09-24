import { CustomSkill } from './types';

export const DEFAULT_SKILLS: CustomSkill[] = [
  {
    id: 'skill_forum',
    name: 'Fórum Avaliativo',
    icon: '💬',
    description: 'Formata a resposta no padrão acadêmico de fórum universitário, com posicionamento, fundamentação crítica e pergunta para debate.',
    category: 'academico',
    isBuiltIn: true,
    promptInstruction: `
SKILL ATIVADA: FORMATADOR DE FÓRUM AVALIATIVO (💬)
Você deve formatar a resposta integralmente como uma postagem de excelência para fóruns acadêmicos e discussões universitárias.

DIRETRIZES OBRIGATÓRIAS:
1. IDIOMA: Escreva SEMPRE em Português do Brasil (pt-BR).
2. Tom de voz: Aluno universitário engajado, articulado, maduro e reflexivo.
3. ZERO CLICHÊS DE IA: É ESTRITAMENTE PROIBIDO utilizar expressões artificiais como:
   - "Em suma", "Em síntese", "É imperioso destacar", "Como inteligência artificial", "Diante do exposto", "Desta forma, conclui-se".
4. ESTRUTURAÇÃO DO POST:
   - **Posicionamento Inicial:** Comece diretamente apresentando sua visão crítica ou resposta ao tema proposto pelo professor, sem enrolação.
   - **Desenvolvimento Crítico:** Apresente de 2 a 3 argumentos sólidos conectando a teoria dos materiais à prática profissional ou a situações reais. Cite as fontes de apoio no formato [1], [2].
   - **Provocação para Debate:** Finalize com um fechamento reflexivo e uma pergunta aberta instigante, convidando os colegas de turma a comentarem e compartilharem suas próprias experiências ou visões divergentes.
`,
    createdAt: 1700000000010,
    updatedAt: 1700000000010,
  },
  {
    id: 'skill_flashcards',
    name: 'Flashcards de Estudo',
    icon: '🗂️',
    description: 'Transforma a aula e os documentos em um deck de memorização ativa (Active Recall) com perguntas, respostas e macetes mnemônicos.',
    category: 'estudo',
    isBuiltIn: true,
    promptInstruction: `
SKILL ATIVADA: GERADOR DE FLASHCARDS DE ESTUDO (🗂️)
Sua missão é extrair os conceitos essenciais, termos técnicos, processos e fórmulas presentes nas fontes consultadas e transformá-los em um deck de 4 a 6 Flashcards para memorização ativa (Active Recall).

DIRETRIZES OBRIGATÓRIAS:
1. IDIOMA: Escreva SEMPRE em Português do Brasil (pt-BR).

FORMATO OBRIGATÓRIO PARA CADA FLASHCARD:
\`\`\`markdown
### 🗂️ Card {N}: {Conceito Central} • [{Nível: Básico / Intermediário / Avançado}]

**Frente (Desafio / Pergunta):**
{Pergunta em português, clara e direta que obrigue o estudante a exercitar o raciocínio ou definir o conceito sem olhar a resposta}

**Verso (Resposta & Fundamentação):**
{Explicação concisa e precisa fundamentada no material em português, incluindo referências como [1], [2]}

💡 **Dica Mnemônica:**
{Uma analogia rápida, sigla, macete prático ou gatilho mental para nunca mais esquecer}
\`\`\`

Regras adicionais:
- Os flashcards devem cobrir pontos cruciais do material estudado.
- Evite respostas longas ou prolixas no verso. Mantenha o foco em síntese e retenção.
`,
    createdAt: 1700000000011,
    updatedAt: 1700000000011,
  },
  {
    id: 'skill_simulado',
    name: 'Simulado de Prova',
    icon: '📝',
    description: 'Elabora questões inéditas de múltipla escolha no padrão de provas universitárias e concursos, com gabarito comentado e análise de pegadinhas.',
    category: 'estudo',
    isBuiltIn: true,
    promptInstruction: `
SKILL ATIVADA: GERADOR DE SIMULADO E AVALIAÇÕES (📝)
Sua missão é atuar como uma banca examinadora rigorosa e formular um Simulado de Prova inédito (3 a 5 questões) com base estrita no acervo documental consultado.

DIRETRIZES OBRIGATÓRIAS:
1. IDIOMA: Escreva SEMPRE em Português do Brasil (pt-BR).

FORMATO OBRIGATÓRIO:
1. **Questões:**
Para cada questão, forneça:
\`\`\`markdown
#### Questão {N} • [Nível: Fácil / Médio / Difícil]
**Contexto / Enunciado:** {Apresente uma situação-problema prática ou enunciado contextualizado baseado no tema estudado}

A) {Alternativa A}
B) {Alternativa B}
C) {Alternativa C}
D) {Alternativa D}
E) {Alternativa E}
\`\`\`

2. **Seção de Gabarito Comentado (ao final de todas as questões):**
\`\`\`markdown
---
### 📋 Gabarito Oficial Comentado

#### Resolução da Questão {N}:
- **Alternativa Correta:** {Letra}
- **Justificativa Técnica:** {Explicação aprofundada demonstrando por que esta é a alternativa correta com base nas fontes [1], [2]}
- **Análise dos Distratores (Pegadinhas):** {Explique brevemente por que as outras alternativas são falsas e quais pegadinhas frequentes foram inseridas}
\`\`\`
`,
    createdAt: 1700000000012,
    updatedAt: 1700000000012,
  },
  {
    id: 'skill_mapa_mental',
    name: 'Mapa Mental Visual',
    icon: '🧠',
    description: 'Estrutura o tema em árvore hierárquica e conexões conceituais com diagrama Mermaid renderizável e síntese dos eixos.',
    category: 'visual',
    isBuiltIn: true,
    promptInstruction: `
SKILL ATIVADA: CRIADOR DE MAPA MENTAL VISUAL (🧠)
Sua missão é organizar o tema e os documentos em uma estrutura cognitiva hierárquica (Mapa Mental) que facilite a visão sistêmica e a memorização visual.

DIRETRIZES OBRIGATÓRIAS:
1. IDIOMA: Escreva SEMPRE em Português do Brasil (pt-BR).

FORMATO OBRIGATÓRIO:
1. Comece gerando um bloco de código Mermaid no padrão mindmap:
\`\`\`mermaid
mindmap
  root((Tema Central))
    Eixo 1: Conceitos Chave
      Definicao Principal
      Terminologia Oficial
    Eixo 2: Processos e Metodos
      Etapa Inicial
      Monitoramento Continuo
    Eixo 3: Aplicacoes Praticas
      Exemplo Real
      Casos de Uso
    Eixo 4: Pontos Criticos
      Erros Comuns
      Regras de Ouro
\`\`\`
(Importante: No código Mermaid mindmap, NÃO utilize aspas duplas, parênteses ou caracteres especiais complexos dentro dos textos das folhas para garantir a renderização perfeita).

2. Abaixo do diagrama, inclua uma seção:
**📌 Eixos e Conexões Principais:**
- Descreva brevemente a lógica de ligação entre os eixos centrais.
- Conecte as partes ao todo, citando as fontes correspondentes como [1], [2].
`,
    createdAt: 1700000000013,
    updatedAt: 1700000000013,
  },
  {
    id: 'skill_infografico',
    name: 'Infográfico da Aula',
    icon: '📊',
    description: 'Sintetiza a aula em um resumo executivo visual estilo One-Pager com métricas, etapas, blocos de atenção e pegadinhas.',
    category: 'visual',
    isBuiltIn: true,
    promptInstruction: `
SKILL ATIVADA: INFOGRÁFICO EXECUTIVO DA AULA (📊)
Sua missão é criar uma síntese visual de alto impacto (estilo One-Pager / Infográfico Estruturado) para rápida absorção e revisão de véspera de prova.

DIRETRIZES OBRIGATÓRIAS:
1. IDIOMA: Escreva SEMPRE em Português do Brasil (pt-BR).

ESTRUTURA OBRIGATÓRIA:
1. **Título de Impacto & Resumo em 2 Linhas**:
   Conceito central condensado na essência mais pura.

2. **⚡ Pilares & Indicadores Centrais**:
   Uma tabela ou lista de cards visuais destacando os 3 a 4 pilares fundamentais do assunto.

3. **🔄 Fluxo do Processo / Linha de Ação**:
   Passo a passo sequencial com setas (Passo 1 ➔ Passo 2 ➔ Passo 3) demonstrando a aplicação prática.

4. **💡 Ponto Chave de Atenção**:
   Destaque a regra de ouro que não pode ser esquecida.

5. **⚠️ Pegadinha Frequente de Prova / Mercado**:
   O erro mais comum cometido por quem não domina o assunto.

6. **🎯 3 Conclusões Acionáveis**:
   Tópicos diretos fundamentados nas fontes de referência [1], [2].
`,
    createdAt: 1700000000014,
    updatedAt: 1700000000014,
  },
];
