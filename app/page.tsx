'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  UploadCloud,
  Trash2,
  Plus,
  X,
  BookOpen,
  Layers,
  MessageSquare,
  Globe,
  ExternalLink,
  Pencil,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  ChevronDown,
  Sparkles,
  Bot,
  Settings,
  Zap,
  SlidersHorizontal,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react';

import SourcesList, { ChatSource, linkifyCitations } from './components/SourcesList';
import { CustomAgent } from '@/lib/agents/types';
import { MermaidChart } from './components/MermaidChart';
import { CustomSkill } from '@/lib/skills/types';
import {
  parseFlashcardsFromMarkdown,
  parseQuizFromMarkdown,
  parseInfographicFromMarkdown,
  FlashcardsWidget,
  QuizWidget,
  InfographicWidget,
  TableWidget,
  HtmlPreviewWidget,
  ImageViewerWidget,
  PdfExportButton,
} from './components/genui';
import { AVAILABLE_TOOLS, AvailableToolId } from '@/lib/tools/catalog';


type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  sources?: ChatSource[];
};

type Conversation = {
  id: string;
  title: string;
  materia: string;
  messages: Message[];
  agentId?: string;
  skillId?: string;
  createdAt: number;
  updatedAt: number;
};

type DocItem = {
  filename: string;
  materia: string;
  chunksCount: number;
};

export type UploadQueueItem = {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  pages?: number;
  chunks?: number;
  error?: string;
};

