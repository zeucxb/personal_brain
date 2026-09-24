'use client';

import React from 'react';
import {
  BarChart3,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Target,
  Sparkles,
  Layers,
} from 'lucide-react';
import { InfographicData } from './genUiParser';
import { ChatSource } from '../SourcesList';

interface InfographicWidgetProps {
  data: InfographicData;
  sources?: ChatSource[];
  onSelectSource?: (source: ChatSource | null) => void;
}

export function InfographicWidget({ data, sources, onSelectSource }: InfographicWidgetProps) {
  if (!data) return null;

  const renderWithCitations = (text: string) => {
    const parts = text.split(/(\[\d+\])/g);
    return parts.map((part, idx) => {
      const match = part.match(/\[(\d+)\]/);
      if (match) {
        const citationIndex = parseInt(match[1], 10);
        const matched = sources?.find((s) => s.index === citationIndex);
        return (
          <button
            key={idx}
            type="button"
            className="inline-citation"
            onClick={(e) => {
              e.stopPropagation();
              if (matched && onSelectSource) onSelectSource(matched);
            }}
            title={matched ? `Ver fonte [${citationIndex}]: ${matched.title}` : `Fonte [${citationIndex}]`}
          >
            [{citationIndex}]
          </button>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  return (
    <div className="genui-widget genui-infographic-container my-4">
      {/* Header Executivo */}
      <div className="infographic-banner">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 size={18} className="text-amber-400" />
          <span className="infographic-kicker">INFOGRÁFICO EXECUTIVO DA MATÉRIA</span>
        </div>
        <h3 className="infographic-title">{data.title}</h3>
        {data.resumo && <p className="infographic-subtitle">{data.resumo}</p>}
      </div>

      {/* Grid de Pilares / Indicadores (KPIs) */}
      {data.pilares && data.pilares.length > 0 && (
        <div className="infographic-section">
          <div className="infographic-section-label">
            <Layers size={13} className="text-indigo-400" />
            <span>Pilares & Conceitos Centrais</span>
          </div>
          <div className="infographic-kpis-grid">
            {data.pilares.map((p, idx) => (
              <div key={idx} className="infographic-kpi-card">
                <span className="infographic-kpi-label">{p.label}</span>
                {p.value && <div className="infographic-kpi-value">{p.value}</div>}
                {p.detail && (
                  <div className="infographic-kpi-detail">
                    {renderWithCitations(p.detail)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linha de Etapas / Fluxo do Processo */}
      {data.etapas && data.etapas.length > 0 && (
        <div className="infographic-section">
          <div className="infographic-section-label">
            <ArrowRight size={13} className="text-emerald-400" />
            <span>Fluxo de Ação & Linha de Etapas</span>
          </div>
          <div className="infographic-steps-flow">
            {data.etapas.map((step, idx) => (
              <div key={idx} className="infographic-step-item">
                <div className="infographic-step-badge">{step.step || idx + 1}</div>
                <div className="infographic-step-body">
                  <div className="infographic-step-title">{step.title}</div>
                  {step.description && (
                    <div className="infographic-step-desc">
                      {renderWithCitations(step.description)}
                    </div>
                  )}
                </div>
                {idx < data.etapas.length - 1 && (
                  <div className="infographic-step-arrow">➔</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Destaques Lado a Lado: Ponto Chave vs Pegadinha */}
      {(data.pontoChave || data.pegadinha) && (
        <div className="infographic-alerts-row">
          {data.pontoChave && (
            <div className="infographic-alert-box keypoint">
              <div className="infographic-alert-header">
                <Lightbulb size={15} className="text-amber-400" />
                <span>Ponto Chave de Atenção</span>
              </div>
              <div className="infographic-alert-text">
                {renderWithCitations(data.pontoChave)}
              </div>
            </div>
          )}

          {data.pegadinha && (
            <div className="infographic-alert-box warning">
              <div className="infographic-alert-header">
                <AlertTriangle size={15} className="text-rose-400" />
                <span>Pegadinha Frequente de Prova</span>
              </div>
              <div className="infographic-alert-text">
                {renderWithCitations(data.pegadinha)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conclusões Acionáveis */}
      {data.conclusoes && data.conclusoes.length > 0 && (
        <div className="infographic-conclusoes-box">
          <div className="infographic-section-label">
            <Target size={13} className="text-indigo-400" />
            <span>Conclusões Acionáveis</span>
          </div>
          <ul className="infographic-conclusoes-list">
            {data.conclusoes.map((conc, idx) => (
              <li key={idx} className="infographic-conclusao-item">
                <span className="infographic-conclusao-dot">🎯</span>
                <span>{renderWithCitations(conc)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
