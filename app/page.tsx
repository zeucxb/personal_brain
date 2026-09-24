'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileText, UploadCloud, Trash2, Plus, X, BookOpen, Layers } from 'lucide-react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Modals state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    fetchSubjects();
    fetchDocuments();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeSubject]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input };
    const subjectMessages = messages[activeSubject] || [];

    setMessages({
      ...messages,
      [activeSubject]: [...subjectMessages, userMsg],
    });
    setInput('');
    setIsLoading(true);

    const botMsgId = (Date.now() + 1).toString();
    setMessages((prev) => ({
      ...prev,
      [activeSubject]: [...(prev[activeSubject] || []), { id: botMsgId, role: 'assistant', content: '' }],
    }));

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...subjectMessages, userMsg],
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

          setMessages((prev) => {
            const currentList = prev[activeSubject] || [];
            return {
              ...prev,
              [activeSubject]: currentList.map((m) =>
                m.id === botMsgId ? { ...m, content: accumulatedText } : m
              ),
            };
          });
        }
      }
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
    if (
      !confirm(
        `Deseja excluir a matéria "${sub}" e todos os seus documentos indexados?`
      )
    ) {
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

  const currentMessages = messages[activeSubject] || [];
  const currentSubjectDocs = documents.filter((d) => d.materia === activeSubject);

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <h1>
          <BookOpen size={22} className="logo-icon" />
          <span>RAG Chat</span>
        </h1>

        <div className="sidebar-section-title">Matérias</div>
        <div className="subject-list">
          {subjects.map((sub) => {
            const count = documents.filter((d) => d.materia === sub).length;
            return (
              <div
                key={sub}
                className={`subject-item ${activeSubject === sub ? 'active' : ''}`}
                onClick={() => setActiveSubject(sub)}
              >
                <div className="subject-name-wrapper">
                  <span className="subject-name">{sub}</span>
                  {count > 0 && <span className="doc-badge">{count} PDF{count > 1 ? 's' : ''}</span>}
                </div>
                {sub !== 'Geral' && (
                  <button
                    className="subject-delete-btn"
                    title={`Excluir matéria ${sub}`}
                    onClick={(e) => handleDeleteSubject(e, sub)}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <button
          className="new-subject-btn"
          onClick={() => {
            const name = prompt('Nome da nova matéria:');
            if (name && !subjects.includes(name.trim())) {
              const cleanName = name.trim();
              setSubjects([...subjects, cleanName]);
              setActiveSubject(cleanName);
            }
          }}
        >
          <Plus size={16} />
          Nova Matéria
        </button>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        <header className="chat-header">
          <div>
            <h2>{activeSubject}</h2>
            <p className="subject-meta">
              {currentSubjectDocs.length === 0
                ? 'Nenhum documento anexado'
                : `${currentSubjectDocs.length} documento(s) indexado(s)`}
            </p>
          </div>

          <div className="chat-header-actions">
            <button
              className="secondary-btn"
              onClick={() => setShowDocsModal(true)}
              title="Gerenciar documentos da matéria"
            >
              <FileText size={16} />
              <span>Documentos ({currentSubjectDocs.length})</span>
            </button>

            <button className="upload-btn" onClick={() => setShowUploadModal(true)}>
              <UploadCloud size={16} />
              <span>Upload PDF</span>
            </button>
          </div>
        </header>

        <div className="messages">
          {currentMessages.length === 0 ? (
            <div className="empty-chat-placeholder">
              <div className="placeholder-icon">
                <Layers size={36} />
              </div>
              <h3>Conversar sobre {activeSubject}</h3>
              <p>
                {currentSubjectDocs.length === 0 ? (
                  <>
                    Esta matéria ainda não possui documentos indexados.<br />
                    Clique em <strong>Upload PDF</strong> para adicionar o material de estudo.
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
              placeholder={`Pergunte algo sobre ${activeSubject}...`}
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
                <h3>Documentos de {activeSubject}</h3>
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
                  <div key={doc.filename} className="doc-item">
                    <div className="doc-info">
                      <FileText size={20} className="doc-file-icon" />
                      <div className="doc-details">
                        <span className="doc-name" title={doc.filename}>
                          {doc.filename}
                        </span>
                        <span className="doc-chunks">
                          {doc.chunksCount} chunks indexados
                        </span>
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
              <button
                className="upload-btn"
                onClick={() => {
                  setShowDocsModal(false);
                  setShowUploadModal(true);
                }}
              >
                <Plus size={16} /> Adicionar Novo PDF
              </button>
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
