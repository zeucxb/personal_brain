import {
  DeviceViewport,
  ViewportConfig,
  HtmlSandboxOptions,
  IHtmlSandboxEngine,
} from '../contracts/htmlContract';

/**
 * Standard viewport configurations for multi-device preview testing.
 * Desktop: 100% full width
 * Tablet: 768px width
 * Mobile: 375px width
 */
export const VIEWPORT_CONFIGS: Record<DeviceViewport, ViewportConfig> = {
  desktop: {
    id: 'desktop',
    label: 'Desktop',
    width: '100%',
    height: '100%',
    icon: '🖥️',
  },
  tablet: {
    id: 'tablet',
    label: 'Tablet',
    width: '768px',
    height: '100%',
    icon: '📱',
  },
  mobile: {
    id: 'mobile',
    label: 'Mobile',
    width: '375px',
    height: '100%',
    icon: '📲',
  },
};

export const VIEWPORT_LIST: ViewportConfig[] = [
  VIEWPORT_CONFIGS.desktop,
  VIEWPORT_CONFIGS.tablet,
  VIEWPORT_CONFIGS.mobile,
];

/**
 * Retrieves the ViewportConfig for a given device viewport.
 */
export function getViewportConfig(viewport: DeviceViewport = 'desktop'): ViewportConfig {
  return VIEWPORT_CONFIGS[viewport] || VIEWPORT_CONFIGS.desktop;
}

/**
 * Safely strips markdown code block fences (e.g. ```html or ```).
 */
