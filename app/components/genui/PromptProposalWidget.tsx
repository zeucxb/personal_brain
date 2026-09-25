'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Eye,
  ChevronDown,
  ChevronUp,
  FileCode,
  Bot,
  Zap,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { PromptProposal } from './genUiParser';

export interface PromptProposalWidgetProps {
  proposal: PromptProposal;
  currentAgentName?: string;
  currentSkillName?: string;
  currentPrompt?: string;
  currentDescription?: string;
  onApprove?: (proposal: PromptProposal) => Promise<boolean>;
  onReject?: (proposal: PromptProposal) => void;
  onOpenModal?: (proposal: PromptProposal) => void;
}

export function PromptProposalWidget({
  proposal,
  currentAgentName,
  currentSkillName,
  currentPrompt,
  currentDescription,
  onApprove,
  onReject,
  onOpenModal,
}: PromptProposalWidgetProps) {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [isApproving, setIsApproving] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const targetLabel = proposal.target === 'skill' ? 'Skill Especializada' : 'Agente Especialista';
  const targetName =
    proposal.name ||
    (proposal.target === 'skill' ? currentSkillName : currentAgentName) ||
    'Agente Ativo';

  const handleApproveClick = async () => {
    if (!onApprove) return;
    setIsApproving(true);
    try {
      const success = await onApprove(proposal);
      if (success) {
        setStatus('approved');
      }
    } catch (e) {
      console.error('Error approving proposal:', e);
    } finally {
      setIsApproving(false);
    }
  };

  const handleRejectClick = () => {
    setStatus('rejected');
    if (onReject) {
      onReject(proposal);
    }
  };

  return (
    <div className={`prompt-proposal-card ${status}`}>
      {/* Header */}
      <div className="proposal-header">
        <div className="proposal-title-row">
          <div className="proposal-icon-badge">
            <Sparkles size={18} className="text-amber-400" />
          </div>
          <div>
            <div className="proposal-title">
              Proposta de Auto-Evolução: <strong>{targetName}</strong>
            </div>
            <div className="proposal-subtitle">
              <span>{proposal.target === 'skill' ? <Zap size={13} /> : <Bot size={13} />}</span>
              <span>{targetLabel}</span>
            </div>
          </div>
        </div>

        <div className="proposal-status-badge">
          {status === 'pending' && <span className="status-pill pending">⏳ Aguardando Decisão</span>}
          {status === 'approved' && <span className="status-pill approved">✓ Aprovado & Aplicado</span>}
          {status === 'rejected' && <span className="status-pill rejected">✕ Descartado</span>}
        </div>
      </div>

      {/* Rationale / Motivo */}
      {proposal.rationale && (
        <div className="proposal-rationale">
          <strong>💡 O que foi adaptado:</strong> {proposal.rationale}
        </div>
      )}

      {/* Description Update if proposed */}
      {proposal.description && (
        <div className="proposal-field-preview">
          <span className="field-label">Nova Descrição Proposta:</span>
          <span className="field-value">{proposal.description}</span>
        </div>
      )}

      {/* System Prompt Collapsible Preview */}
      <div className="proposal-prompt-box">
        <div className="prompt-box-header" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="prompt-box-title">
            <FileCode size={14} className="text-purple-400" />
            <span>Novo Prompt de Sistema Proposto ({proposal.systemPrompt?.length || 0} caracteres)</span>
          </div>
          <button type="button" className="btn-toggle-expand">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {isExpanded ? (
          <div className="prompt-box-content expanded">
            <pre className="prompt-pre">{proposal.systemPrompt}</pre>
          </div>
        ) : (
          <div className="prompt-box-content collapsed" onClick={() => setIsExpanded(true)}>
            <pre className="prompt-pre">
              {proposal.systemPrompt?.slice(0, 180)}...
            </pre>
            <span className="click-to-expand">Clique para visualizar prompt completo</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="proposal-actions">
        {status === 'pending' ? (
          <>
            {onOpenModal && (
              <button
                type="button"
                className="btn-review-modal"
                onClick={() => onOpenModal(proposal)}
                title="Abrir modal para comparar e revisar detalhadamente"
              >
                <Eye size={15} />
                <span>Revisar no Modal</span>
              </button>
            )}

            <button
              type="button"
              className="btn-approve-proposal"
              onClick={handleApproveClick}
              disabled={isApproving}
              title="Aprovar e aplicar imediatamente às instruções do agente"
            >
              {isApproving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Aplicando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 size={15} />
                  <span>Aprovar Alteração</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="btn-reject-proposal"
              onClick={handleRejectClick}
              disabled={isApproving}
              title="Rejeitar proposta e manter prompt atual"
            >
              <XCircle size={15} />
              <span>Descartar</span>
            </button>
          </>
        ) : status === 'approved' ? (
          <div className="proposal-feedback success">
            <CheckCircle2 size={16} />
            <span>
              Alterações aprovadas e salvas com sucesso! O agente já está respondendo com as novas diretrizes.
            </span>
          </div>
        ) : (
          <div className="proposal-feedback neutral">
            <AlertCircle size={16} />
            <span>Proposta descartada pelo usuário. O prompt original foi mantido.</span>
          </div>
        )}
      </div>
    </div>
  );
}
