'use client';

import React, { useState, useMemo } from 'react';
import {
  Columns,
  AlignJustify,
  Plus,
  Minus,
  Copy,
  Check,
  ArrowRight,
  FileCode,
  Sparkles,
} from 'lucide-react';

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Computa o diff linha a linha entre dois textos utilizando o algoritmo LCS
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText ? oldText.split('\n') : [];
  const newLines = newText ? newText.split('\n') : [];

  const m = oldLines.length;
  const n = newLines.length;

  if (m === 0 && n === 0) return [];
  if (m === 0) {
    return newLines.map((line, idx) => ({
      type: 'added',
      content: line,
      newLineNumber: idx + 1,
    }));
  }
  if (n === 0) {
    return oldLines.map((line, idx) => ({
      type: 'removed',
      content: line,
      oldLineNumber: idx + 1,
    }));
  }

  // Matriz DP para Longest Common Subsequence (LCS)
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtracking para reconstruir o diff ordenado
  const backtrack: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      backtrack.push({
        type: 'unchanged',
        content: oldLines[i - 1],
        oldLineNumber: i,
        newLineNumber: j,
      });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      backtrack.push({
        type: 'removed',
        content: oldLines[i - 1],
        oldLineNumber: i,
      });
      i--;
    } else {
      backtrack.push({
        type: 'added',
        content: newLines[j - 1],
        newLineNumber: j,
      });
      j--;
    }
  }

  while (i > 0) {
    backtrack.push({
      type: 'removed',
      content: oldLines[i - 1],
      oldLineNumber: i,
    });
    i--;
  }

  while (j > 0) {
    backtrack.push({
      type: 'added',
      content: newLines[j - 1],
      newLineNumber: j,
    });
    j--;
  }

  return backtrack.reverse();
}

export interface PromptDiffViewerProps {
  oldPrompt: string;
  newPrompt: string;
  oldDescription?: string;
  newDescription?: string;
  targetName?: string;
  targetType?: 'agent' | 'skill';
}

