export type ImageStylePreset =
  | 'scientific'
  | 'photorealistic'
  | 'digital_art'
  | 'infographic'
  | 'minimalist_vector';

export type ImageAspectRatio = '1:1' | '16:9' | '4:3' | '9:16';

export interface ImageGenerationOptions {
  prompt: string;
  stylePreset?: ImageStylePreset;
  aspectRatio?: ImageAspectRatio;
  seed?: number;
  width?: number;
  height?: number;
}

export interface ImageUrlDescriptor {
  url: string;
  prompt: string;
  width: number;
  height: number;
  stylePreset: ImageStylePreset;
}

export interface IImageEngine {
  buildImageUrl(options: ImageGenerationOptions): ImageUrlDescriptor;
  downloadImage(imageUrl: string, filename?: string): Promise<void>;
  generateSvgVector?(title: string, svgContent: string): string;
}
