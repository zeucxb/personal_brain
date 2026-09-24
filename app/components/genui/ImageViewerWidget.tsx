'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Download,
  Sparkles,
  ZoomIn,
  ZoomOut,
  X,
  Image as ImageIcon,
  Check,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Copy,
  Layers,
  Ratio,
} from 'lucide-react';
import {
  imageEngine,
  parseImageUrl,
  STYLE_PRESETS,
  ASPECT_RATIOS,
  ImageStylePreset,
  ImageAspectRatio,
  createFallbackVectorSvg,
  convertSvgToDataUrl,
} from '../../../lib/tools/engines/imageEngine';

export interface ImageViewerWidgetProps {
  src: string;
  alt?: string;
  title?: string;
  stylePreset?: ImageStylePreset;
  aspectRatio?: ImageAspectRatio;
  width?: number;
  height?: number;
  className?: string;
}

export function ImageViewerWidget({
  src,
  alt,
  title,
  stylePreset: propStylePreset,
  aspectRatio: propAspectRatio,
  width: propWidth,
  height: propHeight,
  className = '',
}: ImageViewerWidgetProps) {
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomScale, setZoomScale] = useState(1);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Parse prompt and metadata from URL if it's a Pollinations or parameterized URL
  const parsedMeta = useMemo(() => parseImageUrl(src), [src]);

  // Determine active visual preset
  const activePreset: ImageStylePreset = useMemo(() => {
    if (propStylePreset && STYLE_PRESETS[propStylePreset]) {
      return propStylePreset;
    }
    if (parsedMeta?.detectedPreset) {
      return parsedMeta.detectedPreset;
    }
    return 'digital_art';
  }, [propStylePreset, parsedMeta]);

  const presetConfig = STYLE_PRESETS[activePreset] || STYLE_PRESETS.digital_art;

  // Determine active aspect ratio
  const activeRatio: ImageAspectRatio = useMemo(() => {
    if (propAspectRatio && ASPECT_RATIOS[propAspectRatio]) {
      return propAspectRatio;
    }
    if (parsedMeta?.aspectRatio) {
      return parsedMeta.aspectRatio;
    }
    return presetConfig.recommendedAspectRatio || '16:9';
  }, [propAspectRatio, parsedMeta, presetConfig]);

  const ratioConfig = ASPECT_RATIOS[activeRatio] || ASPECT_RATIOS['16:9'];

  // Dimensions
  const effectiveWidth = propWidth || parsedMeta?.width || ratioConfig.width;
  const effectiveHeight = propHeight || parsedMeta?.height || ratioConfig.height;

  // Prompt / Caption resolution
  const promptText = useMemo(() => {
    if (parsedMeta?.cleanPrompt) return parsedMeta.cleanPrompt;
    if (alt && alt.trim()) return alt.trim();
    if (title && title.trim()) return title.trim();
    return '';
  }, [parsedMeta, alt, title]);

  // Esc key listener to close zoom modal
  useEffect(() => {
    if (!isZoomed) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomed(false);
        setZoomScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isZoomed]);

  // Download handler with progress and feedback
  const handleDownload = useCallback(
    async (e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      if (downloadStatus === 'downloading') return;

      try {
        setDownloadStatus('downloading');
        const filename = `ia_${activePreset}_${Date.now()}.jpg`;
        await imageEngine.downloadImage(src, filename);
        setDownloadStatus('success');

        setTimeout(() => {
          setDownloadStatus('idle');
        }, 2200);
      } catch (err) {
        console.warn('Falha no download via blob:', err);
        setDownloadStatus('error');
        setTimeout(() => {
          setDownloadStatus('idle');
        }, 2500);
      }
    },
    [src, activePreset, downloadStatus]
  );

  // Copy prompt handler
  const handleCopyPrompt = useCallback(() => {
    if (!promptText) return;
    navigator.clipboard.writeText(promptText);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  }, [promptText]);

  // Zoom controls
  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomScale((prev) => Math.min(2.5, +(prev + 0.25).toFixed(2)));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomScale((prev) => Math.max(1, +(prev - 0.25).toFixed(2)));
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoomScale(1);
  };

  const handleToggleZoomScale = () => {
    setZoomScale((prev) => (prev === 1 ? 1.75 : 1));
  };

  // Fallback vector SVG if remote image fails
  const fallbackVectorUrl = useMemo(() => {
    const titleText = title || alt || 'Ilustração Visual IA';
    const svgCode = createFallbackVectorSvg(
      titleText,
      'Renderização local vetorial (imagem externa temporariamente offline)',
      presetConfig.englishLabel
    );
    return convertSvgToDataUrl(svgCode);
  }, [title, alt, presetConfig]);

  return (
    <div className={`genui-widget image-viewer-widget my-3 ${className}`}>
      {/* Barra superior do Card de Imagem */}
      <div className="genui-widget-header py-2 px-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Sparkles size={13} className="text-amber-400" />
          <span>{title || 'Ilustração Gerada por IA'}</span>
        </div>

        {/* Badges de Preset e Aspect Ratio */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Badge de Estilo Visual */}
          <span
            className="image-preset-badge"
            style={{
              backgroundColor: presetConfig.badgeColor.bg,
              color: presetConfig.badgeColor.text,
              borderColor: presetConfig.badgeColor.border,
            }}
            title={`Estilo visual: ${presetConfig.description}`}
          >
            <span>{presetConfig.icon}</span>
            <span>{presetConfig.label}</span>
          </span>

          {/* Badge de Aspect Ratio */}
          <span
            className="image-ratio-badge"
            title={`Proporção: ${ratioConfig.label} (${effectiveWidth}x${effectiveHeight})`}
          >
            <Ratio size={11} className="text-slate-400" />
            <span>{activeRatio}</span>
          </span>

          {/* Dimensões em pixels */}
          {effectiveWidth && effectiveHeight && (
            <span
              className="image-dimensions-badge hidden sm:inline-flex"
              title="Resolução da imagem"
            >
              {effectiveWidth}×{effectiveHeight}
            </span>
          )}
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setIsZoomed(true);
              setZoomScale(1);
            }}
            className="table-action-btn text-xs py-1 px-2.5"
            title="Ampliar visualização em tela cheia"
          >
            <ZoomIn size={12} />
            <span>Ampliar</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadStatus === 'downloading'}
            className={`image-download-btn ${downloadStatus}`}
            title="Baixar imagem em alta resolução"
          >
            {downloadStatus === 'downloading' && (
              <>
                <RefreshCw size={12} className="spin text-blue-400" />
                <span>Baixando...</span>
              </>
            )}
            {downloadStatus === 'success' && (
              <>
                <Check size={12} className="text-emerald-400" />
                <span>Salvo!</span>
              </>
            )}
            {downloadStatus === 'error' && (
              <>
                <AlertCircle size={12} className="text-rose-400" />
                <span>Abrindo...</span>
              </>
            )}
            {downloadStatus === 'idle' && (
              <>
                <Download size={12} />
                <span>Baixar</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Container da Imagem */}
      <div
        className="image-viewer-body cursor-pointer relative select-none"
        onClick={() => {
          setIsZoomed(true);
          setZoomScale(1);
        }}
        title="Clique para ampliar"
      >
        {!loaded && !hasError && (
          <div className="image-loading-placeholder flex items-center justify-center p-12 text-slate-400 gap-2">
            <span className="mermaid-spinner" />
            <span className="text-xs">Renderizando imagem em alta resolução...</span>
          </div>
        )}

        {hasError ? (
          <div className="flex flex-col items-center justify-center p-4 w-full">
            <img
              src={fallbackVectorUrl}
              alt={alt || 'Fallback vetorial local'}
              className="w-full max-h-[460px] object-contain rounded-lg"
            />
            <div className="mt-2 text-xs text-slate-400 flex items-center gap-2">
              <AlertCircle size={12} className="text-amber-400" />
              <span>Exibindo renderização vetorial local como fallback.</span>
            </div>
          </div>
        ) : (
          <img
            src={src}
            alt={alt || 'Ilustração conceitual'}
            onLoad={() => setLoaded(true)}
            onError={() => {
              setHasError(true);
              setLoaded(true);
            }}
            className={`image-viewer-img w-full max-h-[460px] object-contain transition-opacity duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
            }`}
          />
        )}
      </div>

      {/* Legenda / Prompt Conceitual */}
      {promptText && (
        <div className="image-viewer-caption p-2.5 px-3 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-300 flex items-start justify-between gap-2">
          <div className="flex items-start gap-2 flex-1 overflow-hidden">
            <ImageIcon size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="leading-relaxed break-words">
              <strong className="text-slate-100">Conceito visual:</strong> {promptText}
            </span>
          </div>
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="text-slate-400 hover:text-slate-200 p-1 rounded hover:bg-slate-800 shrink-0 transition"
            title="Copiar descrição do conceito"
          >
            {copiedPrompt ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
        </div>
      )}

      {/* Modal de Zoom Avançado */}
      {isZoomed && (
        <div
          className="image-zoom-overlay"
          onClick={() => {
            setIsZoomed(false);
            setZoomScale(1);
          }}
        >
          {/* Header da Barra de Ferramentas do Modal */}
          <div className="image-zoom-header" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 overflow-hidden">
              <span
                className="image-preset-badge"
                style={{
                  backgroundColor: presetConfig.badgeColor.bg,
                  color: presetConfig.badgeColor.text,
                  borderColor: presetConfig.badgeColor.border,
                }}
              >
                <span>{presetConfig.icon}</span>
                <span>{presetConfig.label}</span>
              </span>
              <span className="image-ratio-badge">
                <Ratio size={11} className="text-slate-400" />
                <span>{activeRatio}</span>
              </span>
              <span className="image-dimensions-badge">
                {effectiveWidth}×{effectiveHeight}
              </span>
            </div>

            {/* Controles de Escala / Zoom */}
            <div className="image-zoom-controls">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomScale <= 1}
                className="image-zoom-control-btn"
                title="Diminuir zoom (-)"
              >
                <ZoomOut size={14} />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="image-zoom-control-btn px-2 text-xs"
                title="Redefinir escala para 100%"
              >
                {Math.round(zoomScale * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomScale >= 2.5}
                className="image-zoom-control-btn"
                title="Aumentar zoom (+)"
              >
                <ZoomIn size={14} />
              </button>
            </div>

            {/* Ações da Imagem */}
            <div className="flex items-center gap-2">
              <a
                href={hasError ? fallbackVectorUrl : src}
                target="_blank"
                rel="noopener noreferrer"
                className="image-zoom-control-btn border border-slate-700/60 rounded px-2 gap-1.5"
                title="Abrir imagem original em nova aba"
              >
                <ExternalLink size={13} />
                <span className="hidden sm:inline">Nova Aba</span>
              </a>

              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadStatus === 'downloading'}
                className={`image-download-btn ${downloadStatus}`}
                title="Baixar imagem"
              >
                {downloadStatus === 'downloading' ? (
                  <>
                    <RefreshCw size={12} className="spin text-blue-400" />
                    <span>Baixando...</span>
                  </>
                ) : downloadStatus === 'success' ? (
                  <>
                    <Check size={12} className="text-emerald-400" />
                    <span>Salvo!</span>
                  </>
                ) : (
                  <>
                    <Download size={12} />
                    <span>Baixar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsZoomed(false);
                  setZoomScale(1);
                }}
                className="image-zoom-control-btn text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800"
                title="Fechar (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Viewport de Exibição da Imagem com Zoom */}
          <div
            className="image-zoom-viewport"
            onClick={() => {
              setIsZoomed(false);
              setZoomScale(1);
            }}
          >
            <img
              src={hasError ? fallbackVectorUrl : src}
              alt={alt || 'Visualização ampliada'}
              onClick={(e) => {
                e.stopPropagation();
                handleToggleZoomScale();
              }}
              style={{
                transform: `scale(${zoomScale})`,
                cursor: zoomScale > 1 ? 'zoom-out' : 'zoom-in',
              }}
              className="image-zoom-img"
              title="Clique duas vezes para alternar zoom rápido"
            />
          </div>

          {/* Rodapé com Conceito Visual e Atalhos */}
          {promptText && (
            <div className="image-zoom-caption" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 flex-1 overflow-hidden">
                <Layers size={13} className="text-amber-400 shrink-0" />
                <span className="truncate text-slate-300">
                  <strong className="text-slate-100">Conceito:</strong> {promptText}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className="table-action-btn text-xs py-1 px-2"
                  title="Copiar prompt"
                >
                  {copiedPrompt ? (
                    <>
                      <Check size={11} className="text-emerald-400" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copiar Conceito</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
