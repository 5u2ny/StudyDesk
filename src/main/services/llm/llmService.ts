import { focusStore } from '../store';
import { secureStore } from '../keychain/secureStore';

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function callLLM(messages: LLMMessage[]): Promise<string> {
  const settings = focusStore.getSettings();

  // Local Ollama — no API key required
  if (settings.aiMode === 'local_server') {
    const endpoint = settings.ollamaEndpoint ?? 'http://localhost:11434';
    const model = settings.ollamaModel ?? 'gemma4:latest';
    const res = await fetch(`${endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false }),
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.error ?? `Ollama error (${res.status})`);
    return data.message.content;
  }

  // Cloud providers require an API key
  if (!settings.llmProvider || !settings.llmApiKeyEncrypted) {
    throw new Error('LLM not configured — set an API key in Settings');
  }

  const apiKey = secureStore.decrypt(settings.llmApiKeyEncrypted);
  const model  = settings.llmModel ?? defaultModel(settings.llmProvider);

  if (settings.llmProvider === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: messages.find(m => m.role === 'system')?.content,
        messages: messages.filter(m => m.role !== 'system'),
      }),
    });
    const data = await res.json() as any;
    if (!res.ok) throw new Error(data.error?.message ?? 'Anthropic API error');
    return data.content[0].text;
  }

  // OpenAI
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data.error?.message ?? 'OpenAI API error');
  return data.choices[0].message.content;
}

function defaultModel(provider: 'anthropic' | 'openai'): string {
  return provider === 'anthropic' ? 'claude-sonnet-4-6' : 'gpt-4o-mini';
}
