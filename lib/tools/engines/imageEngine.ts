import {
  IImageEngine,
  ImageGenerationOptions,
  ImageUrlDescriptor,
  ImageStylePreset,
  ImageAspectRatio,
} from '../contracts/imageContract';

export * from '../contracts/imageContract';

/**
 * Definition and configuration for supported style presets
 */
export interface StylePresetDefinition {
  id: ImageStylePreset;
  label: string;
  englishLabel: string;
  description: string;
  icon: string;
  badgeColor: {
    bg: string;
    text: string;
    border: string;
    glow: string;
  };
  promptEnhancer: string;
  recommendedAspectRatio: ImageAspectRatio;
}

/**
 * Definitions for all visual style presets supported by the engine
 */
export const STYLE_PRESETS: Record<ImageStylePreset, StylePresetDefinition> = {
  scientific: {
    id: 'scientific',
    label: 'Científico',
    englishLabel: 'Scientific',
    description: 'Ilustrações acadêmicas, diagramas anatômicos e precisão médica/técnica',
    icon: '🔬',
    badgeColor: {
      bg: 'rgba(6, 182, 212, 0.15)',
      text: '#22d3ee',
      border: 'rgba(6, 182, 212, 0.35)',
      glow: 'rgba(6, 182, 212, 0.2)',
    },
    promptEnhancer:
      'detailed scientific illustration, medical textbook diagram, accurate cross-section, clean studio lighting, crisp educational aesthetics, 8k resolution, neutral background, sharp technical accuracy',
    recommendedAspectRatio: '4:3',
  },
  photorealistic: {
    id: 'photorealistic',
    label: 'Fotorrealista',
    englishLabel: 'Photorealistic',
    description: 'Fotografia de altíssima fidelidade com iluminação natural e texturas ricas',
    icon: '📷',
    badgeColor: {
      bg: 'rgba(16, 185, 129, 0.15)',
      text: '#34d399',
      border: 'rgba(16, 185, 129, 0.35)',
      glow: 'rgba(16, 185, 129, 0.2)',
    },
    promptEnhancer:
      'hyper-realistic photograph, 8k resolution, cinematic natural lighting, authentic tactile texture, shallow depth of field, shot on Hasselblad 100MP, professional studio photography, highly detailed, master photograph',
    recommendedAspectRatio: '16:9',
  },
  digital_art: {
    id: 'digital_art',
    label: 'Arte Digital',
    englishLabel: 'Digital Art',
    description: 'Arte conceitual vibrante com iluminação volumétrica e estilo cinematográfico',
    icon: '🎨',
    badgeColor: {
      bg: 'rgba(168, 85, 247, 0.15)',
      text: '#c084fc',
      border: 'rgba(168, 85, 247, 0.35)',
      glow: 'rgba(168, 85, 247, 0.2)',
    },
    promptEnhancer:
      'masterpiece digital art, trending on ArtStation, dynamic volumetric cinematic lighting, vibrant harmonious colors, detailed concept art illustration, expressive composition, high fantasy and sci-fi aesthetic',
    recommendedAspectRatio: '16:9',
  },
  infographic: {
    id: 'infographic',
    label: 'Infográfico',
    englishLabel: 'Infographic',
    description: 'Diagramação gráfica estruturada com ícones, etapas e dados visuais claros',
    icon: '📊',
    badgeColor: {
      bg: 'rgba(245, 158, 11, 0.15)',
      text: '#fbbf24',
      border: 'rgba(245, 158, 11, 0.35)',
      glow: 'rgba(245, 158, 11, 0.2)',
    },
    promptEnhancer:
      'modern educational infographic illustration, structured visual flowchart, clean graphic design layout, vector icons, schematic breakdown, clean isometric layout, high clarity data visualization, minimalist color palette',
    recommendedAspectRatio: '16:9',
  },
  minimalist_vector: {
    id: 'minimalist_vector',
    label: 'Vetor Minimalista',
    englishLabel: 'Minimalist Vector',
    description: 'Design plano limpo, formas geométricas modernas e contornos nítidos',
    icon: '📐',
    badgeColor: {
      bg: 'rgba(244, 63, 94, 0.15)',
      text: '#fb7185',
      border: 'rgba(244, 63, 94, 0.35)',
      glow: 'rgba(244, 63, 94, 0.2)',
    },
    promptEnhancer:
      'minimalist flat vector illustration, clean geometric lines, SVG graphic design aesthetic, elegant simplicity, modern harmonious color palette, sharp edges, no clutter, subtle soft shadows',
    recommendedAspectRatio: '1:1',
  },
};

/**
 * Aspect Ratio specifications with pixel resolutions
 */
export interface AspectRatioDefinition {
  ratio: ImageAspectRatio;
  label: string;
  width: number;
  height: number;
  ratioValue: number;
}

