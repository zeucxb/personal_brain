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
  page?: number;
  snippet: string;
  materia?: string;
  technicalTerm?: string;
  evalMotivo?: string;
};

export interface SourcesListProps {
  sources?: ChatSource[];
  selectedSource?: ChatSource | null;
  onSelectSource?: (source: ChatSource | null) => void;
}

/**
 * Transforms numerical citations like [1], [2], [1, 2] in Markdown text into
 * [1](citation:1) links so that ReactMarkdown can render them as interactive clickable badges.
 */
export function linkifyCitations(text: string): string {
  if (!text) return '';
  // Split grouped citations like [1, 2] or [1, 2, 3] into individual citations [1] [2]
  let cleaned = text.replace(/\[(\d+(?:\s*,\s*\d+)+)\]/g, (_, nums) => {
    return nums
      .split(',')
      .map((n: string) => `[${n.trim()}]`)
      .join(' ');
  });
  // Replace [1] with [1](#source-1), ignoring existing markdown links [name](url)
  return cleaned.replace(/\[(\d+)\](?!\()/g, (_, num) => `[${num}](#source-${num})`);
}

export default function SourcesList({
  sources,
  selectedSource: controlledSelectedSource,
  onSelectSource: controlledOnSelectSource,
}: SourcesListProps) {
  const [internalSelectedSource, setInternalSelectedSource] = useState<ChatSource | null>(null);

  const selectedSource =
    controlledSelectedSource !== undefined ? controlledSelectedSource : internalSelectedSource;
  const setSelectedSource = controlledOnSelectSource || setInternalSelectedSource;

  if ((!sources || sources.length === 0) && !selectedSource) return null;

  const firstTechTerm = sources?.find((s) => s.technicalTerm)?.technicalTerm;

  return (
    <>
      {sources && sources.length > 0 && (
        <div className="sources-container">
          <div className="sources-header">
            <span className="sources-title">
              <BookOpen size={14} className="sources-icon" /> Fontes consultadas ({sources.length})
            </span>
            {firstTechTerm && (
              <span className="source-tech-term-badge" title="Termo técnico ou conceito formal identificado pelo subagente para busca no acervo">
                Termo no acervo: <strong>{firstTechTerm}</strong>
              </span>
            )}
          </div>

          <div className="sources-grid">
            {sources.map((src) => {
              const isDoc = src.type === 'document';
              const isSelected = selectedSource?.index === src.index;
              return (
                <div
                  key={src.id || src.index}
                  className={`source-card ${isSelected ? 'active' : ''}`}
                  onClick={() => setSelectedSource(src)}
                  title={`Clique para ver o trecho extraído deste ${isDoc ? `documento${src.page ? ` (Pág. ${src.page})` : ''}` : 'link'}`}
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
                    title={
                      isDoc
                        ? src.source.toLowerCase().endsWith('.pdf')
                          ? src.page
                            ? `Abrir PDF original na página ${src.page}`
                            : 'Abrir arquivo PDF original'
                          : 'Abrir arquivo original'
                        : 'Abrir link original'
                    }
                  >
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>

              <div className="source-card-meta">
                {isDoc ? (
                  <>
                    <span className="source-meta-tag">{src.materia || 'Doc'}</span>
                    {src.page && (
                      <span className="source-meta-tag source-page-tag">
                        {src.source.toLowerCase().endsWith('.pdf') ? 'Pág.' : 'Seção'} {src.page}
                      </span>
                    )}
                  </>
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
        </div>
      )}

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
                        Documento do tópico: <strong>{selectedSource.materia || 'Geral'}</strong>
                        {selectedSource.page && (
                          <> • {selectedSource.source.toLowerCase().endsWith('.pdf') ? 'Página' : 'Seção'}: <strong>{selectedSource.page}</strong></>
                        )}
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
              {selectedSource.evalMotivo && (
                <div className="source-eval-badge">
                  ✓ <strong>Aprovado pelo Avaliador:</strong> {selectedSource.evalMotivo}
                </div>
              )}
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
                  <ExternalLink size={14} />{' '}
                  {selectedSource.type === 'document'
                    ? selectedSource.source.toLowerCase().endsWith('.pdf')
                      ? selectedSource.page
                        ? `Abrir PDF na página ${selectedSource.page}`
                        : 'Abrir PDF original'
                      : 'Abrir arquivo original'
                    : 'Abrir página original'}
                </a>
              )}
              <button className="btn-cancel" onClick={() => setSelectedSource(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
