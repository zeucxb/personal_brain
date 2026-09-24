import {
  IPdfGeneratorEngine,
  PdfDocumentOptions,
  PdfCompilationResult,
} from '../contracts/pdfContract';

/**
 * Escapes special HTML characters to prevent XSS and formatting breakage.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Extracts the first h1 heading from markdown content if present.
 */
function extractTitleFromMarkdown(content: string): string | null {
  const match = content.match(/^#\s+(.*)$/m);
  if (match && match[1]) {
    return match[1].replace(/[*_`#]/g, '').trim();
  }
  return null;
}

/**
 * Robust markdown to semantic HTML converter specifically tuned for print typography.
 */
function parseMarkdownToPrintHtml(
  markdown: string,
  showCitations: boolean
): { html: string; citations: Array<{ index: number; text: string; url: string }> } {
  const citations: Array<{ index: number; text: string; url: string }> = [];
  const urlMap = new Map<string, number>();

  // Normalize line endings and strip outside markdown backticks if any
  let text = markdown.replace(/\r\n/g, '\n').trim();

  // 1. Protect code blocks from inline parsing
  const codeBlocks: string[] = [];
  text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `<!--PDF_ENGINE_CODE_${codeBlocks.length}-->`;
    const escapedCode = escapeHtml(code.trimEnd());
    const langLabel = lang ? escapeHtml(lang) : 'código';
    codeBlocks.push(`
<div class="pdf-code-block no-split">
  <div class="pdf-code-header">
    <span class="pdf-code-lang">${langLabel}</span>
  </div>
  <pre><code>${escapedCode}</code></pre>
</div>`);
    return placeholder;
  });

  // 2. Protect inline code
  const inlineCodes: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const placeholder = `<!--PDF_ENGINE_INLINE_${inlineCodes.length}-->`;
    inlineCodes.push(`<code class="pdf-inline-code">${escapeHtml(code)}</code>`);
    return placeholder;
  });

  // 3. Helper for inline formatting (bold, italic, links, images, strike)
  function formatInline(str: string): string {
    // Images: ![alt](url)
    str = str.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
      const escAlt = escapeHtml(alt || '');
      const escUrl = escapeHtml(url);
      return `
<figure class="pdf-figure no-split">
  <img src="${escUrl}" alt="${escAlt}" />
  ${escAlt ? `<figcaption class="pdf-figcaption">${escAlt}</figcaption>` : ''}
</figure>`;
    });

    // Links & Citations: [text](url)
    str = str.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, linkText, url) => {
      const cleanUrl = url.trim();
      if (showCitations) {
        let citationIndex = urlMap.get(cleanUrl);
        if (!citationIndex) {
          citationIndex = citations.length + 1;
          urlMap.set(cleanUrl, citationIndex);
          citations.push({ index: citationIndex, text: linkText, url: cleanUrl });
        }
        return `<span class="pdf-citation-text">${linkText}</span><sup class="pdf-citation-mark">[${citationIndex}]</sup>`;
      } else {
        return `<a href="${escapeHtml(cleanUrl)}" class="pdf-link" target="_blank" rel="noopener noreferrer">${linkText}</a>`;
      }
    });

    // Bold + Italic: ***text*** or ___text___
    str = str.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    str = str.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');

    // Bold: **text** or __text__
    str = str.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    str = str.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic: *text* or _text_
    str = str.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
    str = str.replace(/_([^_\n]+)_/g, '<em>$1</em>');

    // Strikethrough: ~~text~~
    str = str.replace(/~~(.*?)~~/g, '<del>$1</del>');

    return str;
  }

  const lines = text.split('\n');
  const output: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Code block placeholder
    if (line.trim().startsWith('<!--PDF_ENGINE_CODE_')) {
      output.push(line.trim());
      i++;
      continue;
    }

    // Explicit manual page break: <!-- pagebreak --> or \pagebreak or [pagebreak]
    if (/^(?:<!--\s*pagebreak\s*-->|\\pagebreak|\[pagebreak\])\s*$/i.test(line.trim())) {
      output.push('<div class="page-break-before"></div>');
      i++;
      continue;
    }

    // Horizontal Rule: ---, ***, ___
    if (/^(?:---|___|\*\*\*)\s*$/.test(line.trim())) {
      output.push('<hr class="pdf-divider" />');
      i++;
      continue;
    }

    // Headings: # through ######
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingContent = formatInline(headingMatch[2].trim());
      output.push(`<h${level} class="pdf-heading h${level} no-split">${headingContent}</h${level}>`);
      i++;
      continue;
    }

    // Table parsing: line starts with | and next line has |-
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*\|/.test(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0];
        const alignRow = tableLines[1];
        const dataRows = tableLines.slice(2);

        const parseRow = (r: string) =>
          r
            .replace(/^\||\|$/g, '')
            .split('|')
            .map((c) => c.trim());

        const headers = parseRow(headerRow);
        const alignsRaw = parseRow(alignRow);

        const alignments = alignsRaw.map((a) => {
          const left = a.startsWith(':');
          const right = a.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          return 'left';
        });

        let tableHtml = '<div class="pdf-table-wrapper no-split"><table class="pdf-table"><thead><tr>';
        headers.forEach((h, colIdx) => {
          const align = alignments[colIdx] || 'left';
          tableHtml += `<th style="text-align: ${align};">${formatInline(h)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        dataRows.forEach((row) => {
          const cells = parseRow(row);
          tableHtml += '<tr>';
          headers.forEach((_, colIdx) => {
            const cell = cells[colIdx] || '';
            const align = alignments[colIdx] || 'left';
            tableHtml += `<td style="text-align: ${align};">${formatInline(cell)}</td>`;
          });
          tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table></div>';
        output.push(tableHtml);
        continue;
      }
    }

    // Blockquotes & Callout Alerts: starts with >
    if (line.trim().startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }

      const firstLine = quoteLines[0]?.trim() || '';
      const alertMatch = firstLine.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO)\]/i);

      if (alertMatch) {
        const type = alertMatch[1].toUpperCase();
        const contentLines = quoteLines.slice(1);
        const bodyContent = contentLines.map((l) => formatInline(l)).join('<br/>');

        let title = 'Nota Informativa';
        let alertClass = 'pdf-callout-info';
        let icon = 'ℹ️';

        if (type === 'TIP') {
          title = 'Dica Prática';
          alertClass = 'pdf-callout-tip';
          icon = '💡';
        } else if (type === 'IMPORTANT') {
          title = 'Ponto Importante';
          alertClass = 'pdf-callout-important';
          icon = '📌';
        } else if (type === 'WARNING') {
          title = 'Atenção';
          alertClass = 'pdf-callout-warning';
          icon = '⚠️';
        } else if (type === 'CAUTION') {
          title = 'Cuidado';
          alertClass = 'pdf-callout-danger';
          icon = '🛑';
        }

        output.push(`
<div class="pdf-callout ${alertClass} no-split">
  <div class="pdf-callout-title"><span>${icon}</span> <span>${title}</span></div>
  <div class="pdf-callout-body">${bodyContent}</div>
</div>`);
      } else {
        const quoteContent = quoteLines.map((l) => formatInline(l)).join('<br/>');
        output.push(`<blockquote class="pdf-blockquote no-split">${quoteContent}</blockquote>`);
      }
      continue;
    }

    // Lists (unordered, ordered, checklists)
    if (/^\s*(?:[-*+]|\d+\.)\s+/.test(line)) {
      const isOrdered = /^\s*\d+\.\s+/.test(line);
      const tag = isOrdered ? 'ol' : 'ul';
      let listHtml = `<${tag} class="pdf-list no-split">`;

      while (i < lines.length && /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i])) {
        const curLine = lines[i];
        let itemText = curLine.replace(/^\s*(?:[-*+]|\d+\.)\s+/, '').trim();

        // Checklist detection
        if (itemText.startsWith('[x] ') || itemText.startsWith('[X] ')) {
          itemText = `<span class="pdf-checkbox checked">☑</span> ` + formatInline(itemText.slice(4));
        } else if (itemText.startsWith('[ ] ')) {
          itemText = `<span class="pdf-checkbox">☐</span> ` + formatInline(itemText.slice(4));
        } else {
          itemText = formatInline(itemText);
        }

        listHtml += `<li>${itemText}</li>`;
        i++;
      }

      listHtml += `</${tag}>`;
      output.push(listHtml);
      continue;
    }

    // Regular paragraphs: collect consecutive lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('<!--PDF_ENGINE_CODE_') &&
      !/^(?:---|___|\*\*\*)\s*$/.test(lines[i].trim()) &&
      !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[i]) &&
      !/^(?:<!--\s*pagebreak\s*-->|\\pagebreak|\[pagebreak\])\s*$/i.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    if (paraLines.length > 0) {
      const pContent = paraLines.map((l) => formatInline(l)).join(' ');
      output.push(`<p>${pContent}</p>`);
    }
  }

  // Restore inline codes
  let finalHtml = output.join('\n');
  inlineCodes.forEach((codeHtml, idx) => {
    finalHtml = finalHtml.split(`<!--PDF_ENGINE_INLINE_${idx}-->`).join(codeHtml);
  });

  // Restore code blocks
  codeBlocks.forEach((blockHtml, idx) => {
    finalHtml = finalHtml.split(`<!--PDF_ENGINE_CODE_${idx}-->`).join(blockHtml);
  });

  // Append Citations section if showCitations is true and citations exist
  if (showCitations && citations.length > 0) {
    let citationsHtml = `
<div class="pdf-citations-section no-split">
  <div class="pdf-citations-header">Fontes e Referências Citadas</div>
  <ol class="pdf-citations-list">
`;
    citations.forEach((c) => {
      citationsHtml += `    <li><strong>${escapeHtml(c.text)}</strong> &mdash; <a href="${escapeHtml(c.url)}" class="pdf-citation-url" target="_blank" rel="noopener noreferrer">${escapeHtml(c.url)}</a></li>\n`;
    });
    citationsHtml += `  </ol>\n</div>`;
    finalHtml += citationsHtml;
  }

  return { html: finalHtml, citations };
}

