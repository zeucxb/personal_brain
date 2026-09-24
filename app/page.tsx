'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';

import SourcesList, { ChatSource, linkifyCitations } from './components/SourcesList';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
};

type Conversation = {
  id: string;
  title: string;
  materia: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
};

type DocItem = {
  filename: string;
  materia: string;
  chunksCount: number;
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
}: {
  content: string;
  sources?: ChatSource[];
}) {
  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);

  const cleanContent = cleanAiResponse(content);
  const processedContent = linkifyCitations(cleanContent);

  return (
    <>
      <SourcesList
        sources={sources}
        selectedSource={selectedSource}
        onSelectSource={setSelectedSource}
      />
      {content ? (
        <div className="markdown-content">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => url}
            components={{
              a: ({ href, children }) => {
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
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      ) : (
        <div className="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
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

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      } else {
        // Create an initial conversation if none exists
        const newId = `c_${Date.now()}`;
        const newConv: Conversation = {
          id: newId,
          title: 'Nova conversa',
          materia: subject,
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
  }, []);

  useEffect(() => {
    loadConversations(activeSubject);
  }, [activeSubject]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConvId]);

  const activeConversation =
    conversations.find((c) => c.id === activeConvId) || conversations[0] || null;

  const currentMessages = activeConversation ? activeConversation.messages : [];

  const handleCreateNewConversation = () => {
    const newId = `c_${Date.now()}`;
    const newConv: Conversation = {
      id: newId,
      title: 'Nova conversa',
      materia: activeSubject,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newId);
    saveConversationToDb(newConv);
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
    if (!input.trim() || isLoading || !activeConversation) return;

    const userMsgText = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userMsgText };
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
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...activeConversation.messages, userMsg],
          materia: activeSubject,
          webSearch: webSearchEnabled,
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
                if (currentEvent === 'sources') {
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
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('materia', activeSubject);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
        setShowUploadModal(false);
        setFile(null);
        await fetchDocuments();
        await fetchSubjects();
        alert(`Sucesso! Documento fatiado em ${data.chunks} chunks e indexado com embeddings.`);
      } else {
        alert(data.error || 'Erro ao indexar documento.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro no servidor ao processar o PDF.');
    } finally {
      setUploading(false);
    }
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
                onClick={() => setActiveConvId(conv.id)}
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
                <span className="global-scope-pill" title="O tópico Geral tem acesso a todos os PDFs">
                  <Globe size={13} /> Acesso a todo o acervo ({documents.length} PDFs)
                </span>
              ) : (
                <span className="subject-scope-pill">
                  {currentSubjectDocs.length} PDF(s) indexado(s)
                </span>
              )}
            </div>
            <p className="active-conv-name">
              Chat: <strong>{activeConversation ? activeConversation.title : 'Nova conversa'}</strong>
            </p>
          </div>

          <div className="chat-header-actions">
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
                <span>Upload PDF</span>
              </button>
            ) : (
              <button
                className="upload-btn"
                title="Para fazer upload, selecione um tópico específico ou crie um"
                onClick={() => {
                  const targetSubject = prompt(
                    'Para qual tópico deseja enviar o PDF? Digite o nome do tópico:',
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
                <span>Upload PDF</span>
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
                    O tópico <strong>Geral</strong> busca contexto em <strong>todos os PDFs cadastrados no sistema</strong> ({documents.length} documentos no total).<br />
                    Pergunte qualquer coisa sobre qualquer tópico que o Llama 3 encontrará as respostas!
                  </>
                ) : currentSubjectDocs.length === 0 ? (
                  <>
                    Este tópico ainda não possui documentos indexados.<br />
                    Você pode clicar em <strong>Upload PDF</strong> para anexar apostilas ou ativar o botão <strong>🌐 Web</strong> abaixo para pesquisar na internet!
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
            currentMessages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  <AssistantMessage content={msg.content} sources={msg.sources} />
                ) : (
                  msg.content
                )}
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        <form className="input-area" onSubmit={handleSend}>
          <div className="input-box">
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
                webSearchEnabled
                  ? `Pesquisar na Web e no acervo (${activeSubject})...`
                  : activeSubject === 'Geral'
                  ? 'Pergunte algo no acervo global de todos os tópicos...'
                  : `Pergunte algo sobre ${activeSubject}...`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" className="btn-send" disabled={isLoading || !input.trim()}>
              {isLoading ? <span className="loader"></span> : 'Enviar'}
            </button>
          </div>
        </form>
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => !uploading && setShowUploadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Upload de PDF para o tópico "{activeSubject}"</h3>
              <button
                className="close-btn"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                <X size={18} />
              </button>
            </div>

            <p className="modal-description">
              O arquivo será fatiado em blocos contextuais com sobreposição e vetorizado via Ollama.
            </p>

            <input
              type="file"
              accept=".pdf"
              className="file-input"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />

            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setShowUploadModal(false)}
                disabled={uploading}
              >
                Cancelar
              </button>
              <button
                className="btn-submit"
                onClick={handleUpload}
                disabled={uploading || !file}
              >
                {uploading ? (
                  <>
                    <span className="loader"></span> Vetorizando...
                  </>
                ) : (
                  'Fazer Upload e Vetorizar'
                )}
              </button>
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
                        title="Abrir arquivo PDF original em nova aba"
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
    </div>
  );
}