export const ASPECT_RATIOS: Record<ImageAspectRatio, AspectRatioDefinition> = {
  '1:1': {
    ratio: '1:1',
    label: '1:1 (Quadrado)',
    width: 1024,
    height: 1024,
    ratioValue: 1.0,
  },
  '16:9': {
    ratio: '16:9',
    label: '16:9 (Panorâmico)',
    width: 1280,
    height: 720,
    ratioValue: 16 / 9,
  },
  '4:3': {
    ratio: '4:3',
    label: '4:3 (Editorial / Slide)',
    width: 1024,
    height: 768,
    ratioValue: 4 / 3,
  },
  '9:16': {
    ratio: '9:16',
    label: '9:16 (Vertical / Mobile)',
    width: 720,
    height: 1280,
    ratioValue: 9 / 16,
  },
};

/**
 * Calculates responsive width and height based on aspect ratio or custom overrides
 */
export function calculateDimensions(
  aspectRatio?: ImageAspectRatio,
  customWidth?: number,
  customHeight?: number
): { width: number; height: number } {
  if (customWidth && customHeight) {
    return {
      width: Math.max(256, Math.min(2048, Math.round(customWidth))),
      height: Math.max(256, Math.min(2048, Math.round(customHeight))),
    };
  }

  const targetRatio: ImageAspectRatio = aspectRatio || '16:9';
  const standard = ASPECT_RATIOS[targetRatio] || ASPECT_RATIOS['16:9'];

  if (customWidth && !customHeight) {
    const calcH = Math.round(customWidth / standard.ratioValue);
    return { width: Math.round(customWidth), height: Math.max(256, Math.min(2048, calcH)) };
  }

  if (!customWidth && customHeight) {
    const calcW = Math.round(customHeight * standard.ratioValue);
    return { width: Math.max(256, Math.min(2048, calcW)), height: Math.round(customHeight) };
  }

  return { width: standard.width, height: standard.height };
}

/**
 * Detects the closest matching aspect ratio for a given width and height
 */
export function detectAspectRatio(width: number, height: number): ImageAspectRatio {
  if (!width || !height || height <= 0) return '16:9';
  const ratio = width / height;

  let closestRatio: ImageAspectRatio = '16:9';
  let minDiff = Infinity;

  const ratios: ImageAspectRatio[] = ['1:1', '16:9', '4:3', '9:16'];
  for (const r of ratios) {
    const diff = Math.abs(ratio - ASPECT_RATIOS[r].ratioValue);
    if (diff < minDiff) {
      minDiff = diff;
      closestRatio = r;
    }
  }

  return closestRatio;
}

/**
 * Enhances a base prompt with style preset guidelines and aesthetic keywords
 */
export function enhancePrompt(prompt: string, preset: ImageStylePreset): string {
  const clean = prompt.trim().replace(/[.,;\s]+$/, '');
  const config = STYLE_PRESETS[preset];
  if (!config) return clean;

  const lower = clean.toLowerCase();
  const hasStyle =
    lower.includes('style') ||
    lower.includes('illustration') ||
    lower.includes('photo') ||
    lower.includes('render');

  if (hasStyle) {
    return `${clean}, ${config.promptEnhancer}`;
  }

  return `${clean}, in ${config.label.toLowerCase()} style, ${config.promptEnhancer}`;
}

/**
 * Builds an optimized Pollinations AI image generation URL
 */
export function buildPollinationsUrl(
  prompt: string,
  width: number,
  height: number,
  seed?: number
): string {
  const cleanPrompt = prompt.trim();
  const encodedPrompt = encodeURIComponent(cleanPrompt);
  const params = new URLSearchParams();

  params.set('width', String(width));
  params.set('height', String(height));
  params.set('nologo', 'true');

  if (typeof seed === 'number' && !isNaN(seed)) {
    params.set('seed', String(seed));
  }

  return `https://image.pollinations.ai/prompt/${encodedPrompt}?${params.toString()}`;
}

/**
 * Information extracted from an existing Pollinations AI URL
 */
export interface ParsedImageUrlInfo {
  rawPrompt: string;
  cleanPrompt: string;
  width: number;
  height: number;
  seed?: number;
  aspectRatio: ImageAspectRatio;
  detectedPreset?: ImageStylePreset;
}

/**
 * Parses and extracts prompt, dimensions, aspect ratio, and style preset from a URL
 */
