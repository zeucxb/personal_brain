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
} from 'lucide-react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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

export default function ChatApp() {
  const [subjects, setSubjects] = useState<string[]>(['Geral']);
  const [activeSubject, setActiveSubject] = useState<string>('Geral');
  const [documents, setDocuments] = useState<DocItem[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
        }),
      });

      if (!response.body) throw new Error('No body');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      let accumulatedText = '';
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const chunkValue = decoder.decode(value, { stream: !done });
          accumulatedText += chunkValue;

          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== activeConversation.id) return c;
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === botMsgId ? { ...m, content: accumulatedText } : m
                ),
              };
            })
          );
        }
      }

      // Persist finished conversation to DB
      const finalConv: Conversation = {
        ...activeConversation,
        title: newTitle,
        messages: activeConversation.messages
          .concat(userMsg)
          .concat({ id: botMsgId, role: 'assistant', content: accumulatedText }),
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
        `Tem certeza que deseja excluir o documento "${filename}" da matéria "${materia}"?\nOs dados vetoriais serão removidos.`
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

  const handleDeleteSubject = async (e: React.MouseEvent, sub: string) => {
    e.stopPropagation();
    if (!confirm(`Deseja excluir a matéria "${sub}", seus documentos e suas conversas?`)) {
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

        {/* Section 1: Matérias */}
        <div className="sidebar-section-header">
          <span className="sidebar-section-title">Matérias</span>
          <button
            className="add-sub-btn"
            title="Criar nova matéria"
            onClick={() => {
              const name = prompt('Nome da nova matéria:');
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
                  <button
                    className="subject-delete-btn"
                    title={`Excluir matéria ${sub}`}
                    onClick={(e) => handleDeleteSubject(e, sub)}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Section 2: Conversas da Matéria Ativa */}
        <div className="conversations-section">
          <div className="sidebar-section-header">
            <span className="sidebar-section-title">
              Conversas em {activeSubject}
            </span>
            <button
              className="new-chat-btn"
              onClick={handleCreateNewConversation}
              title="Iniciar nova conversa nesta matéria"
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
                <span className="global-scope-pill" title="A matéria Geral tem acesso a todos os PDFs">
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
                title="Para fazer upload, selecione uma matéria específica ou crie uma"
                onClick={() => {
                  const targetSubject = prompt(
                    'Para qual matéria deseja enviar o PDF? Digite o nome da matéria:',
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
                  ? 'Chat Global (Todas as Matérias)'
                  : `Conversar sobre ${activeSubject}`}
              </h3>
              <p>
                {activeSubject === 'Geral' ? (
                  <>
                    A matéria <strong>Geral</strong> busca contexto em <strong>todos os PDFs cadastrados no sistema</strong> ({documents.length} documentos no total).<br />
                    Pergunte qualquer coisa sobre qualquer matéria que o Llama 3 encontrará as respostas!
                  </>
                ) : currentSubjectDocs.length === 0 ? (
                  <>
                    Esta matéria ainda não possui documentos indexados.<br />
                    Clique em <strong>Upload PDF</strong> acima para anexar suas apostilas.
                  </>
                ) : (
                  <>
                    Esta matéria possui <strong>{currentSubjectDocs.length}</strong> documento(s) com busca vetorial ativa.<br />
                    Faça uma pergunta sobre o conteúdo para o Llama 3 responder com base nas fontes!
                  </>
                )}
              </p>
            </div>
          ) : (
            currentMessages.map((msg) => (
              <div key={msg.id} className={`message ${msg.role}`}>
                {msg.role === 'assistant' ? (
                  msg.content ? (
                    <div className="markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  )
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
            <input
              type="text"
              placeholder={
                activeSubject === 'Geral'
                  ? 'Pergunte algo no acervo global de todas as matérias...'
                  : `Pergunte algo sobre ${activeSubject}...`
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
            />
            <button type="submit" disabled={isLoading || !input.trim()}>
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
              <h3>Upload de PDF para "{activeSubject}"</h3>
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
                    : `Documentos de ${activeSubject}`}
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
                  <p>Nenhum documento cadastrado nesta matéria.</p>
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
