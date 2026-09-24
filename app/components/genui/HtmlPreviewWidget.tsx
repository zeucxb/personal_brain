'use client';

import React, { useState, useRef } from 'react';
import { Eye, Code, Copy, Check, ExternalLink, RotateCcw, Maximize2 } from 'lucide-react';

interface HtmlPreviewWidgetProps {
  html: string;
  title?: string;
}

export function HtmlPreviewWidget({ html, title }: HtmlPreviewWidgetProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [copied, setCopied] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const cleanHtml = html.replace(/^```html\s*\n?/, '').replace(/\n?```\s*$/, '').trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenNewTab = () => {
    const blob = new Blob([cleanHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="genui-widget html-preview-widget my-4">
      {/* Header da Ferramenta HTML */}
      <div className="genui-widget-header">
        <div className="genui-header-title">
          <span className="text-amber-400 font-bold">🌐</span>
          <span>{title || 'Interface Web / HTML Interativa'}</span>
        </div>

        <div className="genui-header-actions">
          <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60 text-xs">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                viewMode === 'preview'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye size={12} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`px-2.5 py-1 rounded-md font-medium transition flex items-center gap-1.5 ${
                viewMode === 'code'
                  ? 'bg-slate-700 text-slate-200 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code size={12} />
              <span>Código</span>
            </button>
          </div>

          {viewMode === 'preview' && (
            <button
              type="button"
              onClick={handleRefresh}
              className="table-action-btn"
              title="Recarregar interface"
            >
              <RotateCcw size={13} />
            </button>
          )}

          <button
            type="button"
            onClick={handleOpenNewTab}
            className="table-action-btn"
            title="Abrir página completa em nova aba"
          >
            <ExternalLink size={13} />
            <span>Nova Aba</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className={`table-action-btn ${copied ? 'copied' : ''}`}
            title="Copiar código HTML"
          >
            {copied ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy size={13} />
                <span>Copiar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Conteúdo: Sandbox iframe ou Código */}
      <div className="html-preview-body">
        {viewMode === 'preview' ? (
          <div className="html-iframe-container">
            <iframe
              key={iframeKey}
              ref={iframeRef}
              srcDoc={cleanHtml}
              sandbox="allow-scripts allow-modals allow-forms"
              className="html-sandbox-iframe"
              title="HTML Sandbox Preview"
            />
          </div>
        ) : (
          <pre className="html-code-view">
            <code>{cleanHtml}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