export function parseImageUrl(url: string): ParsedImageUrlInfo | null {
  if (!url) return null;

  try {
    const match = url.match(/pollinations\.ai\/prompt\/([^?#]+)(?:\?(.*))?/i);
    if (!match) return null;

    const rawPrompt = decodeURIComponent(match[1]).replace(/\+/g, ' ');
    const queryString = match[2] || '';
    const searchParams = new URLSearchParams(queryString);

    const width = parseInt(searchParams.get('width') || '1024', 10) || 1024;
    const height = parseInt(searchParams.get('height') || '768', 10) || 768;
    const seed = searchParams.get('seed') ? parseInt(searchParams.get('seed')!, 10) : undefined;

    const aspectRatio = detectAspectRatio(width, height);

    let detectedPreset: ImageStylePreset | undefined;
    const lowerPrompt = rawPrompt.toLowerCase();

    if (
      lowerPrompt.includes('scientific') ||
      lowerPrompt.includes('anatomical') ||
      lowerPrompt.includes('medical') ||
      lowerPrompt.includes('textbook') ||
      lowerPrompt.includes('científico')
    ) {
      detectedPreset = 'scientific';
    } else if (
      lowerPrompt.includes('photorealistic') ||
      lowerPrompt.includes('photo') ||
      lowerPrompt.includes('hasselblad') ||
      lowerPrompt.includes('fotorrealista')
    ) {
      detectedPreset = 'photorealistic';
    } else if (
      lowerPrompt.includes('infographic') ||
      lowerPrompt.includes('flowchart') ||
      lowerPrompt.includes('infográfico')
    ) {
      detectedPreset = 'infographic';
    } else if (
      lowerPrompt.includes('minimalist_vector') ||
      lowerPrompt.includes('flat vector') ||
      lowerPrompt.includes('vector art') ||
      lowerPrompt.includes('vetor')
    ) {
      detectedPreset = 'minimalist_vector';
    } else if (
      lowerPrompt.includes('digital art') ||
      lowerPrompt.includes('concept art') ||
      lowerPrompt.includes('artstation') ||
      lowerPrompt.includes('arte digital')
    ) {
      detectedPreset = 'digital_art';
    }

    let cleanPrompt = rawPrompt;
    cleanPrompt = cleanPrompt
      .replace(
        /,\s*(?:detailed|high precision|masterpiece|trending|hyper-realistic|8k resolution|cinematic|photorealistic|clean geometric|modern educational)[^,]*/gi,
        ''
      )
      .trim();

    if (!cleanPrompt) cleanPrompt = rawPrompt;

    return {
      rawPrompt,
      cleanPrompt,
      width,
      height,
      seed,
      aspectRatio,
      detectedPreset,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Downloads an image by fetching its binary Blob and saving it as a .jpg file in the browser
 */
export async function downloadImage(imageUrl: string, filename?: string): Promise<void> {
  const defaultName = `imagem_ia_${Date.now()}.jpg`;
  const targetFilename = filename && filename.trim() ? filename.trim() : defaultName;
  const safeFilename =
    targetFilename.endsWith('.jpg') ||
    targetFilename.endsWith('.jpeg') ||
    targetFilename.endsWith('.png') ||
    targetFilename.endsWith('.webp')
      ? targetFilename
      : `${targetFilename}.jpg`;

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  try {
    const response = await fetch(imageUrl, {
      mode: 'cors',
      cache: 'no-cache',
    });

    if (!response.ok) {
      throw new Error(`Falha no download HTTP ${response.status}: ${response.statusText}`);
    }

    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);

    const anchor = document.createElement('a');
    anchor.style.display = 'none';
    anchor.href = objectUrl;
    anchor.download = safeFilename;
    document.body.appendChild(anchor);
    anchor.click();

    setTimeout(() => {
      if (document.body.contains(anchor)) {
        document.body.removeChild(anchor);
      }
      window.URL.revokeObjectURL(objectUrl);
    }, 200);
  } catch (err) {
    console.warn('[ImageEngine] Download direto via Blob falhou. Utilizando abertura em nova aba:', err);

    // Fallback gracioso abrindo a imagem diretamente
    const fallback = document.createElement('a');
    fallback.href = imageUrl;
    fallback.target = '_blank';
    fallback.rel = 'noopener noreferrer';
    fallback.download = safeFilename;
    document.body.appendChild(fallback);
    fallback.click();

    setTimeout(() => {
      if (document.body.contains(fallback)) {
        document.body.removeChild(fallback);
      }
    }, 200);

    throw err;
  }
}

/**
 * Sanitizes unsafe XML/SVG characters
 */
function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case "'":
        return '&apos;';
      case '"':
        return '&quot;';
      default:
        return c;
    }
  });
}

/**
 * Formats or generates standalone SVG vector graphics with responsive viewport and title
 */
export function generateSvgVector(title: string, svgContent: string): string {
  const trimmed = svgContent.trim();
  const safeTitle = escapeXml(title || 'Ilustração Vetorial');

  if (/^<svg[\s>]/i.test(trimmed)) {
    let result = trimmed;
    if (!result.includes('xmlns=')) {
      result = result.replace(/^<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!result.includes('<title>') && !result.includes('<title/>')) {
      result = result.replace(/(<svg[^>]*>)/i, `$1\n  <title>${safeTitle}</title>`);
    }
    return result;
  }

  // Wraps inner vector paths or elements into an aesthetic dark mode SVG container
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="100%" height="100%" role="img" aria-label="${safeTitle}">
  <title>${safeTitle}</title>
  <defs>
    <linearGradient id="vectorBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <pattern id="vectorGrid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255, 255, 255, 0.04)" stroke-width="1" />
    </pattern>
    <filter id="vectorGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="8" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="url(#vectorBgGrad)" stroke="rgba(255, 255, 255, 0.1)" stroke-width="1" />
  <rect width="100%" height="100%" rx="12" fill="url(#vectorGrid)" />
  <g class="vector-content">
    ${trimmed}
  </g>
</svg>`;
}

/**
 * Creates an aesthetic dark mode vector fallback illustration as an SVG string
 */
export function createFallbackVectorSvg(title: string, subtitle?: string, category?: string): string {
  const safeTitle = escapeXml(title || 'Ilustração Conceitual');
  const safeSubtitle = escapeXml(subtitle || 'Gráfico vetorial renderizado localmente');
  const safeCategory = escapeXml((category || 'VETOR').toUpperCase());

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 480" width="100%" height="100%" role="img" aria-label="${safeTitle}">
  <title>${safeTitle}</title>
  <defs>
    <linearGradient id="cardBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b0f19" />
      <stop offset="50%" stop-color="#131d31" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <radialGradient id="cardGlow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
    </radialGradient>
    <pattern id="cardPattern" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255, 255, 255, 0.03)" stroke-width="1" />
    </pattern>
  </defs>

  <rect width="100%" height="100%" rx="16" fill="url(#cardBg)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" />
  <rect width="100%" height="100%" rx="16" fill="url(#cardPattern)" />
  <circle cx="400" cy="190" r="180" fill="url(#cardGlow)" />

  <!-- Geometria visual central -->
  <g stroke="rgba(255, 255, 255, 0.15)" fill="none" stroke-width="1.5">
    <circle cx="400" cy="190" r="100" stroke-dasharray="4 6" />
    <circle cx="400" cy="190" r="140" stroke-dasharray="2 8" />
    <polygon points="400,120 460,225 340,225" stroke="#38bdf8" stroke-width="2" fill="rgba(56, 189, 248, 0.08)" />
    <circle cx="400" cy="190" r="24" fill="#38bdf8" opacity="0.9" />
    <circle cx="400" cy="190" r="8" fill="#ffffff" />
  </g>

  <!-- Tag de Categoria -->
  <g transform="translate(400, 330)">
    <rect x="-65" y="-13" width="130" height="26" rx="13" fill="rgba(59, 130, 246, 0.15)" stroke="rgba(59, 130, 246, 0.4)" stroke-width="1" />
    <text text-anchor="middle" y="5" fill="#93c5fd" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="700" letter-spacing="1.5">${safeCategory}</text>
  </g>

  <!-- Tipografia Editorial -->
  <text x="400" y="385" text-anchor="middle" fill="#f8fafc" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="20" font-weight="700">${safeTitle}</text>
  <text x="400" y="415" text-anchor="middle" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13">${safeSubtitle}</text>
</svg>`;
}

/**
 * Converts raw SVG code into a data URL ready for image elements
 */
export function convertSvgToDataUrl(svgString: string): string {
  const encoded = encodeURIComponent(svgString)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * Complete Image Generation Engine implementing IImageEngine
 */
export class ImageEngine implements IImageEngine {
  /**
   * Builds an optimized descriptor and URL for image generation
   */
  buildImageUrl(options: ImageGenerationOptions): ImageUrlDescriptor {
    const stylePreset: ImageStylePreset = options.stylePreset || 'digital_art';
    const aspectRatio: ImageAspectRatio =
      options.aspectRatio || STYLE_PRESETS[stylePreset]?.recommendedAspectRatio || '16:9';

    const { width, height } = calculateDimensions(aspectRatio, options.width, options.height);
    const enhancedPrompt = enhancePrompt(options.prompt, stylePreset);
    const url = buildPollinationsUrl(enhancedPrompt, width, height, options.seed);

    return {
      url,
      prompt: enhancedPrompt,
      width,
      height,
      stylePreset,
    };
  }

  /**
   * Downloads an image directly as a JPEG file via Blob fetching
   */
  async downloadImage(imageUrl: string, filename?: string): Promise<void> {
    return downloadImage(imageUrl, filename);
  }

  /**
   * Generates or standardizes an SVG vector graphic
   */
  generateSvgVector(title: string, svgContent: string): string {
    return generateSvgVector(title, svgContent);
  }
}

/**
 * Default singleton instance of ImageEngine
 */
export const imageEngine = new ImageEngine();
export default imageEngine;