function cleanAiResponse(text: string): string {
  if (!text) return '';
  let res = text.trimStart();
  res = res.replace(/^(\*{1,3}|#{1,4}\s*)?Pergunta:[^\n]*(\*{1,3})?\s*(\n+)?/i, '');
  res = res.replace(/^(\*{1,3}|#{1,4}\s*)?Resposta:?(\*{1,3})?:?\s*(\n+)?/i, '');
  return res.trimStart();
}

function AssistantMessage({
  content,
  sources,
  status,
}: {
  content: string;
  sources?: ChatSource[];
  status?: string;
}) {
  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);
  const [viewMode, setViewMode] = useState<'interactive' | 'text'>('interactive');

  const cleanContent = cleanAiResponse(content);
  const processedContent = linkifyCitations(cleanContent);

  // Detecção inteligente de GenUI para enriquecimento da mensagem
  const flashcards = useMemo(() => {
    return cleanContent ? parseFlashcardsFromMarkdown(cleanContent) : null;
  }, [cleanContent]);

  const quizQuestions = useMemo(() => {
    return cleanContent ? parseQuizFromMarkdown(cleanContent) : null;
  }, [cleanContent]);

  const infographicData = useMemo(() => {
    return cleanContent ? parseInfographicFromMarkdown(cleanContent) : null;
  }, [cleanContent]);

  const hasGenUi = Boolean(flashcards || quizQuestions || infographicData);

  // Texto introdutório antes dos cards ou questões, se houver
  const introText = useMemo(() => {
    if (flashcards) {
      const m = cleanContent.match(/###\s*(?:🗂️\s*)?(?:Card|Flashcard)/i);
      if (m && m.index && m.index > 0) {
        return cleanContent.slice(0, m.index).trim();
      }
    } else if (quizQuestions) {
      const m = cleanContent.match(/#{3,4}\s*Quest[aã]o\s*\d+/i);
      if (m && m.index && m.index > 0) {
        return cleanContent.slice(0, m.index).trim();
      }
    }
    return '';
  }, [cleanContent, flashcards, quizQuestions]);

  const processedIntro = useMemo(() => {
    return introText ? linkifyCitations(introText) : '';
  }, [introText]);

  // Markdown custom components (reutilizados para tabelas e citações)
  const markdownComponents = {
    table: ({ children, ...props }: any) => <TableWidget {...props}>{children}</TableWidget>,
    img: ({ src, alt, title }: any) => <ImageViewerWidget src={src} alt={alt} title={title} />,
    code: ({ className, children, ...props }: any) => {
      const match = /language-(\w+)/.exec(className || '');
      const lang = match ? match[1] : '';

      if (lang === 'mermaid') {
        return <MermaidChart chart={String(children).replace(/\n$/, '')} />;
      }

      if (lang === 'html') {
        return <HtmlPreviewWidget html={String(children).replace(/\n$/, '')} />;
      }

      if (lang === 'genui-flashcards' || lang === 'genui_flashcards') {
        try {
          const data = JSON.parse(String(children));
          return <FlashcardsWidget cards={data} sources={sources} onSelectSource={setSelectedSource} />;
        } catch (e) {
          // fallback
        }
      }

      if (lang === 'genui-quiz' || lang === 'genui_quiz') {
        try {
          const data = JSON.parse(String(children));
          return <QuizWidget questions={data} sources={sources} onSelectSource={setSelectedSource} />;
        } catch (e) {
          // fallback
        }
      }

      if (lang === 'genui-infographic' || lang === 'genui_infographic') {
        try {
          const data = JSON.parse(String(children));
          return <InfographicWidget data={data} sources={sources} onSelectSource={setSelectedSource} />;
        } catch (e) {
          // fallback
        }
      }

      const isInline = !match && !String(children).includes('\n');
      return isInline ? (
        <code className="inline-code" {...props}>
          {children}
        </code>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    a: ({ href, children }: any) => {
      if (href && (href.startsWith('#source-') || href.startsWith('citation:'))) {
        const citationIndex = parseInt(
          href.replace(/^#source-|^citation:/, ''),
          10
        );
        const matchedSource = sources?.find((s) => s.index === citationIndex);
        return (
          <button
            type="button"
            className="inline-citation"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (matchedSource) {
                setSelectedSource(matchedSource);
              }
            }}
            title={
              matchedSource
                ? `Ver fonte [${citationIndex}]: ${matchedSource.title}`
                : `Fonte [${citationIndex}]`
            }
          >
            [{citationIndex}]
          </button>
        );
      }
      return (
        <a href={href} target="_blank" rel="noreferrer">
          {children}
        </a>
      );
    },
  };

  return (
    <>
      <SourcesList
        sources={sources}
        selectedSource={selectedSource}
        onSelectSource={setSelectedSource}
      />
      {content ? (
        <div className="markdown-content">
          {hasGenUi && (
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-700/50">
              <div className="flex items-center gap-1.5 text-xs text-amber-400 font-semibold tracking-wide">
                <Sparkles size={14} className="text-amber-400" />
                <span>
                  {flashcards
                    ? 'GenUI • Flashcards Interativos'
                    : quizQuestions
                    ? 'GenUI • Simulador de Atividades'
                    : 'GenUI • Infográfico Executivo'}
                </span>
              </div>
              <div className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('interactive')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    viewMode === 'interactive'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  ⚡ Interativo
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('text')}
                  className={`px-2.5 py-1 rounded-md font-medium transition ${
                    viewMode === 'text'
                      ? 'bg-slate-700 text-slate-200 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  📄 Texto
                </button>
              </div>
            </div>
          )}

          {hasGenUi && viewMode === 'interactive' ? (
            <div>
              {processedIntro && (
                <div className="mb-3">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    urlTransform={(url) => url}
                    components={markdownComponents}
                  >
                    {processedIntro}
                  </ReactMarkdown>
                </div>
              )}

              {flashcards && (
                <FlashcardsWidget
                  cards={flashcards}
                  sources={sources}
                  onSelectSource={setSelectedSource}
                />
              )}

              {quizQuestions && (
                <QuizWidget
                  questions={quizQuestions}
                  sources={sources}
                  onSelectSource={setSelectedSource}
                />
              )}

              {infographicData && (
                <InfographicWidget
                  data={infographicData}
                  sources={sources}
                  onSelectSource={setSelectedSource}
                />
              )}
            </div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              urlTransform={(url) => url}
              components={markdownComponents}
            >
              {processedContent}
            </ReactMarkdown>
          )}

          {cleanContent && (
            <div className="flex items-center justify-end mt-2 pt-1 border-t border-slate-800/40">
              <PdfExportButton content={cleanContent} />
            </div>
          )}
        </div>
      ) : (
        <div className="agent-thinking-card">
          <div className="agent-thinking-spinner" />
          <span className="agent-thinking-text">{status || 'Pesquisando e analisando o acervo...'}</span>
        </div>
      )}
    </>
  );
}


export default function ChatApp() {
  const [subjects, setSubjects] = useState<string[]>(['Geral']);
  const [activeSubject, setActiveSubject] = useState<string>('Geral');
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Custom Agents State
  const [agents, setAgents] = useState<CustomAgent[]>([]);
  const [activeAgentId, setActiveAgentId] = useState<string>('agent_rag_general');
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [showAgentsModal, setShowAgentsModal] = useState(false);
  const [isEditingAgent, setIsEditingAgent] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  // Agent Form State
  const [agentFormName, setAgentFormName] = useState('');
  const [agentFormAvatar, setAgentFormAvatar] = useState('🎓');
  const [agentFormDesc, setAgentFormDesc] = useState('');
  const [agentFormPrompt, setAgentFormPrompt] = useState('');
  const [agentFormMateria, setAgentFormMateria] = useState('Qualquer');
  const [agentFormCanConsult, setAgentFormCanConsult] = useState(true);

  // Custom Skills State (Fórum, Flashcards, Simulado, Mapa Mental, Infográfico)
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null);
  const [showSkillsModal, setShowSkillsModal] = useState(false);
  const [isEditingSkill, setIsEditingSkill] = useState(false);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);

  // Skill Form State
  const [skillFormName, setSkillFormName] = useState('');
  const [skillFormIcon, setSkillFormIcon] = useState('⚡');
  const [skillFormDesc, setSkillFormDesc] = useState('');
  const [skillFormCategory, setSkillFormCategory] = useState<'academico' | 'estudo' | 'visual' | 'produtividade'>('estudo');
  const [skillFormPrompt, setSkillFormPrompt] = useState('');
  const [skillFormTools, setSkillFormTools] = useState<AvailableToolId[]>([]);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [subagentStatus, setSubagentStatus] = useState<string>('');

  // Multimodal Image Attachment State (Ollama Vision)
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string>('');
  const [isImageDragOver, setIsImageDragOver] = useState(false);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Helper to optimize and convert an image file to Base64
  const processImageFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione um arquivo de imagem válido (PNG, JPEG, WebP, GIF, etc.).');
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('A imagem é muito grande. O limite máximo é 25MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const dataUrl = readerEvent.target?.result as string;
      if (!dataUrl) return;

      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let { width, height } = img;
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedDataUrl = canvas.toDataURL(
              file.type === 'image/png' ? 'image/png' : 'image/jpeg',
              0.88
            );
            setAttachedImage(optimizedDataUrl);
            setAttachedImageName(file.name);
            return;
          }
        }
        setAttachedImage(dataUrl);
        setAttachedImageName(file.name);
      };
      img.onerror = () => {
        setAttachedImage(dataUrl);
        setAttachedImageName(file.name);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleImageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processImageFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const handleImagePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          processImageFile(file);
          break;
        }
      }
    }
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsImageDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        processImageFile(file);
      }
    }
  };

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [isBatchUploading, setIsBatchUploading] = useState(false);
  const [batchStats, setBatchStats] = useState({ completed: 0, total: 0 });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch all agents
  const fetchAgents = async () => {
    try {
      const res = await fetch('/api/agents');
      const data = await res.json();
      if (data.agents && data.agents.length > 0) {
        setAgents(data.agents);
      }
    } catch (e) {
      console.error('Error fetching agents:', e);
    }
  };

  // Fetch all skills
  const fetchSkills = async () => {
    try {
      const res = await fetch('/api/skills');
      const data = await res.json();
      if (data.skills && data.skills.length > 0) {
        setSkills(data.skills);
      }
    } catch (e) {
      console.error('Error fetching skills:', e);
    }
  };

  // Fetch all subjects and documents on mount
  const fetchSubjects = async () => {
    try {
      const res = await fetch('/api/subjects');
      const data = await res.json();
      if (data.subjects && data.subjects.length > 0) {
        setSubjects((prev) => Array.from(new Set([...prev, ...data.subjects])));
      }
    } catch (e) {
      console.error('Error fetching subjects:', e);
    }
  };

  const fetchDocuments = async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.documents) {
        setDocuments(data.documents);
      }
    } catch (e) {
      console.error('Error fetching documents:', e);
    }
  };

  // Fetch conversations for the active subject
  const loadConversations = async (subject: string) => {
    try {
      const res = await fetch(`/api/conversations?materia=${encodeURIComponent(subject)}`);
      const data = await res.json();
      if (data.conversations && data.conversations.length > 0) {
        setConversations(data.conversations);
        setActiveConvId(data.conversations[0].id);
        if (data.conversations[0].agentId) {
          setActiveAgentId(data.conversations[0].agentId);
        }
        if (data.conversations[0].skillId) {
          setActiveSkillId(data.conversations[0].skillId);
        } else {
          setActiveSkillId(null);
        }
      } else {
        // Create an initial conversation if none exists
        const newId = `c_${Date.now()}`;
        const newConv: Conversation = {
          id: newId,
          title: 'Nova conversa',
          materia: subject,
          agentId: activeAgentId || 'agent_rag_general',
          skillId: activeSkillId || undefined,
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        setConversations([newConv]);
        setActiveConvId(newId);
        saveConversationToDb(newConv);
      }
    } catch (e) {
      console.error('Error loading conversations:', e);
    }
  };

  const saveConversationToDb = async (conv: Conversation) => {
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conv),
      });
    } catch (e) {
      console.error('Error saving conversation to DB:', e);
    }
  };

  useEffect(() => {
    fetchSubjects();
    fetchDocuments();
    fetchAgents();
    fetchSkills();
  }, []);

  useEffect(() => {
    loadConversations(activeSubject);
  }, [activeSubject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId]);

  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            e.preventDefault();
            processImageFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, []);

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) || conversations[0] || null;

  const currentMessages = activeConversation ? activeConversation.messages : [];
  const currentAgent = agents.find((a) => a.id === activeAgentId) || agents[0] || null;

  const handleCreateNewConversation = () => {
    const newId = `c_${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: 'Nova conversa',
      materia: activeSubject,
      agentId: activeAgentId || 'agent_rag_general',
      skillId: activeSkillId || undefined,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newId);
    saveConversationToDb(newConv);
  };

  const handleOpenCreateAgent = () => {
    setEditingAgentId(null);
    setAgentFormName('');
    setAgentFormAvatar('🎓');
    setAgentFormDesc('');
    setAgentFormPrompt(`Você é um especialista em responder Fóruns Avaliativos Universitários e Discussões Acadêmicas.
Sua missão é assumir a persona do estudante, escrevendo de forma reflexiva, humana, articulada e sem clichês de IA (evite "Em suma", "É imperioso destacar", "Como inteligência artificial", etc.).

Estrutura recomendada para a resposta do Fórum:
1. Posicionamento Inicial claro em relação ao tema proposto pelo professor.
2. Desenvolvimento com argumentos sólidos fundamentados nos conceitos estudados [1], [2].
3. Conclusão sintética com uma pergunta instigante convidando os colegas ao debate.`);
    setAgentFormMateria('Qualquer');
    setAgentFormCanConsult(true);
    setIsEditingAgent(true);
    setShowAgentsModal(true);
  };

  const handleOpenEditAgent = (ag: CustomAgent) => {
    setEditingAgentId(ag.id);
    setAgentFormName(ag.name);
    setAgentFormAvatar(ag.avatar || '🤖');
    setAgentFormDesc(ag.description || '');
    setAgentFormPrompt(ag.systemPrompt || '');
    setAgentFormMateria(ag.defaultMateria || 'Qualquer');
    setAgentFormCanConsult(ag.canConsultTopics !== false);
    setIsEditingAgent(true);
    setShowAgentsModal(true);
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentFormName.trim() || !agentFormPrompt.trim()) {
      alert('Por favor, preencha o nome do agente e o Prompt do Sistema.');
      return;
    }

    try {
      if (editingAgentId) {
        // Atualizar
        const res = await fetch('/api/agents', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingAgentId,
            name: agentFormName,
            avatar: agentFormAvatar,
            description: agentFormDesc,
            systemPrompt: agentFormPrompt,
            defaultMateria: agentFormMateria === 'Qualquer' ? null : agentFormMateria,
            canConsultTopics: agentFormCanConsult,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao salvar alterações do agente');
        }
      } else {
        // Criar
        const res = await fetch('/api/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: agentFormName,
            avatar: agentFormAvatar,
            description: agentFormDesc,
            systemPrompt: agentFormPrompt,
            defaultMateria: agentFormMateria === 'Qualquer' ? null : agentFormMateria,
            canConsultTopics: agentFormCanConsult,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Erro ao criar novo agente');
        }
        const data = await res.json();
        if (data.agent) {
          setActiveAgentId(data.agent.id);
          if (activeConversation) {
            const updated = { ...activeConversation, agentId: data.agent.id };
            setConversations((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
            saveConversationToDb(updated);
          }
        }
      }
      await fetchAgents();
      setIsEditingAgent(false);
      setShowAgentsModal(false);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar agente');
    }
  };

  const handleDeleteAgent = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente excluir o agente "${name}"?`)) return;
    try {
      const res = await fetch(`/api/agents?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (activeAgentId === id) {
          setActiveAgentId('agent_rag_general');
        }
        await fetchAgents();
      } else {
        const err = await res.json();
        alert(err.error || 'Erro ao excluir agente');
      }
    } catch (e) {
      alert('Erro de conexão ao excluir agente');
    }
  };

  // Skill Management Handlers
  const handleOpenCreateSkill = () => {
    setEditingSkillId(null);
    setSkillFormName('');
    setSkillFormIcon('⚡');
    setSkillFormDesc('');
    setSkillFormCategory('estudo');
    setSkillFormPrompt('');
    setSkillFormTools(['tool_generate_pdf']);
    setIsEditingSkill(true);
    setShowSkillsModal(true);
  };

  const handleOpenEditSkill = (skill: CustomSkill) => {
    setEditingSkillId(skill.id);
    setSkillFormName(skill.name);
    setSkillFormIcon(skill.icon);
    setSkillFormDesc(skill.description);
    setSkillFormCategory(skill.category);
    setSkillFormPrompt(skill.promptInstruction);
    setSkillFormTools(skill.tools || []);
    setIsEditingSkill(true);
    setShowSkillsModal(true);
  };

  const handleSaveSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillFormName.trim() || !skillFormPrompt.trim()) return;

    try {
      if (editingSkillId) {
        const res = await fetch('/api/skills', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: editingSkillId,
            name: skillFormName.trim(),
            icon: skillFormIcon.trim() || '⚡',
            description: skillFormDesc.trim(),
            category: skillFormCategory,
            promptInstruction: skillFormPrompt.trim(),
            tools: skillFormTools,
          }),
        });
        if (!res.ok) throw new Error('Erro ao salvar alterações da skill');
      } else {
        const res = await fetch('/api/skills', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: skillFormName.trim(),
            icon: skillFormIcon.trim() || '⚡',
            description: skillFormDesc.trim(),
            category: skillFormCategory,
            promptInstruction: skillFormPrompt.trim(),
            tools: skillFormTools,
          }),
        });
        const data = await res.json();
        if (data.skill) {
          setActiveSkillId(data.skill.id);
        }
      }
      await fetchSkills();
      setIsEditingSkill(false);
      setShowSkillsModal(false);

    } catch (err: any) {
      alert(err.message || 'Erro ao salvar skill');
    }
  };

  const handleDeleteSkill = async (skillId: string, name: string) => {
    if (!confirm(`Deseja realmente excluir a skill "${name}"?`)) return;
    try {
      const res = await fetch(`/api/skills?id=${encodeURIComponent(skillId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        if (activeSkillId === skillId) {
          setActiveSkillId(null);
        }
        await fetchSkills();
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir skill');
      }
    } catch (err) {
      alert('Erro de conexão ao excluir skill');
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation();
    if (!confirm('Deseja excluir esta conversa?')) return;

    try {
      await fetch(`/api/conversations?id=${convId}`, { method: 'DELETE' });
      const remaining = conversations.filter((c) => c.id !== convId);
      setConversations(remaining);

      if (activeConvId === convId) {
        if (remaining.length > 0) {
          setActiveConvId(remaining[0].id);
        } else {
          handleCreateNewConversation();
        }
      }
    } catch (err) {
      console.error('Error deleting conversation:', err);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !attachedImage) || isLoading || !activeConversation) return;

    const userMsgText = input.trim() || 'Descreva e analise esta imagem detalhadamente.';
    const currentAttachedImage = attachedImage;
    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: userMsgText,
      image: currentAttachedImage || undefined,
    };
    const botMsgId = (Date.now() + 1).toString();
    const botMsgPlaceholder: Message = { id: botMsgId, role: 'assistant', content: '' };

    const isFirstMessage = activeConversation.messages.length === 0;
    const newTitle =
      isFirstMessage && activeConversation.title === 'Nova conversa'
        ? userMsgText.slice(0, 32) + (userMsgText.length > 32 ? '...' : '')
        : activeConversation.title;

    const updatedMessages = [...activeConversation.messages, userMsg, botMsgPlaceholder];

    setConversations((prev) =>
      prev.map((c) =>
        c.id === activeConversation.id
          ? { ...c, title: newTitle, messages: updatedMessages, updatedAt: Date.now() }
          : c
      )
    );

    setInput('');
    setAttachedImage(null);
    setAttachedImageName('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...activeConversation.messages, userMsg],
          image: currentAttachedImage || undefined,
          materia: activeSubject,
          webSearch: webSearchEnabled,
          agentId: activeAgentId,
          skillId: activeSkillId,
        }),
      });

      if (!response.body) throw new Error('No body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let buffer = '';
      let accumulatedText = '';
      let capturedSources: ChatSource[] = [];

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = 'message';
          let hasChange = false;

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              try {
                const data = JSON.parse(dataStr);
                if (currentEvent === 'status') {
                  setSubagentStatus(data.message || '');
                } else if (currentEvent === 'sources') {
                  capturedSources = data;
                  hasChange = true;
                } else if (currentEvent === 'token') {
                  if (data.text) {
                    accumulatedText += data.text;
                    hasChange = true;
                  }
                }
              } catch (e) {
                if (currentEvent === 'token' || currentEvent === 'message') {
                  accumulatedText += dataStr;
                  hasChange = true;
                }
              }
            }
          }

          if (hasChange) {
            const cleanedCurrent = cleanAiResponse(accumulatedText);
            setConversations((prev) =>
              prev.map((c) => {
                if (c.id !== activeConversation.id) return c;
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === botMsgId
                      ? {
                          ...m,
                          content: cleanedCurrent,
                          sources: capturedSources.length > 0 ? capturedSources : m.sources,
                        }
                      : m
                  ),
                };
              })
            );
          }
        }
      }

      // Persist finished conversation to DB
      const finalCleanedText = cleanAiResponse(accumulatedText);
      const finalConv: Conversation = {
        ...activeConversation,
        title: newTitle,
        agentId: activeAgentId,
        skillId: activeSkillId || undefined,
        messages: activeConversation.messages
          .concat(userMsg)
          .concat({
            id: botMsgId,
            role: 'assistant',
            content: finalCleanedText,
            sources: capturedSources,
          }),
        updatedAt: Date.now(),
      };
      saveConversationToDb(finalConv);
    } catch (error) {
      console.error('Error in chat:', error);
    } finally {
      setIsLoading(false);
      setSubagentStatus('');
    }
  };

  function formatBytes(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  const handleFilesSelected = (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const validFiles = Array.from(fileList).filter((f) =>
      /\.(pdf|md|markdown|txt)$/i.test(f.name)
    );
    if (validFiles.length === 0) {
      alert('Por favor, selecione arquivos em formato PDF, Markdown ou Texto (.pdf, .md, .txt).');
      return;
    }

    setUploadQueue((prev) => {
      const existingNames = new Set(prev.map((i) => i.name));
      const additions: UploadQueueItem[] = validFiles
        .filter((f) => !existingNames.has(f.name))
        .map((f) => ({
          id: `${f.name}-${Date.now()}-${Math.random()}`,
          file: f,
          name: f.name,
          size: f.size,
          status: 'queued',
        }));
      return [...prev, ...additions];
    });
  };

  const handleRemoveQueueItem = (id: string) => {
    if (isBatchUploading) return;
    setUploadQueue((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearQueue = () => {
    if (isBatchUploading) return;
    setUploadQueue([]);
    setBatchStats({ completed: 0, total: 0 });
  };

  const handleBatchUpload = async () => {
    if (uploadQueue.length === 0 || isBatchUploading) return;
    setIsBatchUploading(true);
    const total = uploadQueue.length;
    setBatchStats({ completed: 0, total });

    const batchId = `batch_${Date.now()}`;
    let completedCount = 0;

    for (let i = 0; i < uploadQueue.length; i++) {
      const item = uploadQueue[i];

      // Se já estava concluído, preserva
      if (item.status === 'done') {
        completedCount++;
        setBatchStats({ completed: completedCount, total });
        continue;
      }

      setUploadQueue((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, status: 'processing' } : it))
      );

      const formData = new FormData();
      formData.append('file', item.file);
      formData.append('materia', activeSubject);
      formData.append('batchId', batchId);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();

        if (res.ok && data.success) {
          const resultInfo = data.results?.[0] || {
            pages: data.pages || 0,
            chunks: data.chunks || 0,
          };
          setUploadQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: 'done',
                    pages: resultInfo.pages,
                    chunks: resultInfo.chunks,
                  }
                : it
            )
          );
        } else {
          setUploadQueue((prev) =>
            prev.map((it) =>
              it.id === item.id
                ? {
                    ...it,
                    status: 'error',
                    error: data.error || 'Erro ao fatiar/vetorizar',
                  }
                : it
            )
          );
        }
      } catch (err: any) {
        setUploadQueue((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, status: 'error', error: err.message || 'Falha na conexão' }
              : it
          )
        );
      }

      completedCount++;
      setBatchStats({ completed: completedCount, total });
    }

    await fetchDocuments();
    await fetchSubjects();
    setIsBatchUploading(false);
  };

  const handleDeleteDocument = async (filename: string, materia: string) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir o documento "${filename}" do tópico "${materia}"?\nOs dados vetoriais serão removidos.`
      )
    ) {
      return;
    }

    setDeletingDoc(filename);
    try {
      const res = await fetch('/api/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materia, filename }),
      });
      if (res.ok) {
        await fetchDocuments();
        await fetchSubjects();
      } else {
        alert('Erro ao excluir documento.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro ao conectar ao servidor para exclusão.');
    } finally {
      setDeletingDoc(null);
    }
  };

  const handleRenameSubject = async (e: React.MouseEvent, oldName: string) => {
    e.stopPropagation();
    if (oldName === 'Geral') return;

    const newName = prompt(`Novo nome para o tópico "${oldName}":`, oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    const cleanNewName = newName.trim();
    if (subjects.includes(cleanNewName)) {
      alert(`Já existe um tópico com o nome "${cleanNewName}".`);
      return;
    }

    try {
      const res = await fetch('/api/subjects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName: cleanNewName }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Erro ao renomear tópico.');
        return;
      }

      setSubjects((prev) => prev.map((s) => (s === oldName ? cleanNewName : s)));
      if (activeSubject === oldName) {
        setActiveSubject(cleanNewName);
      }
      await fetchDocuments();
      await loadConversations(cleanNewName);
    } catch (err) {
      console.error('Error renaming topic:', err);
      alert('Erro ao conectar ao servidor para renomear.');
    }
  };

  const handleDeleteSubject = async (e: React.MouseEvent, sub: string) => {
    e.stopPropagation();
    if (!confirm(`Deseja excluir o tópico "${sub}", seus documentos e suas conversas?`)) {
      return;
    }

    try {
      await fetch('/api/subjects', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materia: sub }),
      });
      setSubjects((prev) => prev.filter((s) => s !== sub));
      if (activeSubject === sub) {
        setActiveSubject('Geral');
      }
      await fetchDocuments();
    } catch (err) {
      console.error(err);
    }
  };

  const currentSubjectDocs =
    activeSubject === 'Geral'
      ? documents
      : documents.filter((d) => d.materia === activeSubject);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <h1>
          <BookOpen size={22} className="logo-icon" />
          <span>RAG Chat</span>
        </h1>

        {/* Section 1: Tópicos */}
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">Tópicos</span>
          <button
            className="add-sub-btn"
            title="Criar novo tópico"
            onClick={() => {
              const name = prompt('Nome do novo tópico:');
              if (name && !subjects.includes(name.trim())) {
                const cleanName = name.trim();
                setSubjects([...subjects, cleanName]);
                setActiveSubject(cleanName);
              }
            }}
          >
            <Plus size={14} />
          </button>
        </div>

        <div className="subject-list">
          {subjects.map((sub) => {
            const count =
              sub === 'Geral'
                ? documents.length
                : documents.filter((d) => d.materia === sub).length;
            const isGeral = sub === 'Geral';
            return (
              <div
                key={sub}
                className={`subject-item ${activeSubject === sub ? 'active' : ''}`}
                onClick={() => setActiveSubject(sub)}
              >
                <div className="subject-name-wrapper">
                  {isGeral ? (
                    <Globe size={15} className="subject-icon" />
                  ) : (
                    <BookOpen size={15} className="subject-icon" />
                  )}
                  <span className="subject-name">{sub}</span>
                  {count > 0 && (
                    <span className="doc-badge" title={`${count} documento(s)`}>
                      {count} {isGeral ? 'total' : 'PDF' + (count > 1 ? 's' : '')}
                    </span>
                  )}
                </div>
                {!isGeral && (
                  <div className="subject-actions-row">
                    <button
                      className="subject-action-btn"
                      title={`Renomear tópico "${sub}"`}
                      onClick={(e) => handleRenameSubject(e, sub)}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      className="subject-action-btn delete"
                      title={`Excluir tópico "${sub}"`}
                      onClick={(e) => handleDeleteSubject(e, sub)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Section 2: Conversas do Tópico Ativo */}
        <div className="conversations-section">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">
              Conversas em {activeSubject}
            </span>
            <button
              className="new-chat-btn"
              onClick={handleCreateNewConversation}
              title="Iniciar nova conversa neste tópico"
            >
              <Plus size={14} />
              <span>Nova</span>
            </button>
          </div>

          <div className="conversation-list">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${activeConvId === conv.id ? 'active' : ''}`}
                onClick={() => {
                  setActiveConvId(conv.id);
                  if (conv.agentId) setActiveAgentId(conv.agentId);
                  setActiveSkillId(conv.skillId || null);
                }}
              >
                <div className="conv-title-wrapper">
                  <MessageSquare size={14} className="conv-icon" />
                  <span className="conv-title" title={conv.title}>
                    {conv.title}
                  </span>
                </div>
                {conversations.length > 1 && (
                  <button
                    className="conv-delete-btn"
                    title="Excluir conversa"
                    onClick={(e) => handleDeleteConversation(e, conv.id)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        <header className="chat-header">
          <div>
            <div className="chat-title-row">
              <h2>{activeSubject}</h2>
              {activeSubject === 'Geral' ? (
                <span className="global-scope-pill" title="O tópico Geral tem acesso a todos os documentos">
                  <Globe size={13} /> Acesso a todo o acervo ({documents.length} docs)
                </span>
              ) : (
                <span className="subject-scope-pill">
                  {currentSubjectDocs.length} documento(s) indexado(s)
                </span>
              )}
            </div>
            <p className="active-conv-name">
              Chat: <strong>{activeConversation ? activeConversation.title : 'Nova conversa'}</strong>
            </p>
          </div>

          <div className="chat-header-actions">
            {/* Agent Selector Dropdown */}
            <div className="agent-selector-container">
              <button
                type="button"
                className="agent-selector-btn"
                onClick={() => setShowAgentDropdown(!showAgentDropdown)}
                title="Trocar agente especialista ou persona desta conversa"
              >
                <span className="agent-btn-avatar">{currentAgent?.avatar || '🤖'}</span>
                <span className="agent-btn-name">{currentAgent?.name || 'Assistente Geral'}</span>
                <ChevronDown size={14} className={`agent-chevron ${showAgentDropdown ? 'open' : ''}`} />
              </button>

              {showAgentDropdown && (
                <div className="agent-dropdown-menu">
                  <div className="agent-dropdown-header">
                    <span>Agente Especialista</span>
                    <button
                      type="button"
                      className="btn-agent-manage"
                      onClick={() => {
                        setShowAgentDropdown(false);
                        setIsEditingAgent(false);
                        setShowAgentsModal(true);
                      }}
                    >
                      Gerenciar
                    </button>
                  </div>
                  <div className="agent-dropdown-list">
                    {agents.map((ag) => (
                      <div
                        key={ag.id}
                        className={`agent-dropdown-item ${ag.id === activeAgentId ? 'active' : ''}`}
                        onClick={() => {
                          setActiveAgentId(ag.id);
                          setShowAgentDropdown(false);
                          if (activeConversation) {
                            const updated = { ...activeConversation, agentId: ag.id };
                            setConversations((prev) =>
                              prev.map((c) => (c.id === updated.id ? updated : c))
                            );
                            saveConversationToDb(updated);
                          }
                        }}
                      >
                        <span className="agent-list-avatar">{ag.avatar}</span>
                        <div className="agent-list-info">
                          <div className="agent-list-name">
                            {ag.name}
                            {ag.isBuiltIn && <span className="built-in-tag">Sistema</span>}
                          </div>
                          <div className="agent-list-desc">{ag.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="agent-dropdown-footer">
                    <button
                      type="button"
                      className="btn-create-agent-quick"
                      onClick={() => {
                        setShowAgentDropdown(false);
                        handleOpenCreateAgent();
                      }}
                    >
                      <Plus size={14} /> Criar Novo Agente Especialista
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="secondary-btn"
              onClick={() => setShowDocsModal(true)}
              title="Gerenciar documentos indexados"
            >
              <FileText size={16} />
              <span>
                Documentos ({currentSubjectDocs.length})
              </span>
            </button>

            {activeSubject !== 'Geral' ? (
              <button className="upload-btn" onClick={() => setShowUploadModal(true)}>
                <UploadCloud size={16} />
                <span>Upload Arquivos</span>
              </button>
            ) : (
              <button
                className="upload-btn"
                title="Para fazer upload, selecione um tópico específico ou crie um"
                onClick={() => {
                  const targetSubject = prompt(
                    'Para qual tópico deseja enviar os arquivos? Digite o nome do tópico:',
                    'Direito Empresarial'
                  );
                  if (targetSubject && targetSubject.trim()) {
                    const clean = targetSubject.trim();
                    if (!subjects.includes(clean)) {
                      setSubjects([...subjects, clean]);
                    }
                    setActiveSubject(clean);
                    setShowUploadModal(true);
                  }
                }}
              >
                <UploadCloud size={16} />
                <span>Upload Arquivos</span>
              </button>
            )}
          </div>
        </header>

        <div className="messages">
          {currentMessages.length === 0 ? (
            <div className="empty-chat-placeholder">
              <div className="placeholder-icon">
                <Layers size={36} />
              </div>
              <h3>
                {activeSubject === 'Geral'
                  ? 'Chat Global (Todos os Tópicos)'
                  : `Conversar sobre ${activeSubject}`}
              </h3>
              <p>
                {activeSubject === 'Geral' ? (
                  <>
                    O tópico <strong>Geral</strong> busca contexto em <strong>todos os documentos cadastrados no sistema</strong> ({documents.length} documentos no total).<br />
                    Pergunte qualquer coisa sobre qualquer tópico que o Llama 3 encontrará as respostas!
                  </>
                ) : currentSubjectDocs.length === 0 ? (
                  <>
                    Este tópico ainda não possui documentos indexados.<br />
                    Você pode clicar em <strong>Upload Arquivos</strong> para anexar PDFs, arquivos Markdown (.md) ou textos (.txt), ou ativar o botão <strong>🌐 Web</strong> abaixo para pesquisar na internet!
                  </>
                ) : (
                  <>
                    Este tópico possui <strong>{currentSubjectDocs.length}</strong> documento(s) com busca vetorial ativa.<br />
                    Faça uma pergunta sobre o conteúdo para o Llama 3 responder com base nas fontes (ou ative <strong>🌐 Web</strong> para complementar com a internet)!
                  </>
                )}
              </p>
            </div>
          ) : (
            currentMessages.map((msg, idx) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <AssistantMessage
                    content={msg.content}
                    sources={msg.sources}
                    status={isLoading && idx === currentMessages.length - 1 ? subagentStatus : undefined}
                  />
                ) : (
                  <div className="user-message-container">
                    {msg.image && (
                      <div className="user-message-image-wrapper">
                        <img
                          src={msg.image}
                          alt="Imagem enviada"
                          className="user-message-image"
                          onClick={() => setPreviewModalImage(msg.image || null)}
                          title="Clique para ampliar a imagem"
                        />
                      </div>
                    )}
                    {msg.content && <div className="user-message-text">{msg.content}</div>}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form
          className={`input-area ${isImageDragOver ? 'drag-over' : ''}`}
          onSubmit={handleSend}
          onDragOver={(e) => {
            e.preventDefault();
            setIsImageDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsImageDragOver(false);
            }
          }}
          onDrop={handleImageDrop}
        >
          {isImageDragOver && (
            <div className="image-drop-overlay">
              <UploadCloud size={24} className="drop-icon" />
              <span>Solte a imagem aqui para anexar</span>
            </div>
          )}

          {/* Attached Image Preview Bar */}
          {attachedImage && (
            <div className="attached-image-bar">
              <div
                className="attached-thumb-container"
                onClick={() => setPreviewModalImage(attachedImage)}
                title="Clique para ampliar"
              >
                <img src={attachedImage} alt="Anexo" className="attached-thumb-img" />
              </div>
              <div className="attached-info">
                <span className="attached-title">{attachedImageName || 'Imagem anexada'}</span>
                <span className="attached-hint">Pronta para interpretação visual com Ollama</span>
              </div>
              <button
                type="button"
                className="btn-remove-attached"
                onClick={() => {
                  setAttachedImage(null);
                  setAttachedImageName('');
                }}
                title="Remover anexo"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {skills.length > 0 && (
            <div className="skills-toolbar">
              <div
                className="skills-list"
                onWheel={(e) => {
                  if (e.deltaY !== 0) {
                    e.currentTarget.scrollLeft += e.deltaY;
                  }
                }}
              >
                <span className="skills-toolbar-label">
                  <Zap size={13} className="text-amber-400" />
                  <span>Skills:</span>
                </span>
                {skills.map((skill) => {
                  const isSelected = activeSkillId === skill.id;
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => setActiveSkillId(isSelected ? null : skill.id)}
                      className={`skill-chip ${isSelected ? 'active' : ''}`}
                      title={`${skill.name} — ${skill.description}`}
                    >
                      <span className="skill-chip-icon">{skill.icon}</span>
                      <span className="skill-chip-name">{skill.name}</span>
                      {isSelected && <span className="skill-chip-check">✓</span>}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingSkill(false);
                    setShowSkillsModal(true);
                  }}
                  className="btn-manage-skills"
                  title="Gerenciar e Criar Novas Skills"
                >
                  <SlidersHorizontal size={13} />
                  <span>+ Skills</span>
                </button>
              </div>

              {skills.find((s) => s.id === activeSkillId) && (
                <div className="active-skill-banner">
                  <span className="active-skill-pill">
                    <span>
                      Formato Ativo: {skills.find((s) => s.id === activeSkillId)?.icon}{' '}
                      <strong>{skills.find((s) => s.id === activeSkillId)?.name}</strong>
                    </span>
                    <button
                      type="button"
                      className="btn-clear-skill"
                      onClick={() => setActiveSkillId(null)}
                      title="Desativar skill (usar resposta livre)"
                    >
                      ✕
                    </button>
                  </span>
                  <span className="active-skill-desc">
                    {skills.find((s) => s.id === activeSkillId)?.description}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="input-box">
            <input
              type="file"
              ref={imageInputRef}
              accept="image/png,image/jpeg,image/webp,image/gif,image/bmp"
              onChange={handleImageFileSelect}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className={`btn-attach-image ${attachedImage ? 'active' : ''}`}
              onClick={() => imageInputRef.current?.click()}
              title="Anexar imagem (ou cole com Cmd+V / arraste)"
            >
              <Paperclip size={15} />
              {attachedImage && <span className="attach-dot" />}
            </button>
            <button
              type="button"
              className={`btn-web-toggle ${webSearchEnabled ? 'active' : ''}`}
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
              title={
                webSearchEnabled
                  ? 'Pesquisa Web ativada (consultando internet + PDFs)'
                  : 'Ativar pesquisa na Web (consultar páginas e links na internet)'
              }
            >
              <Globe size={15} />
              <span>Web</span>
              <span className="web-indicator-dot" />
            </button>
            <input
              type="text"
              placeholder={
                attachedImage
                  ? 'Faça uma pergunta sobre a imagem ou pressione Enviar para analisá-la...'
                  : webSearchEnabled
                  ? `Pesquisar na Web e no acervo (${activeSubject})...`
                  : activeSubject === 'Geral'
                  ? 'Pergunte algo no acervo global de todos os tópicos...'
                  : `Pergunte algo sobre ${activeSubject}...`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={handleImagePaste}
              disabled={isLoading}
            />
            <button
              type="submit"
              className="btn-send"
              disabled={isLoading || (!input.trim() && !attachedImage)}
            >
              {isLoading ? <span className="loader"></span> : 'Enviar'}
            </button>
          </div>
        </form>
      </main>

      {/* Upload Modal (Batch Processing) */}
      {showUploadModal && (
        <div
          className="modal-overlay"
          onClick={() => !isBatchUploading && setShowUploadModal(false)}
        >
          <div
            className="modal modal-batch-upload"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>Upload de Arquivos em Lote — Tópico "{activeSubject}"</h3>
                <p className="modal-subtitle">
                  Selecione múltiplos arquivos (.pdf, .md, .txt) de uma vez. O processamento em fila indexa cada arquivo com páginas/seções e vetores.
                </p>
              </div>
              <button
                className="close-btn"
                onClick={() => setShowUploadModal(false)}
                disabled={isBatchUploading}
              >
                <X size={18} />
              </button>
            </div>

            {/* Dropzone */}
            <div
              className={`upload-dropzone ${isDragOver ? 'dragover' : ''}`}
              onClick={() => !isBatchUploading && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                if (!isBatchUploading) setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                if (!isBatchUploading) handleFilesSelected(e.dataTransfer.files);
              }}
            >
              <UploadCloud size={36} className="dropzone-icon" />
              <div className="dropzone-title">
                Arraste e solte seus arquivos aqui ou clique para selecionar
              </div>
              <div className="dropzone-subtitle">
                Envie múltiplos arquivos (.pdf, .md, .txt) simultaneamente de uma só vez
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.md,.markdown,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFilesSelected(e.target.files);
                  if (e.target) e.target.value = '';
                }}
                disabled={isBatchUploading}
              />
            </div>

            {/* Batch Progress Bar */}
            {batchStats.total > 0 && (
              <div className="batch-progress-box">
                <div className="batch-progress-header">
                  <span>
                    {isBatchUploading
                      ? `Processando fila: ${batchStats.completed} de ${batchStats.total} arquivos`
                      : `Lote concluído: ${batchStats.completed} de ${batchStats.total} arquivos processados`}
                  </span>
                  <span>{Math.round((batchStats.completed / batchStats.total) * 100)}%</span>
                </div>
                <div className="batch-progress-track">
                  <div
                    className="batch-progress-fill"
                    style={{
                      width: `${Math.round((batchStats.completed / batchStats.total) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Queue List */}
            {uploadQueue.length > 0 && (
              <>
                <div className="upload-queue-header">
                  <span>Arquivos selecionados ({uploadQueue.length})</span>
                  {!isBatchUploading && (
                    <button className="btn-clear-queue" onClick={handleClearQueue}>
                      Limpar lista
                    </button>
                  )}
                </div>

                <div className="upload-queue-container">
                  {uploadQueue.map((item) => (
                    <div key={item.id} className="upload-queue-item">
                      <div className="queue-item-info">
                        <FileText size={16} className="source-type-icon doc" />
                        <span className="queue-item-name" title={item.name}>
                          {item.name}
                        </span>
                        <span className="queue-item-size">{formatBytes(item.size)}</span>
                      </div>

                      <div className="queue-item-actions">
                        {item.status === 'queued' && (
                          <span className="badge-queued">
                            <Clock size={12} /> Na fila
                          </span>
                        )}
                        {item.status === 'processing' && (
                          <span className="badge-processing">
                            <Loader2 size={12} className="spin" /> Vetorizando...
                          </span>
                        )}
                        {item.status === 'done' && (
                          <span className="badge-done">
                            <CheckCircle2 size={12} /> Concluído ({item.pages} págs, {item.chunks} chunks)
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="badge-error" title={item.error}>
                            <AlertCircle size={12} /> {item.error || 'Erro'}
                          </span>
                        )}
                        {!isBatchUploading && item.status !== 'processing' && (
                          <button
                            type="button"
                            className="btn-remove-queue"
                            onClick={() => handleRemoveQueueItem(item.id)}
                            title="Remover este arquivo"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="modal-actions">
              {!isBatchUploading && (
                <button
                  className="btn-cancel"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadQueue([]);
                    setBatchStats({ completed: 0, total: 0 });
                  }}
                >
                  {uploadQueue.some((i) => i.status === 'done') ? 'Fechar' : 'Cancelar'}
                </button>
              )}

              {!isBatchUploading &&
                uploadQueue.length > 0 &&
                uploadQueue.some((i) => i.status !== 'done') && (
                  <button className="btn-submit" onClick={handleBatchUpload}>
                    Iniciar Upload de {uploadQueue.filter((i) => i.status !== 'done').length} Arquivo(s)
                  </button>
                )}

              {isBatchUploading && (
                <button className="btn-submit" disabled>
                  <Loader2 size={14} className="spin" /> Processando lote em fila...
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Documents Management Modal */}
      {showDocsModal && (
        <div className="modal-overlay" onClick={() => setShowDocsModal(false)}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>
                  {activeSubject === 'Geral'
                    ? 'Todos os Documentos do Acervo'
                    : `Documentos do Tópico: ${activeSubject}`}
                </h3>
                <p className="modal-subtitle">
                  {currentSubjectDocs.length} arquivo(s) salvos no MongoDB com busca vetorial
                </p>
              </div>
              <button className="close-btn" onClick={() => setShowDocsModal(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="doc-list-container">
              {currentSubjectDocs.length === 0 ? (
                <div className="doc-list-empty">
                  <FileText size={40} className="empty-icon" />
                  <p>Nenhum documento cadastrado neste tópico.</p>
                  <button
                    className="btn-submit small-btn"
                    onClick={() => {
                      setShowDocsModal(false);
                      setShowUploadModal(true);
                    }}
                  >
                    Fazer Upload Agora
                  </button>
                </div>
              ) : (
                currentSubjectDocs.map((doc) => (
                  <div key={`${doc.materia}-${doc.filename}`} className="doc-item">
                    <div className="doc-info">
                      <FileText size={20} className="doc-file-icon" />
                      <div className="doc-details">
                        <span className="doc-name" title={doc.filename}>
                          {doc.filename}
                        </span>
                        <div className="doc-meta-row">
                          <span className="doc-materia-tag">{doc.materia}</span>
                          <span className="doc-chunks">
                            {doc.chunksCount} chunks indexados
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="doc-actions-group">
                      <a
                        href={`/api/documents/file?filename=${encodeURIComponent(doc.filename)}&materia=${encodeURIComponent(doc.materia)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-view-doc"
                        title="Abrir arquivo original em nova aba"
                      >
                        <ExternalLink size={14} />
                        <span>Abrir</span>
                      </a>
                      <button
                        className="btn-delete-doc"
                        title="Excluir documento do banco vetorial"
                        disabled={deletingDoc === doc.filename}
                        onClick={() => handleDeleteDocument(doc.filename, doc.materia)}
                      >
                        {deletingDoc === doc.filename ? (
                          <span className="loader small-loader"></span>
                        ) : (
                          <>
                            <Trash2 size={15} />
                            <span>Excluir</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="modal-actions space-between">
              {activeSubject !== 'Geral' ? (
                <button
                  className="upload-btn"
                  onClick={() => {
                    setShowDocsModal(false);
                    setShowUploadModal(true);
                  }}
                >
                  <Plus size={16} /> Adicionar Novo PDF
                </button>
              ) : (
                <div></div>
              )}
              <button className="btn-cancel" onClick={() => setShowDocsModal(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Agents Management Modal */}
      {showAgentsModal && (
        <div className="modal-overlay" onClick={() => setShowAgentsModal(false)}>
          <div
            className="modal modal-large modal-agent-manager"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>
                  {isEditingAgent
                    ? editingAgentId
                      ? 'Editar Agente Especialista'
                      : 'Criar Novo Agente Especialista'
                    : 'Gerenciar Agentes Especialistas'}
                </h3>
                <p className="modal-subtitle">
                  {isEditingAgent
                    ? 'Configure o nome, persona, tom de voz, regras de redação e acesso a ferramentas.'
                    : 'Escolha, personalize ou crie agentes com personas e regras de sistema exclusivas.'}
                </p>
              </div>
              <button
                className="close-btn"
                onClick={() => setShowAgentsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {!isEditingAgent ? (
              // LIST VIEW
              <div className="agent-cards-grid">
                {agents.map((ag) => {
                  const isCurrent = ag.id === activeAgentId;
                  return (
                    <div
                      key={ag.id}
                      className={`agent-manage-card ${isCurrent ? 'active' : ''}`}
                    >
                      <div className="agent-manage-main">
                        <span className="agent-manage-avatar">{ag.avatar}</span>
                        <div className="agent-manage-details">
                          <div className="agent-manage-title">
                            {ag.name}
                            {isCurrent && (
                              <span className="source-meta-tag source-page-tag">
                                Ativo nesta conversa
                              </span>
                            )}
                            {ag.isBuiltIn && (
                              <span className="built-in-tag">Sistema</span>
                            )}
                          </div>
                          <div className="agent-manage-desc">
                            {ag.description || 'Sem descrição.'}
                          </div>
                          {ag.canConsultTopics && (
                            <div className="agent-form-hint" style={{ marginTop: '0.35rem', color: '#c084fc' }}>
                              ⚡ Consulta especialistas de matérias como ferramenta (Multi-Agent Tool)
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="agent-manage-actions">
                        {!isCurrent && (
                          <button
                            type="button"
                            className="btn-agent-action"
                            onClick={() => {
                              setActiveAgentId(ag.id);
                              if (activeConversation) {
                                const updated = { ...activeConversation, agentId: ag.id };
                                setConversations((prev) =>
                                  prev.map((c) => (c.id === updated.id ? updated : c))
                                );
                                saveConversationToDb(updated);
                              }
                              setShowAgentsModal(false);
                            }}
                            title="Usar este agente nesta conversa"
                          >
                            Selecionar
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-agent-action"
                          onClick={() => handleOpenEditAgent(ag)}
                          title="Editar persona e regras deste agente"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                        {!ag.isBuiltIn && (
                          <button
                            type="button"
                            className="btn-agent-action delete"
                            onClick={() => handleDeleteAgent(ag.id, ag.name)}
                            title="Excluir agente"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // FORM / EDITOR VIEW
              <form className="agent-form" onSubmit={handleSaveAgent}>
                <div className="agent-form-row">
                  <div className="agent-form-group">
                    <label className="agent-form-label">Emoji / Ícone</label>
                    <input
                      type="text"
                      className="agent-form-input"
                      style={{ textAlign: 'center', fontSize: '1.25rem' }}
                      value={agentFormAvatar}
                      onChange={(e) => setAgentFormAvatar(e.target.value)}
                      maxLength={4}
                    />
                    <div className="agent-emoji-picker">
                      {['🎓', '📝', '💡', '⚖️', '📐', '🤖', '🧪', '📊', '🔍', '⚡'].map(
                        (emo) => (
                          <button
                            key={emo}
                            type="button"
                            className={`emoji-choice-btn ${agentFormAvatar === emo ? 'selected' : ''}`}
                            onClick={() => setAgentFormAvatar(emo)}
                          >
                            {emo}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="agent-form-group">
                    <label className="agent-form-label">Nome do Agente Especialista</label>
                    <input
                      type="text"
                      className="agent-form-input"
                      placeholder="Ex: Especialista em Fóruns Avaliativos"
                      value={agentFormName}
                      onChange={(e) => setAgentFormName(e.target.value)}
                      required
                    />
                    <span className="agent-form-hint">
                      Dê um título que identifique claramente o propósito ou área de especialidade.
                    </span>
                  </div>
                </div>

                <div className="agent-form-group">
                  <label className="agent-form-label">Descrição Resumida</label>
                  <input
                    type="text"
                    className="agent-form-input"
                    placeholder="Ex: Responde fóruns com persona de estudante, tom humano e estrutura em tópicos..."
                    value={agentFormDesc}
                    onChange={(e) => setAgentFormDesc(e.target.value)}
                  />
                </div>

                <div className="agent-form-group">
                  <label className="agent-form-label">
                    Prompt do Sistema (Persona, Tom de Voz, Regras & Template)
                  </label>
                  <span className="agent-form-hint">
                    Defina como este agente deve pensar, escrever, formatar as respostas (ex: introdução, desenvolvimento e encerramento para fóruns) e quais clichês evitar.
                  </span>
                  <textarea
                    className="agent-form-textarea"
                    value={agentFormPrompt}
                    onChange={(e) => setAgentFormPrompt(e.target.value)}
                    rows={8}
                    required
                  />
                </div>

                <div className="agent-form-group">
                  <label className="agent-form-label">Tópico / Matéria Vinculada</label>
                  <select
                    className="agent-form-select"
                    value={agentFormMateria}
                    onChange={(e) => setAgentFormMateria(e.target.value)}
                  >
                    <option value="Qualquer">Qualquer Tópico (Dinâmico / Consulta múltiplos)</option>
                    {subjects.filter((s) => s !== 'Geral').map((sub) => (
                      <option key={sub} value={sub}>{sub}</option>
                    ))}
                  </select>
                </div>

                <div
                  className="agent-checkbox-card"
                  onClick={() => setAgentFormCanConsult(!agentFormCanConsult)}
                >
                  <input
                    type="checkbox"
                    checked={agentFormCanConsult}
                    onChange={(e) => setAgentFormCanConsult(e.target.checked)}
                  />
                  <div className="agent-checkbox-text">
                    <span className="agent-checkbox-title">
                      Permitir consultar especialistas de matérias como ferramenta (Multi-Agent Tool)
                    </span>
                    <span className="agent-checkbox-desc">
                      Se ativado, quando o fórum ou dúvida envolver uma matéria específica (ex: Matemática, Direito), este agente invocará o especialista da matéria no acervo, recolherá os dados técnicos e usará sua persona para redigir a resposta final.
                    </span>
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setIsEditingAgent(false)}
                  >
                    Voltar
                  </button>
                  <button type="submit" className="btn-submit">
                    Salvar Agente
                  </button>
                </div>
              </form>
            )}

            {!isEditingAgent && (
              <div className="modal-actions space-between">
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleOpenCreateAgent}
                >
                  <Plus size={16} /> Criar Novo Agente Especialista
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowAgentsModal(false)}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom Skills Management Modal */}
      {showSkillsModal && (
        <div className="modal-overlay" onClick={() => setShowSkillsModal(false)}>
          <div
            className="modal modal-large modal-skill-manager"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <h3>
                  {isEditingSkill
                    ? editingSkillId
                      ? 'Editar Skill / Formato Especializado'
                      : 'Criar Nova Skill'
                    : 'Gerenciar Skills & Ferramentas'}
                </h3>
                <p className="modal-subtitle">
                  {isEditingSkill
                    ? 'Configure as regras e o prompt de formatação especializado (ex: Fórum, Flashcards, Simulado, Mapa Mental, Infográfico).'
                    : 'Ative ferramentas modulares para transformar o formato das respostas do assistente sob demanda.'}
                </p>
              </div>
              <button
                className="close-btn"
                onClick={() => setShowSkillsModal(false)}
              >
                <X size={18} />
              </button>
            </div>

            {!isEditingSkill ? (
              // LIST VIEW
              <div className="agent-cards-grid">
                {skills.map((sk) => {
                  const isCurrent = sk.id === activeSkillId;
                  const catClass =
                    sk.category === 'academico'
                      ? 'skill-cat-academico'
                      : sk.category === 'estudo'
                      ? 'skill-cat-estudo'
                      : sk.category === 'visual'
                      ? 'skill-cat-visual'
                      : 'skill-cat-produtividade';
                  return (
                    <div
                      key={sk.id}
                      className={`agent-manage-card ${isCurrent ? 'active' : ''}`}
                    >
                      <div className="agent-manage-main">
                        <span className="agent-manage-avatar">{sk.icon}</span>
                        <div className="agent-manage-details">
                          <div className="agent-manage-title">
                            {sk.name}
                            <span className={`skill-category-badge ${catClass}`}>
                              {sk.category}
                            </span>
                            {isCurrent && (
                              <span className="source-meta-tag source-page-tag">
                                Ativa no momento
                              </span>
                            )}
                            {sk.isBuiltIn && (
                              <span className="built-in-tag">Nativa</span>
                            )}
                          </div>
                          <div className="agent-manage-desc">
                            {sk.description || 'Sem descrição.'}
                          </div>
                          {sk.tools && sk.tools.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              {sk.tools.map((tid) => {
                                const tDef = AVAILABLE_TOOLS.find((t) => t.id === tid);
                                if (!tDef) return null;
                                return (
                                  <span key={tid} className="tool-badge-pill" title={tDef.description}>
                                    <span>{tDef.icon}</span>
                                    <span>{tDef.name.split('/')[0].trim()}</span>
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="agent-manage-actions">
                        <button
                          type="button"
                          className="btn-agent-action"
                          onClick={() => {
                            setActiveSkillId(isCurrent ? null : sk.id);
                            setShowSkillsModal(false);
                          }}
                          title={isCurrent ? 'Desativar esta skill' : 'Ativar esta skill'}
                        >
                          {isCurrent ? 'Desativar' : 'Ativar'}
                        </button>
                        <button
                          type="button"
                          className="btn-agent-action"
                          onClick={() => handleOpenEditSkill(sk)}
                          title="Editar instruções desta skill"
                        >
                          <Pencil size={12} /> Editar
                        </button>
                        {!sk.isBuiltIn && (
                          <button
                            type="button"
                            className="btn-agent-action delete"
                            onClick={() => handleDeleteSkill(sk.id, sk.name)}
                            title="Excluir skill"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // FORM / EDITOR VIEW
              <form className="agent-form" onSubmit={handleSaveSkill}>
                <div className="agent-form-row">
                  <div className="agent-form-group">
                    <label className="agent-form-label">Emoji / Ícone</label>
                    <input
                      type="text"
                      className="agent-form-input"
                      style={{ textAlign: 'center', fontSize: '1.25rem' }}
                      value={skillFormIcon}
                      onChange={(e) => setSkillFormIcon(e.target.value)}
                      maxLength={4}
                      required
                    />
                    <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
                      {['💬', '🗂️', '📝', '🧠', '📊', '⚡', '💡', '🎯', '🔍', '📖', '🧪', '📌', '🚀'].map(
                        (emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setSkillFormIcon(emoji)}
                            style={{
                              background: skillFormIcon === emoji ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              borderRadius: '0.3rem',
                              padding: '0.2rem 0.4rem',
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                            }}
                          >
                            {emoji}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="agent-form-group" style={{ flex: 1 }}>
                    <label className="agent-form-label">Nome da Skill</label>
                    <input
                      type="text"
                      className="agent-form-input"
                      placeholder="Ex: Flashcards Avançados, Simulado ENADE, etc."
                      value={skillFormName}
                      onChange={(e) => setSkillFormName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="agent-form-row">
                  <div className="agent-form-group" style={{ flex: 1 }}>
                    <label className="agent-form-label">Categoria</label>
                    <select
                      className="agent-form-select"
                      value={skillFormCategory}
                      onChange={(e: any) => setSkillFormCategory(e.target.value)}
                    >
                      <option value="academico">Acadêmico (Fóruns, Debates, Ensaios)</option>
                      <option value="estudo">Estudo & Revisão (Flashcards, Simulados)</option>
                      <option value="visual">Visual & Estrutural (Mapas Mentais, Infográficos)</option>
                      <option value="produtividade">Produtividade (Sínteses, Checklists)</option>
                    </select>
                  </div>
                </div>

                <div className="agent-form-group">
                  <label className="agent-form-label">Descrição Resumida</label>
                  <input
                    type="text"
                    className="agent-form-input"
                    placeholder="Breve explicação do que esta skill faz e quando usá-la..."
                    value={skillFormDesc}
                    onChange={(e) => setSkillFormDesc(e.target.value)}
                  />
                </div>

                <div className="agent-form-group">
                  <label className="agent-form-label">
                    Instruções da Skill (Regras de Formatação & Prompt Especializado)
                  </label>
                  <span className="agent-form-hint">
                    Defina exatamente como o assistente deve estruturar o output quando esta skill estiver ativada (ex: blocos de flashcard, código Mermaid mindmap, tabelas de infográfico, questões com gabarito).
                  </span>
                  <textarea
                    className="agent-form-textarea"
                    value={skillFormPrompt}
                    onChange={(e) => setSkillFormPrompt(e.target.value)}
                    rows={8}
                    required
                  />
                </div>

                <div className="agent-form-group">
                  <label className="agent-form-label">
                    🛠️ Ferramentas Habilitadas (Tools)
                  </label>
                  <span className="agent-form-hint">
                    Marque os recursos adicionais que o modelo terá permissão para usar ao executar esta skill.
                  </span>
                  <div className="flex flex-col gap-2 mt-2">
                    {AVAILABLE_TOOLS.map((tool) => {
                      const isChecked = skillFormTools.includes(tool.id);
                      return (
                        <label
                          key={tool.id}
                          className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition ${
                            isChecked
                              ? 'bg-slate-800/90 border-amber-500/50 text-slate-100 shadow-sm'
                              : 'bg-slate-900/50 border-slate-700/50 text-slate-400 hover:border-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSkillFormTools((prev) => [...prev, tool.id]);
                              } else {
                                setSkillFormTools((prev) => prev.filter((id) => id !== tool.id));
                              }
                            }}
                            className="mt-1 rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-200">
                              <span>{tool.icon}</span>
                              <span>{tool.name}</span>
                            </div>
                            <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                              {tool.description}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-cancel"
                    onClick={() => setIsEditingSkill(false)}
                  >
                    Voltar
                  </button>
                  <button type="submit" className="btn-submit">
                    Salvar Skill
                  </button>
                </div>
              </form>
            )}

            {!isEditingSkill && (
              <div className="modal-actions space-between">
                <button
                  type="button"
                  className="btn-submit"
                  onClick={handleOpenCreateSkill}
                >
                  <Plus size={16} /> Criar Nova Skill
                </button>
                <button
                  type="button"
                  className="btn-cancel"
                  onClick={() => setShowSkillsModal(false)}
                >
                  Fechar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Multimodal Image Zoom Modal */}
      {previewModalImage && (
        <div
          className="modal-overlay image-preview-modal-overlay"
          onClick={() => setPreviewModalImage(null)}
        >
          <div className="image-preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="btn-close-img-modal"
              onClick={() => setPreviewModalImage(null)}
              title="Fechar"
            >
              <X size={20} />
            </button>
            <img src={previewModalImage} alt="Imagem ampliada" className="image-preview-modal-img" />
          </div>
        </div>
      )}
    </div>
  );
}