/**
 * Generates the CSS rules for paper sizes, themes, and print media.
 */
function generateDocumentStyles(paperSize: 'A4' | 'Letter', theme: 'academic' | 'modern' | 'minimal'): string {
  const isA4 = paperSize === 'A4';
  const pageRules = isA4
    ? `
    @page {
      size: A4 portrait;
      margin: 18mm 16mm 20mm 16mm;
      @bottom-right {
        content: "Página " counter(page) " de " counter(pages);
        font-family: inherit;
        font-size: 8pt;
        color: #94a3b8;
      }
    }`
    : `
    @page {
      size: letter portrait;
      margin: 0.75in 0.65in 0.75in 0.65in;
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: inherit;
        font-size: 8pt;
        color: #94a3b8;
      }
    }`;

  // Theme-specific CSS variables and styles
  let themeCss = '';

  if (theme === 'academic') {
    themeCss = `
      body {
        font-family: "Latin Modern Roman", "Cambria", "Times New Roman", Times, Georgia, serif;
        color: #111827;
        line-height: 1.7;
        font-size: 11pt;
      }
      .pdf-doc-title {
        font-family: "Latin Modern Roman", "Cambria", "Times New Roman", Times, Georgia, serif;
        font-size: 21pt;
        font-weight: 700;
        color: #0f172a;
        margin: 0 0 12px 0;
        line-height: 1.25;
      }
      .pdf-header {
        border-bottom: 2px solid #0f172a;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      .pdf-theme-badge {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 8pt;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #1e293b;
        background: #f1f5f9;
        border: 1px solid #cbd5e1;
        padding: 3px 8px;
        border-radius: 3px;
        display: inline-block;
        margin-bottom: 10px;
      }
      .pdf-meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
        padding: 10px 14px;
        background: #f8fafc;
        border-left: 3px solid #0f172a;
        font-size: 9pt;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .pdf-heading.h1 {
        font-size: 16pt;
        color: #0f172a;
        border-bottom: 1px solid #0f172a;
        padding-bottom: 4px;
        margin-top: 24px;
      }
      .pdf-heading.h2 {
        font-size: 13.5pt;
        color: #1e293b;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 3px;
        margin-top: 20px;
      }
      .pdf-heading.h3 {
        font-size: 11.5pt;
        color: #334155;
        margin-top: 16px;
      }
      .pdf-table {
        border-top: 2px solid #0f172a;
        border-bottom: 2px solid #0f172a;
      }
      .pdf-table th {
        border-bottom: 1px solid #0f172a;
        background: #f8fafc;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-weight: 700;
      }
      .pdf-table td {
        border-bottom: 1px solid #e2e8f0;
      }
      .pdf-blockquote {
        border-left: 3px solid #0f172a;
        background: #f8fafc;
        font-style: italic;
        padding: 10px 16px;
      }
    `;
  } else if (theme === 'modern') {
    themeCss = `
      body {
        font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        color: #1e293b;
        line-height: 1.65;
        font-size: 10.5pt;
      }
      .pdf-doc-title {
        font-size: 21pt;
        font-weight: 800;
        color: #0f172a;
        letter-spacing: -0.025em;
        line-height: 1.25;
        margin: 0 0 14px 0;
      }
      .pdf-header {
        border-bottom: 2px solid #3b82f6;
        padding-bottom: 16px;
        margin-bottom: 24px;
      }
      .pdf-theme-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 8pt;
        font-weight: 700;
        color: #1d4ed8;
        background: #eff6ff;
        border: 1px solid #bfdbfe;
        padding: 4px 10px;
        border-radius: 9999px;
        margin-bottom: 10px;
      }
      .pdf-meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 10px;
        padding: 12px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        font-size: 9pt;
      }
      .pdf-heading.h1 {
        font-size: 16pt;
        font-weight: 700;
        color: #0f172a;
        letter-spacing: -0.02em;
        margin-top: 24px;
        padding-bottom: 6px;
        border-bottom: 1.5px solid #e2e8f0;
      }
      .pdf-heading.h2 {
        font-size: 13pt;
        font-weight: 700;
        color: #1e293b;
        margin-top: 18px;
      }
      .pdf-heading.h3 {
        font-size: 11pt;
        font-weight: 600;
        color: #2563eb;
        margin-top: 14px;
      }
      .pdf-table {
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        overflow: hidden;
      }
      .pdf-table th {
        background: #f1f5f9;
        color: #0f172a;
        font-weight: 600;
        border-bottom: 1px solid #cbd5e1;
      }
      .pdf-table tr:nth-child(even) td {
        background: #f8fafc;
      }
      .pdf-blockquote {
        border-left: 3px solid #3b82f6;
        background: #f8fafc;
        padding: 10px 16px;
        border-radius: 0 6px 6px 0;
      }
    `;
  } else {
    // Minimal theme
    themeCss = `
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #111827;
        line-height: 1.6;
        font-size: 10.5pt;
      }
      .pdf-doc-title {
        font-size: 19pt;
        font-weight: 700;
        color: #111827;
        line-height: 1.25;
        margin: 0 0 10px 0;
      }
      .pdf-header {
        border-bottom: 1px solid #e5e7eb;
        padding-bottom: 14px;
        margin-bottom: 22px;
      }
      .pdf-theme-badge {
        display: inline-block;
        font-size: 7.5pt;
        font-weight: 600;
        color: #6b7280;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 8px;
      }
      .pdf-meta-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        font-size: 8.5pt;
        color: #6b7280;
        padding: 0;
        margin-bottom: 6px;
      }
      .pdf-heading.h1 {
        font-size: 15pt;
        font-weight: 600;
        color: #111827;
        margin-top: 22px;
      }
      .pdf-heading.h2 {
        font-size: 12.5pt;
        font-weight: 600;
        color: #1f2937;
        margin-top: 18px;
      }
      .pdf-heading.h3 {
        font-size: 11pt;
        font-weight: 600;
        color: #374151;
        margin-top: 14px;
      }
      .pdf-table {
        border-bottom: 1px solid #e5e7eb;
      }
      .pdf-table th {
        border-bottom: 1px solid #111827;
        background: transparent;
        color: #111827;
        font-weight: 600;
      }
      .pdf-table td {
        border-bottom: 1px solid #f3f4f6;
      }
      .pdf-blockquote {
        border-left: 2px solid #9ca3af;
        padding-left: 12px;
        color: #4b5563;
        font-style: italic;
      }
    `;
  }

  return `
    ${pageRules}

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      padding: 0;
      background-color: #ffffff;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    ${themeCss}

    /* Common Editorial Typography & Elements */
    p {
      margin-top: 0;
      margin-bottom: 12px;
      text-align: justify;
      text-justify: inter-word;
      orphans: 3;
      widows: 3;
    }

    .pdf-meta-item strong {
      display: block;
      color: #64748b;
      font-size: 7.5pt;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .pdf-meta-item span {
      color: #1e293b;
      font-weight: 600;
    }

    .pdf-divider {
      border: 0;
      height: 1px;
      background: #e2e8f0;
      margin: 22px 0;
    }

    /* Page Breaks and Anti-Orphan Layout Rules */
    .no-split,
    .pdf-table-wrapper,
    table,
    tr,
    pre,
    .pdf-code-block,
    blockquote,
    .pdf-callout,
    .pdf-figure,
    .pdf-header,
    .pdf-citations-section {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }

    h1, h2, h3, h4, h5, h6,
    .pdf-heading {
      page-break-after: avoid !important;
      break-after: avoid !important;
    }

    .page-break-before {
      page-break-before: always !important;
      break-before: always !important;
      height: 0;
      margin: 0;
      padding: 0;
      visibility: hidden;
    }

    /* Table Styling */
    .pdf-table-wrapper {
      width: 100%;
      margin: 16px 0;
      overflow-x: auto;
    }

    .pdf-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
    }

    .pdf-table th,
    .pdf-table td {
      padding: 8px 12px;
      border: 1px solid #cbd5e1;
      vertical-align: top;
    }

    /* Callout Alert Boxes */
    .pdf-callout {
      margin: 14px 0;
      padding: 10px 14px;
      border-radius: 6px;
      border-left: 4px solid;
      font-size: 10pt;
    }

    .pdf-callout-title {
      font-weight: 700;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 9.5pt;
    }

    .pdf-callout-info {
      border-left-color: #3b82f6;
      background: #eff6ff;
      color: #1e3a8a;
    }

    .pdf-callout-tip {
      border-left-color: #10b981;
      background: #ecfdf5;
      color: #064e3b;
    }

    .pdf-callout-important {
      border-left-color: #8b5cf6;
      background: #f5f3ff;
      color: #4c1d95;
    }

    .pdf-callout-warning {
      border-left-color: #f59e0b;
      background: #fffbeb;
      color: #78350f;
    }

    .pdf-callout-danger {
      border-left-color: #ef4444;
      background: #fef2f2;
      color: #7f1d1d;
    }

    /* Code Blocks */
    .pdf-code-block {
      margin: 14px 0;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #f8fafc;
      overflow: hidden;
    }

    .pdf-code-header {
      background: #f1f5f9;
      border-bottom: 1px solid #e2e8f0;
      padding: 4px 10px;
      display: flex;
      justify-content: flex-end;
    }

    .pdf-code-lang {
      font-family: ui-monospace, Menlo, Monaco, Consolas, monospace;
      font-size: 7.5pt;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
    }

    .pdf-code-block pre {
      margin: 0;
      padding: 10px 12px;
      overflow-x: auto;
    }

    .pdf-code-block code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 9pt;
      line-height: 1.5;
      color: #0f172a;
    }

    .pdf-inline-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 8.5pt;
      background: #f1f5f9;
      color: #0f172a;
      padding: 1px 5px;
      border-radius: 3px;
      border: 1px solid #e2e8f0;
    }

    /* Lists & Checklists */
    .pdf-list {
      margin: 10px 0 14px 0;
      padding-left: 22px;
    }

    .pdf-list li {
      margin-bottom: 4px;
    }

    .pdf-checkbox {
      font-size: 11pt;
      color: #64748b;
      margin-right: 4px;
    }

    .pdf-checkbox.checked {
      color: #2563eb;
      font-weight: bold;
    }

    /* Figures & Images */
    .pdf-figure {
      margin: 16px 0;
      text-align: center;
    }

    .pdf-figure img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    .pdf-figcaption {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 6px;
      font-style: italic;
    }

    /* Citations Section */
    .pdf-citations-section {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1.5px solid #cbd5e1;
    }

    .pdf-citations-header {
      font-size: 11pt;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 10px;
    }

    .pdf-citations-list {
      margin: 0;
      padding-left: 20px;
      font-size: 9pt;
      color: #475569;
    }

    .pdf-citations-list li {
      margin-bottom: 6px;
      word-break: break-all;
    }

    .pdf-citation-mark {
      font-size: 7.5pt;
      font-weight: 700;
      color: #2563eb;
      margin-left: 2px;
    }

    /* Footer */
    .pdf-footer {
      border-top: 1px solid #e2e8f0;
      margin-top: 36px;
      padding-top: 10px;
      font-size: 8pt;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    /* Screen Preview Container (Before Print) */
    @media screen {
      body {
        background-color: #0f172a;
        padding: 0;
      }
      .pdf-preview-stage {
        padding: 30px 16px;
        min-height: 100vh;
        background-color: #0f172a;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .pdf-document-wrapper {
        width: 100%;
        max-width: ${isA4 ? '840px' : '880px'};
        background: #ffffff;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 44px 52px;
        box-sizing: border-box;
      }
      .pdf-interactive-toolbar {
        position: sticky;
        top: 0;
        left: 0;
        right: 0;
        z-index: 9999;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        padding: 10px 20px;
        color: #f8fafc;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .pdf-toolbar-container {
        max-width: 900px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }
      .pdf-toolbar-info {
        display: flex;
        align-items: center;
        gap: 10px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .pdf-toolbar-badge {
        background: #3b82f6;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 8px;
        border-radius: 4px;
        text-transform: uppercase;
      }
      .pdf-toolbar-title {
        font-size: 13px;
        font-weight: 600;
        color: #f8fafc;
      }
      .pdf-toolbar-sub {
        font-size: 11px;
        color: #94a3b8;
      }
      .pdf-toolbar-actions {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .pdf-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .pdf-btn-primary {
        background: #2563eb;
        color: white;
      }
      .pdf-btn-primary:hover {
        background: #1d4ed8;
      }
      .pdf-btn-secondary {
        background: #334155;
        border-color: #475569;
        color: #e2e8f0;
      }
      .pdf-btn-secondary:hover {
        background: #475569;
        color: white;
      }
    }

    /* Print Media Overrides */
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .pdf-preview-stage {
        padding: 0 !important;
        background: transparent !important;
      }
      .pdf-document-wrapper {
        width: 100% !important;
        max-width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: none !important;
        border-radius: 0 !important;
        padding: 0 !important;
      }
      .no-print,
      .pdf-interactive-toolbar {
        display: none !important;
      }
    }
  `;
}

