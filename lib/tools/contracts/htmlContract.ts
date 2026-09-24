export type DeviceViewport = 'desktop' | 'tablet' | 'mobile';

export interface ViewportConfig {
  id: DeviceViewport;
  label: string;
  width: string;
  height: string;
  icon: string;
}

export interface HtmlSandboxOptions {
  title?: string;
  injectTailwind?: boolean;
  viewport?: DeviceViewport;
  enableScripts?: boolean;
}

export interface IHtmlSandboxEngine {
  prepareSandboxHtml(rawHtml: string, options?: HtmlSandboxOptions): string;
  openInFullscreenTab(rawHtml: string, title?: string): void;
  downloadHtmlFile(rawHtml: string, filename?: string): void;
}
