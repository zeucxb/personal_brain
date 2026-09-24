'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Eye, Code, Copy, Check, ExternalLink, RotateCcw } from 'lucide-react';
import {
  htmlSandboxEngine,
  DeviceViewport,
  VIEWPORT_LIST,
  VIEWPORT_CONFIGS,
  stripCodeFences,
  extractHtmlTitle,
} from '@/lib/tools/engines/htmlEngine';

export interface HtmlPreviewWidgetProps {
  html: string;
  title?: string;
  initialViewport?: DeviceViewport;
}

export function HtmlPreviewWidget({
  html,
  title,
  initialViewport = 'desktop',
}: HtmlPreviewWidgetProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const [viewport, setViewport] = useState<DeviceViewport>(initialViewport);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Strip markdown code fences for display and sandboxing
  const cleanCode = useMemo(() => stripCodeFences(html), [html]);

  // Derive title from prop or extracted from HTML <title>
  const displayTitle = useMemo(() => {
    return title?.trim() || extractHtmlTitle(cleanCode) || 'Interface Web / HTML Interativa';
  }, [title, cleanCode]);

  // Current viewport specification
  const currentViewportConfig = VIEWPORT_CONFIGS[viewport] || VIEWPORT_CONFIGS.desktop;

  // Prepared sandboxed HTML document with responsive viewport and Tailwind CDN
  const sandboxedHtml = useMemo(() => {
    return htmlSandboxEngine.prepareSandboxHtml(html, {
      title: displayTitle,
      viewport,
      injectTailwind: true,
      enableScripts: true,
    });
  }, [html, displayTitle, viewport]);

  const handleCopy = () => {
    navigator.clipboard.writeText(cleanCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenNewTab = () => {
    htmlSandboxEngine.openInFullscreenTab(html, displayTitle);
  };

  const handleDownload = () => {
    const filename = `${displayTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}.html`;
    htmlSandboxEngine.downloadHtmlFile(html, filename);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  const handleRefresh = () => {
    setIframeKey((prev) => prev + 1);
  };

  return (
    <div className="genui-widget html-preview-widget my-4">
      {/* Header do Widget HTML Sandbox */}
      <div className="genui-widget-header">
        <div className="genui-header-title">
          <span className="text-amber-400 font-bold text-base">🌐</span>
          <span>{displayTitle}</span>
          {viewMode === 'preview' && (
            <span className="html-viewport-badge">
              {currentViewportConfig.width === '100%' ? '100% Full' : currentViewportConfig.width}
            </span>
          )}
        </div>

        <div className="genui-header-actions">
          {/* Alternador de Modo: Preview vs Código */}
          <div className="html-btn-group">
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`html-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              title="Modo de visualização interativa"
            >
              <Eye size={12} />
              <span>Preview</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('code')}
              className={`html-mode-btn ${viewMode === 'code' ? 'active' : ''}`}
              title="Ver código fonte HTML"
            >
              <Code size={12} />
              <span>Código</span>
            </button>
          </div>

          {/* Alternador de Viewport Multi-dispositivo (apenas em Preview) */}
          {viewMode === 'preview' && (
            <div className="html-btn-group html-viewport-group">
              {VIEWPORT_LIST.map((cfg) => {
                const isActive = viewport === cfg.id;
                return (
                  <button
                    key={cfg.id}
                    type="button"
                    onClick={() => setViewport(cfg.id)}
                    className={`html-viewport-btn ${isActive ? 'active' : ''}`}
                    title={`Simular tela ${cfg.label} (${cfg.width})`}
                  >
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Botão Recarregar */}
          {viewMode === 'preview' && (
            <button
              type="button"
              onClick={handleRefresh}
              className="table-action-btn"
              title="Recarregar interface"
              aria-label="Recarregar interface"
            >
              <RotateCcw size={13} />
            </button>
          )}

          {/* Botão Abrir em Nova Aba */}
          <button
            type="button"
            onClick={handleOpenNewTab}
            className="table-action-btn"
            title="Abrir em tela cheia em nova aba via Blob URL"
          >
            <ExternalLink size={13} />
            <span>Nova Aba</span>
          </button>

          {/* Botão Baixar .html */}
          <button
            type="button"
            onClick={handleDownload}
            className={`table-action-btn ${downloaded ? 'downloaded' : ''}`}
            title="Baixar arquivo .html completo"
          >
            {downloaded ? (
              <>
                <Check size={13} className="text-emerald-400" />
                <span>Baixado!</span>
              </>
            ) : (
              <>
                <span>📥</span>
                <span>Baixar .html</span>
              </>
            )}
          </button>

          {/* Botão Copiar */}
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

      {/* Conteúdo: Sandbox iframe centrado em modo escuro ou Código */}
      <div className="html-preview-body">
        {viewMode === 'preview' ? (
          <div className={`html-sandbox-stage stage-${viewport}`}>
            <div
              className={`html-device-wrapper viewport-${viewport}`}
              style={{
                width: currentViewportConfig.width,
              }}
            >
              {viewport !== 'desktop' && (
                <div className="html-device-statusbar">
                  <span className="html-device-pill" />
                  <span className="html-device-info">
                    {currentViewportConfig.label} • {currentViewportConfig.width}
                  </span>
                </div>
              )}
              <iframe
                key={iframeKey}
                ref={iframeRef}
                srcDoc={sandboxedHtml}
                sandbox="allow-scripts allow-modals allow-forms allow-popups"
                className="html-sandbox-iframe"
                title={displayTitle}
              />
            </div>
          </div>
        ) : (
          <pre className="html-code-view">
            <code>{cleanCode}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
