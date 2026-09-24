'use client';

import React, { useState } from 'react';
import { Download, Sparkles, ZoomIn, X, Image as ImageIcon } from 'lucide-react';

interface ImageViewerWidgetProps {
  src: string;
  alt?: string;
  title?: string;
}

export function ImageViewerWidget({ src, alt, title }: ImageViewerWidgetProps) {
  const [loaded, setLoaded] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // Extrai prompt se for uma URL do pollinations
  let extractedPrompt = alt || title || '';
  if (src.includes('pollinations.ai/prompt/')) {
    try {
      const match = src.match(/pollinations\.ai\/prompt\/([^?]+)/);
      if (match && match[1]) {
        extractedPrompt = decodeURIComponent(match[1]).replace(/%20/g, ' ');
      }
    } catch (e) {}
  }

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setDownloading(true);
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imagem_ia_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Falha ao baixar imagem:', err);
      // Fallback: abrir em nova aba
      window.open(src, '_blank');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="genui-widget image-viewer-widget my-3">
      {/* Barra superior do Card de Imagem */}
      <div className="genui-widget-header py-2 px-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Sparkles size={13} className="text-amber-400" />
          <span>Ilustração Gerada por IA</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setIsZoomed(true)}
            className="table-action-btn text-xs py-1 px-2"
            title="Ampliar Imagem"
          >
            <ZoomIn size={12} />
            <span>Ampliar</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading}
            className="table-action-btn text-xs py-1 px-2"
            title="Baixar imagem em alta resolução"
          >
            <Download size={12} />
            <span>{downloading ? 'Baixando...' : 'Baixar'}</span>
          </button>
        </div>
      </div>

      {/* Container da Imagem */}
      <div
        className="image-viewer-body cursor-pointer relative"
        onClick={() => setIsZoomed(true)}
      >
        {!loaded && (
          <div className="image-loading-placeholder flex items-center justify-center p-12 text-slate-400 gap-2">
            <span className="mermaid-spinner" />
            <span className="text-xs">Renderizando imagem em alta resolução...</span>
          </div>
        )}

        <img
          src={src}
          alt={alt || 'Ilustração conceitual'}
          onLoad={() => setLoaded(true)}
          className={`image-viewer-img w-full max-h-[460px] object-contain transition-opacity duration-300 ${
            loaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
          }`}
        />
      </div>

      {/* Legenda / Prompt utilizado */}
      {extractedPrompt && (
        <div className="image-viewer-caption p-2.5 px-3 bg-slate-900/60 border-t border-slate-800 text-xs text-slate-300 flex items-start gap-2">
          <ImageIcon size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <span className="leading-relaxed">
            <strong>Conceito visual:</strong> {extractedPrompt}
          </span>
        </div>
      )}

      {/* Modal de Zoom */}
      {isZoomed && (
        <div
          className="modal-overlay"
          onClick={() => setIsZoomed(false)}
          style={{ zIndex: 100 }}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] p-2 flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsZoomed(false)}
              className="absolute top-4 right-4 bg-slate-900/80 hover:bg-slate-800 text-white p-2 rounded-full border border-slate-700 shadow-lg z-10"
              title="Fechar"
            >
              <X size={20} />
            </button>
            <img
              src={src}
              alt={alt || 'Zoom da ilustração'}
              className="max-w-full max-h-[85vh] rounded-lg shadow-2xl object-contain border border-slate-700"
            />
          </div>
        </div>
      )}
    </div>
  );
}
