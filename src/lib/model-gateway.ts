import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import yaml from 'js-yaml';
import { db } from '@/db';
import { inferenceRecords } from '@/db/schema';

// ── Types ─────────────────────────────────────────────────────────────────────

type UseCase = 'avatar_session' | 'artifact_grading' | 'session_summary' | 'feedback_analysis';
type ProviderKey = 'anthropic' | 'openai' | 'ollama' | 'kokoro' | 'elevenlabs';

interface RouteConfig {
  primary: string;
  local?: string;
  local_fallback?: string;
  fallback: string;
  max_tokens: number;
  temperature: number;
}

interface RoutingConfig {
  routing: Record<UseCase, RouteConfig>;
  tts: {
    default_provider: string;
    local_provider: string;
    fallback_provider: string;
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  useCase: UseCase;
  systemPrompt: string;
  messages: ChatMessage[];
  programId: string;
  programLearnerId?: string;
}

export interface CompletionParams {
  useCase: UseCase;
  systemPrompt: string;
  userPrompt: string;
  programId: string;
  programLearnerId?: string;
}

export interface TTSParams {
  text: string;
  voiceId: string;              // provider-specific voice ID
  provider?: ProviderKey;       // override; defaults to routing config
}

// ── Config loading ────────────────────────────────────────────────────────────

function loadRoutingConfig(): RoutingConfig {
  const configPath = path.join(process.cwd(), 'platform-config', 'model-routing.yml');
  return yaml.load(fs.readFileSync(configPath, 'utf-8')) as RoutingConfig;
}

function parseProviderModel(str: string): { provider: ProviderKey; model: string } {
  const slashIdx = str.indexOf('/');
  const provider = str.slice(0, slashIdx) as ProviderKey;
  const model = str.slice(slashIdx + 1);
  return { provider, model };
}

// Use local models when USE_LOCAL_MODELS=true or PLATFORM_ENV=local
const USE_LOCAL = process.env.USE_LOCAL_MODELS === 'true'
  || process.env.PLATFORM_ENV === 'local';

// ── Client factories ──────────────────────────────────────────────────────────

function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// Ollama exposes an OpenAI-compatible API — use the OpenAI SDK with a custom base URL.
function getOllamaClient(): OpenAI {
  return new OpenAI({
    baseURL: process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434/v1',
    apiKey: 'ollama',  // Ollama does not validate the key; value is required by the SDK
  });
}

function getOpenAIClient(): OpenAI {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ── Streaming chat ────────────────────────────────────────────────────────────

export async function* streamChat(params: ChatParams): AsyncIterable<string> {
  const config = loadRoutingConfig();
  const route = config.routing[params.useCase];

  const providerModelStr = USE_LOCAL && route.local ? route.local : route.primary;
  const { provider, model } = parseProviderModel(providerModelStr);

  const startMs = Date.now();
  let inputTokens = 0;
  let outputTokens = 0;
  let fullText = '';

  try {
    if (provider === 'anthropic') {
      const client = getAnthropicClient();
      const stream = client.messages.stream({
        model,
        max_tokens: route.max_tokens,
        temperature: route.temperature,
        system: params.systemPrompt,
        messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          fullText += chunk.delta.text;
          yield chunk.delta.text;
        }
        if (chunk.type === 'message_start') {
          inputTokens = chunk.message.usage.input_tokens;
        }
        if (chunk.type === 'message_delta') {
          outputTokens = chunk.usage.output_tokens;
        }
      }
    } else if (provider === 'ollama') {
      const client = getOllamaClient();
      const stream = await client.chat.completions.create({
        model,
        max_tokens: route.max_tokens,
        temperature: route.temperature,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
      });
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? '';
        if (text) { fullText += text; yield text; }
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
        }
      }
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  } catch (err) {
    // Attempt fallback provider
    if (!USE_LOCAL) {
      const fallback = parseProviderModel(route.fallback);
      console.warn(`Primary provider ${provider}/${model} failed, falling back to ${route.fallback}`);
      yield* streamChatWithProvider(fallback.provider, fallback.model, route, params);
      return;
    }
    // Local fallback
    if (route.local_fallback) {
      const fallback = parseProviderModel(route.local_fallback);
      console.warn(`Local primary failed, falling back to ${route.local_fallback}`);
      yield* streamChatWithProvider(fallback.provider, fallback.model, route, params);
      return;
    }
    throw err;
  } finally {
    await recordInference({
      programId: params.programId,
      programLearnerId: params.programLearnerId,
      useCase: params.useCase,
      provider,
      model,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - startMs,
    });
  }
}

async function* streamChatWithProvider(
  provider: ProviderKey,
  model: string,
  route: RouteConfig,
  params: ChatParams,
): AsyncIterable<string> {
  if (provider === 'anthropic') {
    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model, max_tokens: route.max_tokens, temperature: route.temperature,
      system: params.systemPrompt,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    });
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') yield chunk.delta.text;
    }
  } else if (provider === 'ollama') {
    const client = getOllamaClient();
    const stream = await client.chat.completions.create({
      model, max_tokens: route.max_tokens, temperature: route.temperature,
      messages: [{ role: 'system', content: params.systemPrompt }, ...params.messages],
      stream: true,
    });
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content ?? '';
      if (text) yield text;
    }
  }
}

