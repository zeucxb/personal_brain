'use client';

import React, { useState } from 'react';
import {
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Sparkles,
  LayoutGrid,
  Layers,
  Lightbulb,
} from 'lucide-react';
import { FlashcardItem } from './genUiParser';
import { ChatSource } from '../SourcesList';

interface FlashcardsWidgetProps {
  cards: FlashcardItem[];
  sources?: ChatSource[];
  onSelectSource?: (source: ChatSource | null) => void;
}

export function FlashcardsWidget({ cards, sources, onSelectSource }: FlashcardsWidgetProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [viewMode, setViewMode] = useState<'carousel' | 'grid'>('carousel');
  const [knownCards, setKnownCards] = useState<Set<number>>(new Set());

  if (!cards || cards.length === 0) return null;

  const currentCard = cards[currentIndex];
  const isCurrentKnown = knownCards.has(currentCard.id);

  const toggleKnown = (id: number) => {
    setKnownCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNext = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev + 1) % cards.length);
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length);
  };

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

  const getNivelBadgeClass = (nivel?: string) => {
    const n = (nivel || '').toLowerCase();
    if (n.includes('fácil') || n.includes('básico')) return 'badge-nivel-facil';
    if (n.includes('difícil') || n.includes('avançado')) return 'badge-nivel-dificil';
    return 'badge-nivel-medio';
  };

  return (
    <div className="genui-widget genui-flashcards-container my-4">
      {/* Header com Controles de Modo */}
      <div className="genui-widget-header">
        <div className="genui-header-title">
          <Layers size={16} className="text-amber-400" />
          <span>Deck Interativo de Flashcards ({cards.length} cards)</span>
          <span className="genui-mastery-tag">
            {knownCards.size}/{cards.length} dominados
          </span>
        </div>
        <div className="genui-header-actions">
          <button
            type="button"
            className={`genui-tab-btn ${viewMode === 'carousel' ? 'active' : ''}`}
            onClick={() => setViewMode('carousel')}
            title="Visualização em Apresentação"
          >
            <Layers size={13} />
            <span>Carrossel</span>
          </button>
          <button
            type="button"
            className={`genui-tab-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
            title="Visualização em Grade"
          >
            <LayoutGrid size={13} />
            <span>Grade</span>
          </button>
        </div>
      </div>

      {viewMode === 'carousel' ? (
        /* MODO CARROSSEL COM FLIP 3D */
        <div className="flashcard-carousel-view">
          <div className="flashcard-progress-bar-container">
            <div
              className="flashcard-progress-bar"
              style={{ width: `${((currentIndex + 1) / cards.length) * 100}%` }}
            />
          </div>

          <div
            className={`flashcard-scene ${isFlipped ? 'flipped' : ''}`}
            onClick={() => setIsFlipped(!isFlipped)}
            title="Clique para virar o card"
          >
            <div className="flashcard-card-inner">
              {/* LADO DA FRENTE */}
              <div className="flashcard-face flashcard-front">
                <div className="flashcard-face-top">
                  <span className={`genui-nivel-badge ${getNivelBadgeClass(currentCard.nivel)}`}>
                    {currentCard.nivel || 'Geral'}
                  </span>
                  <span className="flashcard-indicator">
                    Card {currentIndex + 1} de {cards.length}
                  </span>
                </div>

                <div className="flashcard-face-content">
                  <span className="flashcard-question-prefix">Desafio / Pergunta</span>
                  <h4 className="flashcard-question-text">
                    {renderWithCitations(currentCard.frente)}
                  </h4>
                </div>

                <div className="flashcard-face-bottom">
                  <span className="flashcard-tap-hint">
                    <RotateCcw size={13} /> Clique no card para ver o verso
                  </span>
                </div>
              </div>

              {/* LADO DO VERSO */}
              <div className="flashcard-face flashcard-back">
                <div className="flashcard-face-top">
                  <span className="genui-nivel-badge badge-nivel-resposta">
                    ✓ Resposta & Fundamentação
                  </span>
                  <span className="flashcard-indicator">
                    Card {currentIndex + 1} de {cards.length}
                  </span>
                </div>

                <div className="flashcard-face-content">
                  <div className="flashcard-answer-text">
                    {renderWithCitations(currentCard.verso)}
                  </div>

                  {currentCard.dica && (
                    <div className="flashcard-mnemonic-box">
                      <div className="flashcard-mnemonic-title">
                        <Lightbulb size={13} className="text-amber-400" />
                        <span>Dica Mnemônica:</span>
                      </div>
                      <div className="flashcard-mnemonic-text">
                        {currentCard.dica}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flashcard-face-bottom">
                  <span className="flashcard-tap-hint">
                    <RotateCcw size={13} /> Clique para voltar à pergunta
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Barra de Navegação e Ações do Card */}
          <div className="flashcard-controls-row">
            <button
              type="button"
              className="genui-btn-circle"
              onClick={handlePrev}
              title="Card anterior"
            >
              <ChevronLeft size={18} />
            </button>

            <div className="flashcard-central-actions">
              <button
                type="button"
                className="genui-btn-flip"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <RotateCcw size={14} />
                <span>{isFlipped ? 'Ver Pergunta' : 'Ver Resposta'}</span>
              </button>

              <button
                type="button"
                className={`genui-btn-known ${isCurrentKnown ? 'active' : ''}`}
                onClick={() => toggleKnown(currentCard.id)}
                title={isCurrentKnown ? 'Marcar como não dominado' : 'Marcar como dominado'}
              >
                <CheckCircle2 size={14} />
                <span>{isCurrentKnown ? 'Dominado ✓' : 'Já sei este'}</span>
              </button>
            </div>

            <button
              type="button"
              className="genui-btn-circle"
              onClick={handleNext}
              title="Próximo card"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      ) : (
        /* MODO GRADE COMPLETA */
        <div className="flashcard-grid-view">
          {cards.map((card, idx) => {
            const isKnown = knownCards.has(card.id);
            return (
              <div key={card.id} className="flashcard-grid-card">
                <div className="flashcard-grid-header">
                  <span className={`genui-nivel-badge ${getNivelBadgeClass(card.nivel)}`}>
                    #{idx + 1} {card.nivel || 'Card'}
                  </span>
                  <button
                    type="button"
                    className={`btn-mini-known ${isKnown ? 'active' : ''}`}
                    onClick={() => toggleKnown(card.id)}
                    title={isKnown ? 'Dominado' : 'Marcar como dominado'}
                  >
                    <CheckCircle2 size={13} />
                  </button>
                </div>
                <div className="flashcard-grid-frente">
                  <strong>Pergunta:</strong> {renderWithCitations(card.frente)}
                </div>
                <div className="flashcard-grid-verso">
                  <strong>Resposta:</strong> {renderWithCitations(card.verso)}
                </div>
                {card.dica && (
                  <div className="flashcard-grid-dica">
                    💡 <em>{card.dica}</em>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
