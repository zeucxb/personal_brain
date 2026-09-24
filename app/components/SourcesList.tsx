'use client';

import React, { useState } from 'react';
import { FileText, Globe, ExternalLink, X, BookOpen } from 'lucide-react';

export type ChatSource = {
  id: string;
  index: number;
  type: 'document' | 'web';
  title: string;
  source: string;
  url?: string;
  snippet: string;
  materia?: string;
};

interface SourcesListProps {
  sources?: ChatSource[];
}

export default function SourcesList({ sources }: SourcesListProps) {
  const [selectedSource, setSelectedSource] = useState<ChatSource | null>(null);

  if (!sources || sources.length === 0) return null;

  return (
    <div className="sources-container">
      <div className="sources-header">
        <span className="sources-title">
          <BookOpen size={14} className="sources-icon" /> Fontes consultadas ({sources.length})
        </span>
      </div>

      <div className="sources-grid">
        {sources.map((src) => {
          const isDoc = src.type === 'document';
          return (
            <div
              key={src.id || src.index}
              className="source-card"
              onClick={() => setSelectedSource(src)}
              title={`Clique para ver o trecho extraído deste ${isDoc ? 'documento' : 'link'}`}
            >
              <div className="source-card-header">
                <span className="source-index">[{src.index}]</span>
                {isDoc ? (
                  <FileText size={14} className="source-type-icon doc" />
                ) : (
                  <Globe size={14} className="source-type-icon web" />
                )}
                <span className="source-name" title={src.title}>
                  {src.title}
                </span>
                {src.url && (
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noreferrer"
                    className="source-link"
                    onClick={(e) => e.stopPropagation()}
                    title="Abrir link original"
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="source-card-meta">
                {isDoc ? (
                  <span className="source-meta-tag">{src.materia || 'PDF'}</span>
                ) : (
                  <span className="source-meta-tag web-tag">{src.source || 'Web'}</span>
                )}
                {src.snippet && (
                  <span className="source-snippet-preview">
                    {src.snippet.slice(0, 70)}...
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Snippet Inspection Modal */}
      {selectedSource && (
        <div className="modal-overlay" onClick={() => setSelectedSource(null)}>
          <div className="modal modal-source-detail" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="source-modal-title">
                <span className="source-index-large">[{selectedSource.index}]</span>
                <div>
                  <h4>{selectedSource.title}</h4>
                  <p className="modal-subtitle">
                    {selectedSource.type === 'document' ? (
                      <>
                        Documento da matéria: <strong>{selectedSource.materia || 'Geral'}</strong>
                      </>
                    ) : (
                      <>
                        Fonte Web:{' '}
                        <a href={selectedSource.url} target="_blank" rel="noreferrer">
                          {selectedSource.source}
                        </a>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button className="close-btn" onClick={() => setSelectedSource(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="source-modal-body">
              <div className="source-body-label">Trecho consultado pelo RAG para gerar a resposta:</div>
              <blockquote className="source-snippet-quote">
                {selectedSource.snippet}
              </blockquote>
            </div>

            <div className="modal-actions">
              {selectedSource.url && (
                <a
                  href={selectedSource.url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-submit"
                >
                  <ExternalLink size={14} /> Abrir página original
                </a>
              )}
              <button className="btn-cancel" onClick={() => setSelectedSource(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