// ── Single-turn completion ────────────────────────────────────────────────────

export async function complete(params: CompletionParams): Promise<string> {
  const config = loadRoutingConfig();
  const route = config.routing[params.useCase];
  const providerModelStr = USE_LOCAL && route.local ? route.local : route.primary;
  const { provider, model } = parseProviderModel(providerModelStr);

  const startMs = Date.now();
  let result = '';

  try {
    if (provider === 'anthropic') {
      const client = getAnthropicClient();
      const response = await client.messages.create({
        model, max_tokens: route.max_tokens, temperature: route.temperature,
        system: params.systemPrompt,
        messages: [{ role: 'user', content: params.userPrompt }],
      });
      const block = response.content[0];
      result = block.type === 'text' ? block.text : '';
    } else if (provider === 'ollama') {
      const client = getOllamaClient();
      const response = await client.chat.completions.create({
        model, max_tokens: route.max_tokens, temperature: route.temperature,
        messages: [
          { role: 'system', content: params.systemPrompt },
          { role: 'user', content: params.userPrompt },
        ],
      });
      result = response.choices[0]?.message?.content ?? '';
    }
  } finally {
    await recordInference({
      programId: params.programId,
      programLearnerId: params.programLearnerId,
      useCase: params.useCase,
      provider,
      model,
      durationMs: Date.now() - startMs,
    });
  }

  return result;
}

// ── TTS synthesis ─────────────────────────────────────────────────────────────

export async function* synthesize(params: TTSParams): AsyncIterable<Buffer> {
  const config = loadRoutingConfig();
  const providerKey = params.provider
    ?? (USE_LOCAL ? config.tts.local_provider : config.tts.default_provider) as ProviderKey;

  const startMs = Date.now();

  if (providerKey === 'openai') {
    const client = getOpenAIClient();
    const response = await client.audio.speech.create({
      model: 'tts-1',
      voice: params.voiceId as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
      input: params.text,
      response_format: 'opus',   // low-latency streaming format
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    yield buffer;

  } else if (providerKey === 'kokoro') {
    // Kokoro runs as a Python FastAPI sidecar with an OpenAI-compatible /v1/audio/speech endpoint
    const endpoint = process.env.KOKORO_ENDPOINT ?? 'http://localhost:8880';
    const response = await fetch(`${endpoint}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: params.text,
        voice: params.voiceId,
        response_format: 'wav',
      }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Kokoro TTS failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }

  } else if (providerKey === 'elevenlabs') {
    const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}/stream`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: params.text, model_id: 'eleven_multilingual_v2' }),
    });
    if (!response.ok || !response.body) {
      throw new Error(`ElevenLabs TTS failed: ${response.status}`);
    }
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }

  await recordInference({
    programId: 'platform',
    useCase: 'avatar_session',
    provider: providerKey,
    model: 'tts',
    durationMs: Date.now() - startMs,
  });
}

// ── Health check ──────────────────────────────────────────────────────────────

export async function healthCheck(): Promise<Record<ProviderKey, boolean>> {
  const results: Partial<Record<ProviderKey, boolean>> = {};

  // Anthropic
  try {
    const client = getAnthropicClient();
    await client.messages.create({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1,
      messages: [{ role: 'user', content: 'hi' }],
    });
    results.anthropic = true;
  } catch { results.anthropic = false; }

  // Ollama
  try {
    const endpoint = process.env.OLLAMA_ENDPOINT ?? 'http://localhost:11434';
    const r = await fetch(`${endpoint.replace('/v1', '')}/api/tags`, { signal: AbortSignal.timeout(3000) });
    results.ollama = r.ok;
  } catch { results.ollama = false; }

  // Kokoro
  try {
    const endpoint = process.env.KOKORO_ENDPOINT ?? 'http://localhost:8880';
    const r = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(3000) });
    results.kokoro = r.ok;
  } catch { results.kokoro = false; }

  return results as Record<ProviderKey, boolean>;
}

// ── Cost tracking ─────────────────────────────────────────────────────────────

async function recordInference(params: {
  programId: string;
  programLearnerId?: string;
  useCase: string;
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  audioSeconds?: number;
  durationMs: number;
}): Promise<void> {
  try {
    const cost = estimateCost(params.provider, params.model, params.inputTokens, params.outputTokens);
    await db.insert(inferenceRecords).values({
      programId: params.programId,
      programLearnerId: params.programLearnerId,
      useCase: params.useCase,
      provider: params.provider,
      model: params.model,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsdEstimate: cost?.toString(),
      durationMs: params.durationMs,
      cached: false,
    });
  } catch {
    // Cost tracking failure must never affect the primary flow
  }
}

function estimateCost(
  provider: string,
  model: string,
  inputTokens?: number,
  outputTokens?: number,
): number | null {
  if (provider === 'ollama') return 0;  // local = free

  // Approximate pricing per million tokens (May 2026)
  const pricing: Record<string, { input: number; output: number }> = {
    'claude-opus-4-7':             { input: 15.00, output: 75.00 },
    'claude-sonnet-4-6':           { input: 3.00,  output: 15.00 },
    'claude-haiku-4-5-20251001':   { input: 0.80,  output: 4.00  },
  };

  const p = pricing[model];
  if (!p || !inputTokens || !outputTokens) return null;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}
