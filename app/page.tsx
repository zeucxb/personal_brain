'use client';

import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export default function ChatApp() {
  const [subjects, setSubjects] = useState<string[]>(['Geral']);
  const [activeSubject, setActiveSubject] = useState<string>('Geral');
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/subjects')
      .then((res) => res.json())
      .then((data) => {
        if (data.subjects && data.subjects.length > 0) {
          setSubjects((prev) => Array.from(new Set([...prev, ...data.subjects])));
        }
      })
      .catch(console.error);
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
      if (res.ok) {
        alert('Documento indexado com sucesso!');
        setShowModal(false);
        setFile(null);
      } else {
        alert('Erro ao indexar documento.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro no servidor.');
    } finally {
      setUploading(false);
    }
  };

  const currentMessages = messages[activeSubject] || [];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <h1>📚 Matérias</h1>
        <div className="subject-list">
          {subjects.map((sub) => (
            <div
              key={sub}
              className={`subject-item ${activeSubject === sub ? 'active' : ''}`}
              onClick={() => setActiveSubject(sub)}
            >
              {sub}
            </div>
          ))}
        </div>
        <button 
          className="new-subject-btn"
          onClick={() => {
            const name = prompt('Nome da nova matéria:');
            if (name && !subjects.includes(name)) {
              setSubjects([...subjects, name]);
              setActiveSubject(name);
            }
          }}
        >
          + Nova Matéria
        </button>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        <header className="chat-header">
          <h2>{activeSubject}</h2>
          <button className="upload-btn" onClick={() => setShowModal(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            Upload PDF
          </button>
        </header>

        <div className="messages">
          {currentMessages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
              Faça uma pergunta sobre <strong>{activeSubject}</strong>. <br/>
              Lembre-se de fazer upload dos PDFs para dar contexto!
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
      {showModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Upload de PDF para {activeSubject}</h3>
            <input 
              type="file" 
              accept=".pdf" 
              className="file-input"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)} disabled={uploading}>
                Cancelar
              </button>
              <button className="btn-submit" onClick={handleUpload} disabled={uploading || !file}>
                {uploading ? 'Indexando...' : 'Fazer Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
