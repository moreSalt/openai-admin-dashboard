import OpenAI from "openai";

let _client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  if (!_client) {
    _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _client;
}

export const RUNNING_BATCH_STATUSES = new Set([
  "validating",
  "in_progress",
  "finalizing",
]);