/**
 * Concrete implementation of the PDF Generation and Print Engine.
 */
export class PdfGeneratorEngine implements IPdfGeneratorEngine {
  /**
   * Transforms raw markdown/text into a standalone, printable HTML document
   * configured with paper size, typography theme, page breaks, and editorial header.
   */
  public formatContentToPrintableHtml(content: string, options?: PdfDocumentOptions): string {
    const paperSize: 'A4' | 'Letter' = options?.paperSize || 'A4';
    const theme: 'academic' | 'modern' | 'minimal' = options?.theme || 'academic';
    const includeHeader = options?.includeHeader !== false;
    const includeFooter = options?.includeFooter !== false;
    const showCitations = Boolean(options?.showCitations);

    const detectedTitle = extractTitleFromMarkdown(content);
    const docTitle =
      options?.title ||
      detectedTitle ||
      (options?.materia ? `Apostila - ${options.materia}` : 'Relatório de Estudo & Documentação');

    const materia = options?.materia || 'Estudo Acadêmico & Acervo';
    const author = options?.author || 'Acervo Acadêmico / RAG Studio';

    const nowStr = new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const parsed = parseMarkdownToPrintHtml(content, showCitations);
    const styles = generateDocumentStyles(paperSize, theme);

    // Build Header
    let headerHtml = '';
    if (includeHeader) {
      if (theme === 'academic') {
        headerHtml = `
  <header class="pdf-header pdf-header-academic no-split">
    <div>
      <span class="pdf-theme-badge">DOCUMENTO ACADÊMICO & PESQUISA</span>
    </div>
    <h1 class="pdf-doc-title">${escapeHtml(docTitle)}</h1>
    <div class="pdf-meta-grid">
      <div class="pdf-meta-item">
        <strong>Tópico / Disciplina</strong>
        <span>${escapeHtml(materia)}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Autor / Elaboração</strong>
        <span>${escapeHtml(author)}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Data de Emissão</strong>
        <span>${nowStr}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Formato</strong>
        <span>${paperSize} • Padrão ABNT/APA</span>
      </div>
    </div>
  </header>`;
      } else if (theme === 'modern') {
        headerHtml = `
  <header class="pdf-header pdf-header-modern no-split">
    <div>
      <span class="pdf-theme-badge">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
        RELATÓRIO TÉCNICO & SÍNTESE
      </span>
    </div>
    <h1 class="pdf-doc-title">${escapeHtml(docTitle)}</h1>
    <div class="pdf-meta-grid">
      <div class="pdf-meta-item">
        <strong>Tópico</strong>
        <span>${escapeHtml(materia)}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Elaboração</strong>
        <span>${escapeHtml(author)}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Data</strong>
        <span>${nowStr}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Padrão</strong>
        <span>${paperSize}</span>
      </div>
    </div>
  </header>`;
      } else {
        headerHtml = `
  <header class="pdf-header pdf-header-minimal no-split">
    <span class="pdf-theme-badge">RELATÓRIO SÍNTESE</span>
    <h1 class="pdf-doc-title">${escapeHtml(docTitle)}</h1>
    <div class="pdf-meta-grid">
      <div class="pdf-meta-item">
        <strong>Tópico:</strong> <span>${escapeHtml(materia)}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Autor:</strong> <span>${escapeHtml(author)}</span>
      </div>
      <div class="pdf-meta-item">
        <strong>Data:</strong> <span>${nowStr}</span>
      </div>
    </div>
  </header>`;
      }
    }

    // Build Footer
    let footerHtml = '';
    if (includeFooter) {
      footerHtml = `
  <footer class="pdf-footer no-split">
    <div>
      <span>${escapeHtml(docTitle)} &bull; ${escapeHtml(materia)}</span>
    </div>
    <div>
      <span>Gerado via RAG Studio &bull; ${nowStr}</span>
    </div>
  </footer>`;
    }

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(docTitle)}</title>
  <style>
${styles}
  </style>
</head>
<body>
  <div class="pdf-interactive-toolbar no-print">
    <div class="pdf-toolbar-container">
      <div class="pdf-toolbar-info">
        <span class="pdf-toolbar-badge">${theme}</span>
        <span class="pdf-toolbar-title">${escapeHtml(docTitle)}</span>
        <span class="pdf-toolbar-sub">&bull; Formato ${paperSize}</span>
      </div>
      <div class="pdf-toolbar-actions">
        <button onclick="window.print()" class="pdf-btn pdf-btn-primary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          <span>Imprimir / Salvar PDF</span>
        </button>
        <button onclick="window.close()" class="pdf-btn pdf-btn-secondary">
          <span>Fechar</span>
        </button>
      </div>
    </div>
  </div>