export function PromptDiffViewer({
  oldPrompt,
  newPrompt,
  oldDescription,
  newDescription,
  targetName,
  targetType = 'agent',
}: PromptDiffViewerProps) {
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');
  const [copiedNew, setCopiedNew] = useState(false);
  const [copiedOld, setCopiedOld] = useState(false);

  // Computa o diff de linhas
  const diffLines = useMemo(() => computeLineDiff(oldPrompt, newPrompt), [oldPrompt, newPrompt]);

  // Estatísticas do Diff
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    let unchanged = 0;

    for (const line of diffLines) {
      if (line.type === 'added') added++;
      else if (line.type === 'removed') removed++;
      else unchanged++;
    }

    const charDiff = (newPrompt?.length || 0) - (oldPrompt?.length || 0);

    return { added, removed, unchanged, charDiff };
  }, [diffLines, oldPrompt, newPrompt]);

  const handleCopyNew = () => {
    navigator.clipboard.writeText(newPrompt);
    setCopiedNew(true);
    setTimeout(() => setCopiedNew(false), 2000);
  };

  const handleCopyOld = () => {
    navigator.clipboard.writeText(oldPrompt);
    setCopiedOld(true);
    setTimeout(() => setCopiedOld(false), 2000);
  };

  // Separação para a visualização Lado a Lado (Split)
  const splitRows = useMemo(() => {
    const rows: Array<{
      left?: { lineNumber: number; content: string; type: 'removed' | 'unchanged' };
      right?: { lineNumber: number; content: string; type: 'added' | 'unchanged' };
    }> = [];

    let leftLineNum = 1;
    let rightLineNum = 1;

    for (let k = 0; k < diffLines.length; k++) {
      const item = diffLines[k];
      if (item.type === 'unchanged') {
        rows.push({
          left: { lineNumber: leftLineNum++, content: item.content, type: 'unchanged' },
          right: { lineNumber: rightLineNum++, content: item.content, type: 'unchanged' },
        });
      } else if (item.type === 'removed') {
        // Verifica se a próxima linha é 'added' para parear no mesmo row visual
        const next = diffLines[k + 1];
        if (next && next.type === 'added') {
          rows.push({
            left: { lineNumber: leftLineNum++, content: item.content, type: 'removed' },
            right: { lineNumber: rightLineNum++, content: next.content, type: 'added' },
          });
          k++; // Consome o next
        } else {
          rows.push({
            left: { lineNumber: leftLineNum++, content: item.content, type: 'removed' },
          });
        }
      } else if (item.type === 'added') {
        rows.push({
          right: { lineNumber: rightLineNum++, content: item.content, type: 'added' },
        });
      }
    }

    return rows;
  }, [diffLines]);

  const hasDescChange = Boolean(
    newDescription &&
    oldDescription !== undefined &&
    newDescription.trim() !== oldDescription.trim()
  );

  return (
    <div className="prompt-diff-container">
      {/* Diff Controls & Stats Header */}
      <div className="diff-header-bar">
        <div className="diff-stats-group">
          <div className="diff-badge diff-badge-target">
            <Sparkles size={13} className="text-amber-400" />
            <span>Comparando Prompt {targetType === 'skill' ? 'da Skill' : 'do Agente'}: <strong>{targetName || 'Ativo'}</strong></span>
          </div>
          <div className="diff-badge diff-badge-added">
            <Plus size={12} />
            <span>+{stats.added} linhas</span>
          </div>
          <div className="diff-badge diff-badge-removed">
            <Minus size={12} />
            <span>-{stats.removed} linhas</span>
          </div>
          <div className="diff-badge diff-badge-chars">
            <span>
              {stats.charDiff >= 0 ? `+${stats.charDiff}` : stats.charDiff} caracteres
            </span>
          </div>
        </div>

        <div className="diff-controls-group">
          <div className="diff-view-mode-toggle">
            <button
              type="button"
              className={`btn-view-mode ${viewMode === 'split' ? 'active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Visualização Lado a Lado (Colunas)"
            >
              <Columns size={14} />
              <span>Lado a Lado</span>
            </button>
            <button
              type="button"
              className={`btn-view-mode ${viewMode === 'unified' ? 'active' : ''}`}
              onClick={() => setViewMode('unified')}
              title="Visualização Unificada (Linha por Linha)"
            >
              <AlignJustify size={14} />
              <span>Unificado</span>
            </button>
          </div>

          <button
            type="button"
            className="btn-copy-diff"
            onClick={handleCopyNew}
            title="Copiar novo prompt proposto"
          >
            {copiedNew ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            <span>{copiedNew ? 'Copiado!' : 'Copiar Novo'}</span>
          </button>
        </div>
      </div>

      {/* Description Diff if changed */}
      {hasDescChange && (
        <div className="diff-description-card">
          <div className="diff-description-title">
            <FileCode size={13} className="text-amber-400" />
            <span>Alteração na Descrição:</span>
          </div>
          <div className="diff-description-compare">
            <div className="desc-pane old">
              <span className="desc-pane-tag">Atual:</span>
              <p className="desc-pane-text">{oldDescription || 'Sem descrição prévia'}</p>
            </div>
            <div className="desc-arrow">
              <ArrowRight size={16} />
            </div>
            <div className="desc-pane new">
              <span className="desc-pane-tag">Proposta:</span>
              <p className="desc-pane-text">{newDescription}</p>
            </div>
          </div>
        </div>
      )}

      {/* Diff Code Area */}
      {viewMode === 'split' ? (
        /* ================= SIDE-BY-SIDE (SPLIT) VIEW ================= */
        <div className="diff-split-wrapper">
          <div className="diff-split-columns-header">
            <div className="split-col-header old-header">
              <div className="flex items-center gap-1.5">
                <span className="col-indicator red" />
                <span className="col-title">Prompt Atual (Antes)</span>
              </div>
              <span className="col-meta">{oldPrompt ? oldPrompt.split('\n').length : 0} linhas • {oldPrompt?.length || 0} carac.</span>
            </div>
            <div className="split-col-header new-header">
              <div className="flex items-center gap-1.5">
                <span className="col-indicator green" />
                <span className="col-title">Novo Prompt Proposto (Depois)</span>
              </div>
              <span className="col-meta">{newPrompt ? newPrompt.split('\n').length : 0} linhas • {newPrompt?.length || 0} carac.</span>
            </div>
          </div>

          <div className="diff-split-table-body">
            <table className="diff-split-table">
              <tbody>
                {splitRows.map((row, idx) => (
                  <tr key={idx} className="diff-split-row">
                    {/* Left Pane (Old) */}
                    <td
                      className={`diff-cell-num old-num ${
                        row.left?.type === 'removed' ? 'cell-removed' : ''
                      }`}
                    >
                      {row.left?.lineNumber ?? ''}
                    </td>
                    <td
                      className={`diff-cell-content old-content ${
                        row.left?.type === 'removed' ? 'cell-removed' : ''
                      }`}
                    >
                      <pre className="diff-pre-line">{row.left?.content ?? ''}</pre>
                    </td>

                    {/* Right Pane (New) */}
                    <td
                      className={`diff-cell-num new-num ${
                        row.right?.type === 'added' ? 'cell-added' : ''
                      }`}
                    >
                      {row.right?.lineNumber ?? ''}
                    </td>
                    <td
                      className={`diff-cell-content new-content ${
                        row.right?.type === 'added' ? 'cell-added' : ''
                      }`}
                    >
                      <pre className="diff-pre-line">{row.right?.content ?? ''}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ================= UNIFIED (INLINE) VIEW ================= */
        <div className="diff-unified-wrapper">
          <div className="diff-unified-header">
            <span className="unified-legend">
              <span className="legend-chip red">- Linha Removida</span>
              <span className="legend-chip green">+ Linha Adicionada / Modificada</span>
            </span>
            <span className="unified-meta">Visualização unificada de alterações</span>
          </div>

          <div className="diff-unified-body">
            <table className="diff-unified-table">
              <tbody>
                {diffLines.map((line, idx) => (
                  <tr
                    key={idx}
                    className={`diff-unified-row ${
                      line.type === 'added'
                        ? 'row-added'
                        : line.type === 'removed'
                        ? 'row-removed'
                        : 'row-unchanged'
                    }`}
                  >
                    <td className="diff-col-gutter old-gutter">
                      {line.oldLineNumber ?? ''}
                    </td>
                    <td className="diff-col-gutter new-gutter">
                      {line.newLineNumber ?? ''}
                    </td>
                    <td className="diff-col-sign">
                      {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                    </td>
                    <td className="diff-col-text">
                      <pre className="diff-pre-line">{line.content}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
