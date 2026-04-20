import OpenAI from "openai";

let _client: OpenAI | null = null;
let _adminClient: OpenAI | null = null;

export function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export function openaiAdmin(): OpenAI {
  if (!process.env.OPENAI_ADMIN_KEY) {
    throw new Error("OPENAI_ADMIN_KEY not set — required for /v1/organization/* endpoints");
  }
  if (!_adminClient) {
    _adminClient = new OpenAI({ apiKey: process.env.OPENAI_ADMIN_KEY });
  }
  return _adminClient;
}

export function hasAdminKey(): boolean {
  return Boolean(process.env.OPENAI_ADMIN_KEY);
}

export const USAGE_TYPES = [
  "completions",
  "embeddings",
  "moderations",
  "images",
  "audio_speeches",
  "audio_transcriptions",
  "vector_stores",
  "code_interpreter_sessions",
] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

export const RUNNING_BATCH_STATUSES = new Set([
  "validating",
  "in_progress",
  "finalizing",
]);

export const RESTARTABLE_BATCH_STATUSES = new Set([
  "completed",
  "failed",
  "expired",
  "cancelled",
]);
