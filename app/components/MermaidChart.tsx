'use client';

import React, { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { Eye, Code, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';

interface MermaidChartProps {
  chart: string;
}

/**
 * Auto-corrige erros comuns gerados por LLMs em sintaxe Mermaid
 */
function sanitizeMermaidCode(raw: string): string {
  if (!raw) return '';
  let text = raw.trim();

  // Remove marcações de código markdown se o modelo tiver duplicado
  text = text.replace(/^```(?:mermaid)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

  const lines = text.split('\n');
  const firstLine = lines[0].trim().toLowerCase();

  // 1. Correções para MINDMAP
  if (firstLine.startsWith('mindmap')) {
    const fixedLines = lines.map((line, idx) => {
      if (idx === 0) return line;

      // Preserva indentação original (crucial para o parser hierárquico do mindmap)
      const leadingSpaces = line.match(/^(\s*)/)?.[1] || '';
      let content = line.slice(leadingSpaces.length);

      if (!content.trim()) return '';

      // Preserva definição do nó raiz com formato root((...)) ou root[...]
      if (/^root\s*[\(\[\{]/.test(content)) {
        return leadingSpaces + content;
      }

      // Substitui dois-pontos soltos (ex: "Eixo 1: Conceito" -> "Eixo 1 - Conceito")
      // No Mermaid mindmap, ":" é reservado para ::icon() ou :::classes
      content = content.replace(/(?<!:):(?!:)/g, ' - ');

      // Remove parênteses soltos se não for uma forma deliberada de nó
      if (!/^[\(\[\{].*[\)\]\}]$/.test(content.trim())) {
        content = content.replace(/[\(\)]/g, '');
      }

      // Limpa múltiplos espaços no conteúdo sem afetar a indentação
      content = content.replace(/\s{2,}/g, ' ').trimEnd();

      return leadingSpaces + content;
    });

    return fixedLines.join('\n');
  }

  // 2. Correções para GRAPH e FLOWCHART
  if (firstLine.startsWith('graph') || firstLine.startsWith('flowchart')) {
    // Converte setas unicode para a sintaxe padrão Mermaid
    text = text.replace(/➔|➜|➝/g, '-->');
    text = text.replace(/->(?!>)/g, '-->');

    // Coloca aspas em rótulos de nós que contenham parênteses, dois-pontos ou barras: A[Texto (Info)] -> A["Texto (Info)"]
    text = text.replace(/(\w+)\s*\[([^\"\]\n]*[\(\)\&:\/][^\"\]\n]*)\]/g, (match, id, label) => {
      return `${id}["${label.replace(/"/g, "'")}"]`;
    });

    // Remove negrito markdown dentro dos rótulos dos nós
    text = text.replace(/\[\s*\*\*([^\*]+)\*\*\s*\]/g, '["$1"]');
  }

  return text;
}

/**
 * Remove qualquer elemento ou SVG temporário que o Mermaid injete no document.body ao falhar
 */
function cleanMermaidRogueElements(containerId?: string) {
  if (typeof document === 'undefined') return;

  if (containerId) {
    const el = document.getElementById(containerId) || document.getElementById(`d${containerId}`);
    if (el && el.parentNode === document.body) {
      el.remove();
    }
  }

  // Remove qualquer nó residual com id dmermaid_ inserido diretamente no body
  document.querySelectorAll('body > [id^="dmermaid_"], body > [id^="mermaid_"]').forEach((node) => {
    node.remove();
  });
}

export function MermaidChart({ chart }: MermaidChartProps) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'inherit',
        suppressErrorRendering: true,
      });

      if (typeof mermaid.setParseErrorHandler === 'function') {
        mermaid.setParseErrorHandler(() => {
          // Suprime injeção de erro no DOM
        });
      }
    } catch (e) {
      // Ignora erro de reinicialização
    }

    let isMounted = true;
    const sanitizedChart = sanitizeMermaidCode(chart);
    const chartId = `mermaid_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const renderChart = async () => {
      if (!sanitizedChart) return;

      try {
        // Pré-validação com mermaid.parse se disponível
        if (typeof mermaid.parse === 'function') {
          try {
            await mermaid.parse(sanitizedChart);
          } catch (parseErr: any) {
            cleanMermaidRogueElements(chartId);
            if (isMounted) {
              setError(parseErr?.message || 'Sintaxe do diagrama incompleta ou inválida.');
              setSvg('');
            }
            return;
          }
        }

        const { svg: renderedSvg } = await mermaid.render(chartId, sanitizedChart);
        cleanMermaidRogueElements(chartId);

        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        cleanMermaidRogueElements(chartId);
        if (isMounted) {
          setError(err?.message || 'Não foi possível renderizar a árvore visual automaticamente.');
          setSvg('');
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
      cleanMermaidRogueElements(chartId);
    };
  }, [chart]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mermaid-container-card my-3">
      <div className="mermaid-header">
        <span className="mermaid-title">
          🧠 Visualização / Mapa Mental
        </span>
        <div className="mermaid-actions">
          <button
            type="button"
            onClick={() => setShowCode(!showCode)}
            className="mermaid-btn"
            title={showCode ? 'Ver Diagrama Visual' : 'Ver Código Mermaid'}
          >
            {showCode ? <Eye size={13} /> : <Code size={13} />}
            <span>{showCode ? 'Visual' : 'Código'}</span>
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="mermaid-btn"
            title="Copiar Código"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      </div>

      <div className="mermaid-body">
        {showCode ? (
          <pre className="mermaid-code-fallback">
            <code>{chart}</code>
          </pre>
        ) : error ? (
          <div className="mermaid-error-fallback p-3">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-medium mb-2">
              <AlertTriangle size={15} />
              <span>Diagrama em formato textual (visualização gráfica indisponível)</span>
            </div>
            <pre className="mermaid-code-fallback">
              <code>{chart}</code>
            </pre>
          </div>
        ) : svg ? (
          <div
            className="mermaid-rendered-svg"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div className="mermaid-loading">
            <span className="mermaid-spinner" />
            <span>Processando visualização...</span>
          </div>
        )}
      </div>
    </div>
  );
}
