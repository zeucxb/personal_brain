'use client';

import React, { useState } from 'react';
import { Download, FileText, Printer, Check } from 'lucide-react';

interface PdfExportButtonProps {
  content: string;
  materia?: string;
  title?: string;
}

export function PdfExportButton({ content, materia, title }: PdfExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExportPdf = () => {
    setExporting(true);

    try {
      // Cria uma janela dedicada para impressão/salvamento em PDF
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor, permita pop-ups para gerar o documento PDF.');
        setExporting(false);
        return;
      }

      const docTitle = title || `Apostila - ${materia || 'Estudo Acadêmico'}`;
      const nowStr = new Date().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Converte quebras e títulos básicos
      const formattedHtml = content
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/\n\n/g, '<p></p>')
        .replace(/\n/g, '<br/>');

      const printHtml = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <style>
    @page {
      margin: 20mm;
      size: A4;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #1e293b;
      line-height: 1.6;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }
    .pdf-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 12px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .pdf-title {
      font-size: 18pt;
      font-weight: 700;
      color: #0f172a;
      margin: 0;
    }
    .pdf-meta {
      font-size: 9pt;
      color: #64748b;
      text-align: right;
    }
    .pdf-badge {
      display: inline-block;
      background: #e2e8f0;
      color: #334155;
      padding: 2px 8px;
      border-radius: 4px;
      font-weight: 600;
      font-size: 8pt;
      margin-bottom: 4px;
    }
    h1, h2, h3, h4 {
      color: #0f172a;
      page-break-after: avoid;
    }
    h1 { font-size: 16pt; margin-top: 24px; }
    h2 { font-size: 13pt; margin-top: 20px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    h3 { font-size: 11pt; margin-top: 16px; }
    p { margin-bottom: 12px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      page-break-inside: avoid;
    }
    th, td {
      border: 1px solid #cbd5e1;
      padding: 8px 12px;
      text-align: left;
      font-size: 10pt;
    }
    th {
      background: #f1f5f9;
      font-weight: 600;
    }
    blockquote {
      border-left: 3px solid #3b82f6;
      padding-left: 12px;
      margin: 12px 0;
      color: #475569;
      font-style: italic;
    }
    pre, code {
      font-family: Menlo, Monaco, Consolas, monospace;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      font-size: 9.5pt;
    }
    pre {
      padding: 12px;
      overflow-x: auto;
      page-break-inside: avoid;
    }
    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      font-size: 8pt;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 6px;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="pdf-header">
    <div>
      <span class="pdf-badge">DOCUMENTO ACADÊMICO</span>
      <h1 class="pdf-title">${docTitle}</h1>
    </div>
    <div class="pdf-meta">
      <div><strong>Tópico:</strong> ${materia || 'Geral'}</div>
      <div><strong>Gerado em:</strong> ${nowStr}</div>
    </div>
  </div>

  <div class="pdf-content">
    ${formattedHtml}
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 400);
    };
  </script>
</body>
</html>
      `;

      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
    } catch (e) {
      console.error('Erro ao gerar visualização para PDF:', e);
    } finally {
      setTimeout(() => setExporting(false), 1500);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExportPdf}
      disabled={exporting}
      className="table-action-btn flex items-center gap-1.5 text-xs py-1 px-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 border border-slate-700/80 rounded-md transition"
      title="Exportar esta resposta em formato PDF para download ou impressão"
    >
      <Download size={12} className="text-amber-400" />
      <span>{exporting ? 'Gerando PDF...' : 'Baixar PDF'}</span>
    </button>
  );
}
