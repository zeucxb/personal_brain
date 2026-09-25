/**
 * Vision Helper for Ollama Multimodal Processing
 * Handles model discovery, base64 payload extraction, and streaming visual question answering.
 */

export type VisionStreamChunk = {
  text: string;
};

export function extractCleanBase64(dataUriOrBase64: string): string {
  if (!dataUriOrBase64) return '';
  const commaIdx = dataUriOrBase64.indexOf(',');
  if (commaIdx !== -1) {
    return dataUriOrBase64.slice(commaIdx + 1).trim();
  }
  return dataUriOrBase64.trim();
}

/**
 * Discovers the best installed vision model in Ollama.
 * Falls back to llava:7b or moondream.
 */
export async function getBestAvailableVisionModel(baseUrl = 'http://localhost:11434'): Promise<string> {
  const envModel = process.env.OLLAMA_VISION_MODEL;
  if (envModel) return envModel;

  try {
    const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
    if (res.ok) {
      const data = await res.json();
      const models: string[] = (data.models || []).map((m: any) => m.name || m.model || '');

      // Check models in priority order of compatibility
      const candidates = [
        'llava:7b',
        'llava:latest',
        'moondream:latest',
        'moondream',
        'qwen2-vl:7b',
        'llama3.2-vision:11b',
        'llama3.2-vision:latest',
      ];

      for (const candidate of candidates) {
        if (models.some((m) => m === candidate || m.startsWith(candidate.split(':')[0]))) {
          return candidate;
        }
      }
    }
  } catch (err) {
    console.warn('Could not query Ollama models list, using default vision model:', err);
  }

  return 'llava:7b';
}

export interface StreamOllamaVisionOptions {
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
  userPrompt: string;
  images: string[]; // pure base64 strings
  previousMessages?: { role: 'user' | 'assistant'; content: string }[];
  onToken: (text: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

/**
 * Streams visual analysis from Ollama /api/chat
 */
export async function streamOllamaVision(options: StreamOllamaVisionOptions): Promise<void> {
  const {
    model = 'llava:7b',
    baseUrl = 'http://localhost:11434',
    systemPrompt,
    userPrompt,
    images,
    previousMessages = [],
    onToken,
    onDone,
    onError,
  } = options;

  const ollamaMessages: any[] = [];

  if (systemPrompt && systemPrompt.trim()) {
    ollamaMessages.push({
      role: 'system',
      content: systemPrompt.trim(),
    });
  }

  // Include recent conversation messages for conversational continuity
  for (const prev of previousMessages.slice(-6)) {
    ollamaMessages.push({
      role: prev.role,
      content: prev.content,
    });
  }

  // User message with attached image(s)
  ollamaMessages.push({
    role: 'user',
    content: userPrompt,
    images: images.map(extractCleanBase64),
  });

  try {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: ollamaMessages,
        stream: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama Vision API error (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('Ollama Vision response has no readable body stream');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const json = JSON.parse(trimmed);
          if (json.error) {
            throw new Error(json.error);
          }
          if (json.message && typeof json.message.content === 'string') {
            onToken(json.message.content);
          }
          if (json.done) {
            if (onDone) onDone();
            return;
          }
        } catch (e: any) {
          if (e.message && e.message.includes('Ollama Vision API error')) {
            throw e;
          }
          // Line parsing error, continue
        }
      }
    }

    if (onDone) onDone();
  } catch (err: any) {
    console.error('Error in streamOllamaVision:', err);
    if (onError) {
      onError(err);
    } else {
      throw err;
    }
  }
}
