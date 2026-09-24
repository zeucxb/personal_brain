'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { Eye, Code, Copy, Check } from 'lucide-react';

interface MermaidChartProps {
  chart: string;
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
      });
    } catch (e) {}

    let isMounted = true;
    const renderChart = async () => {
      try {
        const id = `mermaid_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const { svg: renderedSvg } = await mermaid.render(id, chart.trim());
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || 'Aguardando finalização do diagrama...');
          setSvg('');
        }
      }
    };

    renderChart();

    return () => {
      isMounted = false;
    };
  }, [chart]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mermaid-container-card">
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
        {showCode || error ? (
          <pre className="mermaid-code-fallback">
            <code>{chart}</code>
          </pre>
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