  <div class="pdf-preview-stage">
    <div class="pdf-document-wrapper">
      ${headerHtml}

      <main class="pdf-content-body">
        ${parsed.html}
      </main>

      ${footerHtml}
    </div>
  </div>

  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.error('Falha ao abrir diálogo de impressão:', e);
        }
      }, 450);
    });
  </script>
</body>
</html>`;
  }

  /**
   * Compiles the content into an artifact ready for export or download.
   */
  public compileDocument(content: string, options?: PdfDocumentOptions): PdfCompilationResult {
    const detectedTitle = extractTitleFromMarkdown(content);
    const docTitle =
      options?.title ||
      detectedTitle ||
      (options?.materia ? `Apostila - ${options.materia}` : 'Documento Academico');

    const safeFilename =
      docTitle
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'documento-academico';

    const html = this.formatContentToPrintableHtml(content, options);

    return {
      title: docTitle,
      filename: `${safeFilename}.html`,
      htmlDocument: html,
    };
  }

  /**
   * Opens a clean print preview window in the browser and triggers print-to-PDF seamlessly.
   * Returns true if the window opened successfully, false if blocked by a pop-up blocker.
   */
  public triggerPrint(content: string, options?: PdfDocumentOptions): boolean {
    if (typeof window === 'undefined') return false;

    const printableHtml = this.formatContentToPrintableHtml(content, options);
    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      return false;
    }

    printWindow.document.open();
    printWindow.document.write(printableHtml);
    printWindow.document.close();
    return true;
  }

  /**
   * Triggers a browser file download of the compiled, self-contained printable document.
   */
  public triggerBrowserDownload(content: string, options?: PdfDocumentOptions): void {
    if (typeof window === 'undefined') return;

    const compilation = this.compileDocument(content, options);
    const blob = new Blob([compilation.htmlDocument], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = compilation.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }
}

/**
 * Singleton instance of the PDF Generator Engine.
 */
export const pdfEngine = new PdfGeneratorEngine();

/**
 * Re-export contract types for consumer convenience.
 */
export * from '../contracts/pdfContract';
