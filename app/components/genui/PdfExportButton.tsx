'use client';

import React, { useState } from 'react';
import {
  Download,
  Printer,
  Sliders,
  X,
  Check,
  BookOpen,
  Sparkles,
  AlignLeft,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  pdfEngine,
  PdfDocumentOptions,
} from '@/lib/tools/engines/pdfEngine';

export interface PdfExportButtonProps {
  content: string;
  materia?: string;
  title?: string;
  author?: string;
  defaultTheme?: 'academic' | 'modern' | 'minimal';
  defaultPaperSize?: 'A4' | 'Letter';
  className?: string;
}

export function PdfExportButton({
  content,
  materia = 'Geral',
  title,
  author = 'Acervo Acadêmico / RAG Studio',
  defaultTheme = 'academic',
  defaultPaperSize = 'A4',
  className = '',
}: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showOptionsModal, setShowOptionsModal] = useState(false);

  // Form options state
  const [theme, setTheme] = useState<'academic' | 'modern' | 'minimal'>(defaultTheme);
  const [paperSize, setPaperSize] = useState<'A4' | 'Letter'>(defaultPaperSize);
  const [docTitle, setDocTitle] = useState(title || `Apostila - ${materia}`);
  const [docMateria, setDocMateria] = useState(materia);
  const [docAuthor, setDocAuthor] = useState(author);
  const [includeHeader, setIncludeHeader] = useState(true);
  const [includeFooter, setIncludeFooter] = useState(true);
  const [showCitations, setShowCitations] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const getCompilationOptions = (): PdfDocumentOptions => ({
    title: docTitle.trim() || undefined,
    materia: docMateria.trim() || undefined,
    author: docAuthor.trim() || undefined,
    theme,
    paperSize,
    includeHeader,
    includeFooter,
    showCitations,
  });

  const handleQuickPrint = () => {
    setExporting(true);
    setPopupBlocked(false);

    try {
      const options = getCompilationOptions();
      const success = pdfEngine.triggerPrint(content, options);

      if (!success) {
        setPopupBlocked(true);
        setShowOptionsModal(true);
      } else {
        setFeedbackSuccess('Janela de impressão aberta!');
        setTimeout(() => setFeedbackSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Falha ao acionar motor de PDF:', err);
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  };

  const handlePrintFromModal = () => {
    setExporting(true);
    setPopupBlocked(false);

    try {
      const options = getCompilationOptions();
      const success = pdfEngine.triggerPrint(content, options);

      if (!success) {
        setPopupBlocked(true);
      } else {
        setFeedbackSuccess('Janela de impressão aberta!');
        setShowOptionsModal(false);
        setTimeout(() => setFeedbackSuccess(null), 3000);
      }
    } catch (err) {
      console.error('Erro na impressão:', err);
    } finally {
      setTimeout(() => setExporting(false), 800);
    }
  };

  const handleDownloadHtml = () => {
    setDownloading(true);
    try {
      const options = getCompilationOptions();
      pdfEngine.triggerBrowserDownload(content, options);
      setFeedbackSuccess('Arquivo compilado e baixado!');
      setShowOptionsModal(false);
      setTimeout(() => setFeedbackSuccess(null), 3000);
    } catch (err) {
      console.error('Falha ao baixar arquivo HTML:', err);
    } finally {
      setTimeout(() => setDownloading(false), 600);
    }
  };

  return (
    <>
      {/* Botão de Exportação com Acesso Rápido e Gatilho de Opções */}
      <div className={`pdf-export-container inline-flex items-center rounded-md border border-slate-700/80 bg-slate-800/90 shadow-sm ${className}`}>
        <button
          type="button"
          onClick={handleQuickPrint}
          disabled={exporting}
          className="table-action-btn border-0 rounded-l-md rounded-r-none px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-slate-200 hover:text-white hover:bg-slate-700/80 transition-colors"
          title="Imprimir ou salvar diretamente como PDF com configurações rápidas"
        >
          {exporting ? (
            <div className="w-3 h-3 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
          ) : feedbackSuccess ? (
            <Check size={13} className="text-emerald-400" />
          ) : (
            <Download size={13} className="text-amber-400" />
          )}
          <span className="font-medium">
            {exporting ? 'Gerando...' : feedbackSuccess ? 'Pronto!' : 'Baixar PDF'}
          </span>
        </button>

        <div className="h-4 w-[1px] bg-slate-700/80" />

        <button
          type="button"
          onClick={() => setShowOptionsModal(true)}
          className="table-action-btn border-0 rounded-r-md rounded-l-none px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 transition-colors"
          title="Opções de diagramação, formato (A4/Letter) e temas"
          aria-label="Abrir configurações de exportação de PDF"
        >
          <Sliders size={12} />
        </button>
      </div>

      {/* Modal de Configuração Avançada de Exportação */}
      {showOptionsModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
          onClick={() => setShowOptionsModal(false)}
        >
          <div
            className="relative w-full max-w-lg bg-slate-900 border border-slate-700/90 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do Modal */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Printer size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">Configurações de Exportação PDF</h3>
                  <p className="text-xs text-slate-400">Diagramação editorial, formato e opções de página</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowOptionsModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                title="Fechar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Aviso se o pop-up estiver bloqueado */}
            {popupBlocked && (
              <div className="mx-5 mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-400" />
                <div className="leading-relaxed">
                  <strong>Pop-up bloqueado pelo navegador:</strong> Permita pop-ups neste site para abrir o diálogo de impressão nativo, ou use a opção <strong>Baixar Arquivo HTML</strong> abaixo.
                </div>
              </div>
            )}

            {/* Corpo das Opções */}
            <div className="px-5 py-4 space-y-4 max-h-[72vh] overflow-y-auto">
              {/* Seleção de Tema */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Tema Editorial & Tipografia
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {/* Tema Acadêmico */}
                  <button
                    type="button"
                    onClick={() => setTheme('academic')}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                      theme === 'academic'
                        ? 'bg-amber-500/15 border-amber-500/60 text-slate-100 ring-1 ring-amber-500/50'
                        : 'bg-slate-800/60 border-slate-700/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-1.5">
                        <BookOpen size={14} className={theme === 'academic' ? 'text-amber-400' : 'text-slate-400'} />
                        <span className="text-xs font-bold">Acadêmico</span>
                      </div>
                      {theme === 'academic' && <Check size={12} className="text-amber-400" />}
                    </div>
                    <span className="text-[10.5px] leading-tight text-slate-400">
                      Serif clássico, cabeçalho universitário e bordas ABNT.
                    </span>
                  </button>

                  {/* Tema Moderno */}
                  <button
                    type="button"
                    onClick={() => setTheme('modern')}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                      theme === 'modern'
                        ? 'bg-blue-500/15 border-blue-500/60 text-slate-100 ring-1 ring-blue-500/50'
                        : 'bg-slate-800/60 border-slate-700/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={14} className={theme === 'modern' ? 'text-blue-400' : 'text-slate-400'} />
                        <span className="text-xs font-bold">Moderno</span>
                      </div>
                      {theme === 'modern' && <Check size={12} className="text-blue-400" />}
                    </div>
                    <span className="text-[10.5px] leading-tight text-slate-400">
                      Sans-serif Inter, acentos azuis e cards estilizados.
                    </span>
                  </button>

                  {/* Tema Minimalista */}
                  <button
                    type="button"
                    onClick={() => setTheme('minimal')}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                      theme === 'minimal'
                        ? 'bg-slate-700/40 border-slate-400/60 text-slate-100 ring-1 ring-slate-400/50'
                        : 'bg-slate-800/60 border-slate-700/70 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <div className="flex items-center gap-1.5">
                        <AlignLeft size={14} className={theme === 'minimal' ? 'text-slate-200' : 'text-slate-400'} />
                        <span className="text-xs font-bold">Minimalista</span>
                      </div>
                      {theme === 'minimal' && <Check size={12} className="text-slate-200" />}
                    </div>
                    <span className="text-[10.5px] leading-tight text-slate-400">
                      Monocromático, linhas finas e máxima legibilidade.
                    </span>
                  </button>
                </div>
              </div>

              {/* Formato do Papel (Paper Size) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  Formato da Folha (Paper Size)
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPaperSize('A4')}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between font-medium transition ${
                      paperSize === 'A4'
                        ? 'bg-slate-800 border-amber-500/60 text-slate-100 ring-1 ring-amber-500/40'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-200">A4</span>
                      <span className="text-[10px] text-slate-400 block">210 × 297 mm (Padrão)</span>
                    </div>
                    {paperSize === 'A4' && <Check size={14} className="text-amber-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaperSize('Letter')}
                    className={`p-2.5 rounded-lg border text-xs flex items-center justify-between font-medium transition ${
                      paperSize === 'Letter'
                        ? 'bg-slate-800 border-amber-500/60 text-slate-100 ring-1 ring-amber-500/40'
                        : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-slate-200">Carta (Letter)</span>
                      <span className="text-[10px] text-slate-400 block">8.5 × 11 pol (USA)</span>
                    </div>
                    {paperSize === 'Letter' && <Check size={14} className="text-amber-400" />}
                  </button>
                </div>
              </div>

              {/* Metadados do Documento */}
              <div className="space-y-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                    Título do Documento
                  </label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    className="w-full text-xs px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400 transition"
                    placeholder="Título principal da apostila..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Tópico / Matéria
                    </label>
                    <input
                      type="text"
                      value={docMateria}
                      onChange={(e) => setDocMateria(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400 transition"
                      placeholder="Ex: Inteligência Artificial"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                      Autor / Elaboração
                    </label>
                    <input
                      type="text"
                      value={docAuthor}
                      onChange={(e) => setDocAuthor(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-200 focus:outline-none focus:border-amber-400 transition"
                      placeholder="Ex: Seu Nome / RAG Studio"
                    />
                  </div>
                </div>
              </div>

              {/* Estrutura & Toggles */}
              <div className="pt-2 border-t border-slate-800 space-y-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeHeader}
                    onChange={(e) => setIncludeHeader(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400"
                  />
                  <span>Incluir cabeçalho formal com metadados e data</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={includeFooter}
                    onChange={(e) => setIncludeFooter(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400"
                  />
                  <span>Incluir rodapé editorial e numeração de páginas</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showCitations}
                    onChange={(e) => setShowCitations(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-400"
                  />
                  <span>Compilar referências & links ao final do documento</span>
                </label>
              </div>
            </div>

            {/* Ações do Modal */}
            <div className="flex items-center justify-between px-5 py-3.5 border-t border-slate-800 bg-slate-950/60">
              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={downloading}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                title="Baixar arquivo HTML autocontido pronto para impressão ou leitura offline"
              >
                <FileText size={13} />
                <span>{downloading ? 'Baixando...' : 'Baixar HTML'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowOptionsModal(false)}
                  className="text-xs px-3 py-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handlePrintFromModal}
                  disabled={exporting}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow-md shadow-amber-500/10 transition"
                  title="Abrir pré-visualização e disparar diálogo de impressão/PDF do navegador"
                >
                  <Printer size={14} />
                  <span>{exporting ? 'Abrindo...' : 'Imprimir / Salvar PDF'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