export function stripCodeFences(rawHtml: string): string {
  if (!rawHtml) return '';
  let cleaned = rawHtml.trim();
  cleaned = cleaned.replace(/^```(?:html)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  return cleaned.trim();
}

/**
 * Escapes common HTML special characters for attributes and titles.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Modern Tailwind CSS Play CDN script tag.
 */
export const TAILWIND_CDN_SCRIPT = '<script src="https://cdn.tailwindcss.com"></script>';

/**
 * Detects whether the HTML content already imports or references Tailwind CSS.
 */
export function hasTailwindIncluded(html: string): boolean {
  return /(cdn\.tailwindcss\.com|@tailwindcss|tailwindcss\/|tailwindcss\.js)/i.test(html);
}

/**
 * Extracts the <title> tag value from raw HTML if present.
 */
export function extractHtmlTitle(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (match && match[1]) {
    const title = match[1].trim();
    if (title && title !== '...') {
      return title;
    }
  }
  return null;
}

/**
 * Implementation of the HTML Sandbox Engine according to IHtmlSandboxEngine contract.
 */
export class HtmlSandboxEngine implements IHtmlSandboxEngine {
  /**
   * Prepares and transforms raw HTML for sandboxed rendering.
   * - Strips markdown code blocks
   * - Injects modern Tailwind CSS CDN when requested if missing
   * - Ensures responsive viewport meta and character set
   * - Wraps snippets or partial documents in a valid HTML5 shell
   */
  prepareSandboxHtml(rawHtml: string, options: HtmlSandboxOptions = {}): string {
    const cleaned = stripCodeFences(rawHtml);
    const title = options.title?.trim() || extractHtmlTitle(cleaned) || 'HTML Preview Sandbox';
    const viewport = options.viewport || 'desktop';
    const injectTailwind = options.injectTailwind ?? true;
    const enableScripts = options.enableScripts ?? true;

    if (!cleaned) {
      return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;color:#64748b;background:#f8fafc;">
  <p>Nenhum conteúdo HTML para exibir.</p>
</body>
</html>`;
    }

    let processed = cleaned;

    // If script execution is disabled, remove script tags
    if (!enableScripts) {
      processed = processed.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    }

    const needsTailwind = injectTailwind && !hasTailwindIncluded(processed);
    const isFullDocument = /<!DOCTYPE\b|<html\b|<body\b/i.test(processed);

    if (!isFullDocument) {
      // Wrap snippet / partial HTML in a complete, responsive HTML5 document
      return `<!DOCTYPE html>
<html lang="pt-BR" data-viewport="${viewport}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${needsTailwind ? `  ${TAILWIND_CDN_SCRIPT}\n` : ''}  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 1rem;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: #ffffff;
      color: #0f172a;
    }
  </style>
</head>
<body>
${processed}
</body>
</html>`;
    }

    // It is a full document: ensure data-viewport on <html>
    if (/<html\b/i.test(processed) && !/data-viewport=/i.test(processed)) {
      processed = processed.replace(/(<html\b[^>]*)(>)/i, `$1 data-viewport="${viewport}"$2`);
    }

    // Ensure <head> tag exists
    if (!/<head\b/i.test(processed)) {
      if (/<html\b[^>]*>/i.test(processed)) {
        processed = processed.replace(
          /(<html\b[^>]*>)/i,
          `$1\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>`
        );
      } else {
        processed = `<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>\n${processed}`;
      }
    }

    // Ensure <meta charset="UTF-8">
    if (!/<meta\s+[^>]*charset=/i.test(processed)) {
      processed = processed.replace(/(<head\b[^>]*>)/i, `$1\n  <meta charset="UTF-8">`);
    }

    // Ensure <meta name="viewport">
    if (!/<meta\s+[^>]*name=["']viewport["']/i.test(processed)) {
      processed = processed.replace(
        /(<head\b[^>]*>)/i,
        `$1\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">`
      );
    }

    // Ensure or update <title> if provided
    if (options.title) {
      if (/<title\b[^>]*>[\s\S]*?<\/title>/i.test(processed)) {
        processed = processed.replace(
          /<title\b[^>]*>(?:(?:\.\.\.)|\s*)<\/title>/i,
          `<title>${escapeHtml(title)}</title>`
        );
      } else {
        processed = processed.replace(
          /(<head\b[^>]*>)/i,
          `$1\n  <title>${escapeHtml(title)}</title>`
        );
      }
    }

    // Inject Tailwind CDN if requested and missing
    if (needsTailwind) {
      if (/<\/head>/i.test(processed)) {
        processed = processed.replace(/<\/head>/i, `  ${TAILWIND_CDN_SCRIPT}\n</head>`);
      } else {
        processed = processed.replace(/(<head\b[^>]*>)/i, `$1\n  ${TAILWIND_CDN_SCRIPT}`);
      }
    }

    return processed;
  }

  /**
   * Opens the prepared HTML document in a new browser tab using a Blob URL.
   * Revokes the Blob URL automatically to prevent memory leaks.
   */
  openInFullscreenTab(rawHtml: string, title?: string): void {
    if (typeof window === 'undefined') return;

    const docTitle = title?.trim() || extractHtmlTitle(rawHtml) || 'HTML Preview Sandbox';
    const prepared = this.prepareSandboxHtml(rawHtml, {
      title: docTitle,
      injectTailwind: true,
      viewport: 'desktop',
    });

    const blob = new Blob([prepared], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const openedWindow = window.open(blobUrl, '_blank');
    if (!openedWindow) {
      // Fallback for popup blockers: use temporary anchor element
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } else {
      openedWindow.focus();
    }

    // Revoke the Blob URL after 60 seconds
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 60000);
  }

  /**
   * Triggers a 1-click download of the prepared HTML file.
   */
  downloadHtmlFile(rawHtml: string, filename?: string): void {
    if (typeof window === 'undefined') return;

    const detectedTitle = extractHtmlTitle(rawHtml);
    const rawName = filename?.trim() || detectedTitle || 'interface-preview';
    const cleanBaseName = rawName.replace(/\.html$/i, '') || 'interface-preview';
    const safeBaseName = cleanBaseName.replace(/[/\\?%*:|"<>]/g, '-').trim() || 'interface-preview';
    const finalFilename = `${safeBaseName}.html`;

    const prepared = this.prepareSandboxHtml(rawHtml, {
      title: safeBaseName,
      injectTailwind: true,
      viewport: 'desktop',
    });

    const blob = new Blob([prepared], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = finalFilename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);

    // Revoke the Blob URL after 10 seconds
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
    }, 10000);
  }
}

/**
 * Singleton instance of the HTML Sandbox Engine.
 */
export const htmlSandboxEngine = new HtmlSandboxEngine();

export * from '../contracts/htmlContract';
