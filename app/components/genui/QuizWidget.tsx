'use client';

import React, { useState } from 'react';
import {
  FileCheck2,
  CheckCircle,
  XCircle,
  HelpCircle,
  RotateCcw,
  AlertTriangle,
  Award,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { QuizQuestion } from './genUiParser';
import { ChatSource } from '../SourcesList';

interface QuizWidgetProps {
  questions: QuizQuestion[];
  sources?: ChatSource[];
  onSelectSource?: (source: ChatSource | null) => void;
}

export function QuizWidget({ questions, sources, onSelectSource }: QuizWidgetProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [confirmedQuestions, setConfirmedQuestions] = useState<Record<number, boolean>>({});
  const [expandedExplanation, setExpandedExplanation] = useState<Record<number, boolean>>({});

  if (!questions || questions.length === 0) return null;

  const handleSelectOption = (qId: number, letter: string) => {
    if (confirmedQuestions[qId]) return; // Já confirmou
    setSelectedAnswers((prev) => ({ ...prev, [qId]: letter }));
  };

  const handleConfirmAnswer = (qId: number) => {
    if (!selectedAnswers[qId]) return;
    setConfirmedQuestions((prev) => ({ ...prev, [qId]: true }));
    setExpandedExplanation((prev) => ({ ...prev, [qId]: true }));
  };

  const handleResetQuiz = () => {
    setSelectedAnswers({});
    setConfirmedQuestions({});
    setExpandedExplanation({});
  };

  // Calcula pontuação
  const totalAnswered = Object.keys(confirmedQuestions).length;
  const correctCount = questions.filter(
    (q) => confirmedQuestions[q.id] && selectedAnswers[q.id] === q.correct
  ).length;

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
    <div className="genui-widget genui-quiz-container my-4">
      {/* Header do Simulado */}
      <div className="genui-widget-header">
        <div className="genui-header-title">
          <FileCheck2 size={16} className="text-emerald-400" />
          <span>Simulador de Atividades & Avaliação Interativa ({questions.length} questões)</span>
        </div>
        {totalAnswered > 0 && (
          <button
            type="button"
            className="genui-btn-reset"
            onClick={handleResetQuiz}
            title="Refazer todas as questões"
          >
            <RotateCcw size={13} />
            <span>Refazer</span>
          </button>
        )}
      </div>

      {/* Banner de Placar / Desempenho */}
      {totalAnswered > 0 && (
        <div className="quiz-score-banner">
          <div className="quiz-score-stats">
            <Award size={18} className="text-amber-400" />
            <span>
              Progresso: <strong>{totalAnswered}/{questions.length}</strong> respondidas •{' '}
              Acertos: <strong>{correctCount}</strong> ({Math.round((correctCount / totalAnswered) * 100)}%)
            </span>
          </div>
          {totalAnswered === questions.length && (
            <span className="quiz-score-verdict">
              {correctCount === questions.length
                ? '🎉 Gabaritou! Excelente domínio do conteúdo!'
                : correctCount >= questions.length * 0.7
                ? '👏 Muito bom! Domínio consistente com pequenos ajustes.'
                : '📚 Vale a pena revisar os pontos fracos e tentar de novo.'}
            </span>
          )}
        </div>
      )}

      {/* Lista de Questões */}
      <div className="quiz-questions-list">
        {questions.map((q, idx) => {
          const userChoice = selectedAnswers[q.id];
          const isConfirmed = Boolean(confirmedQuestions[q.id]);
          const isCorrect = isConfirmed && userChoice === q.correct;
          const isExplanationOpen = expandedExplanation[q.id];

          return (
            <div
              key={q.id}
              className={`quiz-question-card ${
                isConfirmed ? (isCorrect ? 'confirmed-correct' : 'confirmed-wrong') : ''
              }`}
            >
              {/* Topo da Questão */}
              <div className="quiz-question-top">
                <div className="flex items-center gap-2">
                  <span className="quiz-question-number">Questão {idx + 1}</span>
                  {q.nivel && <span className="genui-nivel-badge badge-nivel-medio">{q.nivel}</span>}
                </div>
                {isConfirmed && (
                  <span className={`quiz-status-pill ${isCorrect ? 'correct' : 'wrong'}`}>
                    {isCorrect ? (
                      <>
                        <CheckCircle size={13} /> Correto
                      </>
                    ) : (
                      <>
                        <XCircle size={13} /> Incorreto (Correta: {q.correct})
                      </>
                    )}
                  </span>
                )}
              </div>

              {/* Enunciado */}
              <div className="quiz-enunciado-text">
                {renderWithCitations(q.enunciado)}
              </div>

              {/* Alternativas */}
              <div className="quiz-options-grid">
                {q.options.map((opt) => {
                  const isSelected = userChoice === opt.letter;
                  const isThisCorrect = q.correct === opt.letter;

                  let optClass = 'quiz-option-btn';
                  if (!isConfirmed && isSelected) {
                    optClass += ' selected';
                  } else if (isConfirmed) {
                    if (isThisCorrect) {
                      optClass += ' state-correct';
                    } else if (isSelected && !isThisCorrect) {
                      optClass += ' state-wrong';
                    } else {
                      optClass += ' state-disabled';
                    }
                  }

                  return (
                    <button
                      key={opt.letter}
                      type="button"
                      disabled={isConfirmed}
                      onClick={() => handleSelectOption(q.id, opt.letter)}
                      className={optClass}
                    >
                      <span className="quiz-option-letter">{opt.letter}</span>
                      <span className="quiz-option-text">{opt.text}</span>
                      {isConfirmed && isThisCorrect && (
                        <CheckCircle size={15} className="ml-auto text-emerald-400 shrink-0" />
                      )}
                      {isConfirmed && isSelected && !isThisCorrect && (
                        <XCircle size={15} className="ml-auto text-rose-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Ação de Confirmar */}
              {!isConfirmed && (
                <div className="quiz-question-actions">
                  <button
                    type="button"
                    disabled={!userChoice}
                    onClick={() => handleConfirmAnswer(q.id)}
                    className="genui-btn-confirm"
                  >
                    Confirmar Resposta
                  </button>
                </div>
              )}

              {/* Gabarito Comentado e Análise de Distratores */}
              {isConfirmed && (q.justificativa || q.distratores) && (
                <div className="quiz-feedback-box">
                  <button
                    type="button"
                    className="quiz-feedback-toggle"
                    onClick={() =>
                      setExpandedExplanation((prev) => ({
                        ...prev,
                        [q.id]: !prev[q.id],
                      }))
                    }
                  >
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
                      <HelpCircle size={14} /> Gabarito Oficial Comentado
                    </span>
                    {isExplanationOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {isExplanationOpen && (
                    <div className="quiz-feedback-content">
                      {q.justificativa && (
                        <div className="quiz-justificativa">
                          <strong>Justificativa Técnica:</strong>{' '}
                          {renderWithCitations(q.justificativa)}
                        </div>
                      )}

                      {q.distratores && (
                        <div className="quiz-distratores">
                          <div className="flex items-center gap-1 font-semibold text-amber-400 mb-1">
                            <AlertTriangle size={13} />
                            <span>Pegadinhas & Análise dos Distratores:</span>
                          </div>
                          <div>{renderWithCitations(q.distratores)}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
