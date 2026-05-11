import { callLLM, type LLMMessage } from './llmService';
import { QUIZ_GENERATE_SYSTEM, FLASHCARD_GENERATE_SYSTEM, NOTES_GENERATE_SYSTEM } from './prompts';
import { focusStore } from '../store';

export interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

export interface GeneratedFlashcard {
  front: string;
  back: string;
}

export async function generateQuiz(noteContent: string, count?: number): Promise<QuizQuestion[]> {
  const settings = focusStore.getSettings();
  if (settings.aiMode === 'disabled') throw new Error('AI is disabled in settings');

  const n = count ?? 5;
  // gemma4 has 128k context — use up to 12k chars for better quiz coverage
  const trimmed = noteContent.slice(0, 12000);
  const messages: LLMMessage[] = [
    { role: 'system', content: QUIZ_GENERATE_SYSTEM },
    { role: 'user', content: `Generate ${n} quiz questions from these notes:\n\n${trimmed}` },
  ];
  const raw = await callLLM(messages);
  try {
    return JSON.parse(extractJSON(raw));
  } catch {
    // Retry with a more explicit prompt on JSON failure
    const retryMessages: LLMMessage[] = [
      { role: 'system', content: 'You output ONLY valid JSON arrays. No other text.' },
      { role: 'user', content: `Generate ${Math.min(n, 3)} quiz questions as JSON.\nFormat: [{"question":"...","options":["A","B","C","D"],"correct":0,"explanation":"..."}]\n\nNotes:\n${trimmed.slice(0, 6000)}` },
    ];
    const retry = await callLLM(retryMessages);
    return JSON.parse(extractJSON(retry));
  }
}

export async function generateFlashcards(noteContent: string, count?: number): Promise<GeneratedFlashcard[]> {
  const settings = focusStore.getSettings();
  if (settings.aiMode === 'disabled') throw new Error('AI is disabled in settings');

  const n = count ?? 10;
  // gemma4 has 128k context — use up to 12k chars for richer flashcards
  const trimmed = noteContent.slice(0, 12000);
  const messages: LLMMessage[] = [
    { role: 'system', content: FLASHCARD_GENERATE_SYSTEM },
    { role: 'user', content: `Generate ${n} flashcards from these notes:\n\n${trimmed}` },
  ];
  const raw = await callLLM(messages);
  try {
    return JSON.parse(extractJSON(raw));
  } catch {
    const retryMessages: LLMMessage[] = [
      { role: 'system', content: 'You output ONLY valid JSON arrays. No other text.' },
      { role: 'user', content: `Generate ${Math.min(n, 5)} flashcards as JSON.\nFormat: [{"front":"...","back":"..."}]\n\nNotes:\n${trimmed.slice(0, 6000)}` },
    ];
    const retry = await callLLM(retryMessages);
    return JSON.parse(extractJSON(retry));
  }
}

export async function generateStudyNotes(noteContent: string): Promise<string> {
  const settings = focusStore.getSettings();
  if (settings.aiMode === 'disabled') throw new Error('AI is disabled in settings');

  const messages: LLMMessage[] = [
    { role: 'system', content: NOTES_GENERATE_SYSTEM },
    { role: 'user', content: `Reorganize these notes into clean study notes:\n\n${noteContent}` },
  ];
  return callLLM(messages);
}

export async function summarizeContent(content: string, maxLength?: number): Promise<string> {
  const settings = focusStore.getSettings();
  if (settings.aiMode === 'disabled') throw new Error('AI is disabled in settings');

  const lengthHint = maxLength ? ` Keep the summary under ${maxLength} words.` : '';
  const messages: LLMMessage[] = [
    { role: 'system', content: `You are a study assistant. Summarize the following content concisely, preserving key concepts, definitions, and important details.${lengthHint} Use bullet points for clarity.` },
    { role: 'user', content: content.slice(0, 24000) }, // gemma4 128k context — allow longer content
  ];
  return callLLM(messages);
}

/** Extract JSON from a response that might have markdown fences or conversational preamble. */
function extractJSON(raw: string): string {
  // 1. Fenced code block
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  // 2. Raw JSON array
  const bracket = raw.match(/\[[\s\S]*\]/);
  if (bracket) return bracket[0];
  // 3. Raw JSON object (single item — wrap in array)
  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) {
    const candidate = obj[0];
    try { const parsed = JSON.parse(candidate); return Array.isArray(parsed) ? candidate : `[${candidate}]`; } catch { /* fall through */ }
  }
  return raw;
}

export async function checkOllamaHealth(endpoint?: string): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  const url = endpoint ?? 'http://localhost:11434';
  try {
    const res = await fetch(`${url}/api/tags`);
    if (!res.ok) return { ok: false, error: `Ollama returned ${res.status}` };
    const data = await res.json() as any;
    const models = (data.models ?? []).map((m: any) => m.name as string);
    return { ok: true, models };
  } catch (e: any) {
    return { ok: false, error: e.message ?? 'Cannot reach Ollama' };
  }
}
