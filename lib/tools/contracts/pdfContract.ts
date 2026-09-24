export interface PdfDocumentOptions {
  title?: string;
  materia?: string;
  author?: string;
  paperSize?: 'A4' | 'Letter';
  theme?: 'academic' | 'modern' | 'minimal';
  includeHeader?: boolean;
  includeFooter?: boolean;
  showCitations?: boolean;
}

export interface PdfCompilationResult {
  title: string;
  filename: string;
  htmlDocument: string;
}

export interface IPdfGeneratorEngine {
  formatContentToPrintableHtml(content: string, options?: PdfDocumentOptions): string;
  triggerBrowserDownload(content: string, options?: PdfDocumentOptions): void;
}
