// Batch API pricing per 1M tokens: [input, cached_input, output]
const BATCH_PRICING: Record<string, [number, number | null, number]> = {
  "gpt-5.4":                  [1.25,   0.13,   7.50],
  "gpt-5.4-mini":             [0.375,  0.0375, 2.25],
  "gpt-5.4-nano":             [0.10,   0.01,   0.625],
  "gpt-5.4-pro":              [15.00,  null,   90.00],
  "gpt-5.2":                  [0.875,  0.0875, 7.00],
  "gpt-5.2-pro":              [10.50,  null,   84.00],
  "gpt-5.1":                  [0.625,  0.0625, 5.00],
  "gpt-5":                    [0.625,  0.0625, 5.00],
  "gpt-5-mini":               [0.125,  0.0125, 1.00],
  "gpt-5-nano":               [0.025,  0.0025, 0.20],
  "gpt-5-pro":                [7.50,   null,   60.00],
  "gpt-4.1":                  [1.00,   null,   4.00],
  "gpt-4.1-mini":             [0.20,   null,   0.80],
  "gpt-4.1-nano":             [0.05,   null,   0.20],
  "gpt-4o":                   [1.25,   null,   5.00],
  "gpt-4o-mini":              [0.075,  null,   0.30],
  "o4-mini":                  [0.55,   null,   2.20],
  "o3":                       [1.00,   null,   4.00],
  "o3-mini":                  [0.55,   null,   2.20],
  "o3-pro":                   [10.00,  null,   40.00],
  "o1":                       [7.50,   null,   30.00],
  "o1-mini":                  [0.55,   null,   2.20],
  "o1-pro":                   [75.00,  null,   300.00],
  "gpt-4o-2024-05-13":        [2.50,   null,   7.50],
  "gpt-4-turbo-2024-04-09":   [5.00,   null,   15.00],
  "gpt-4-0125-preview":       [5.00,   null,   15.00],
  "gpt-4-1106-preview":       [5.00,   null,   15.00],
  "gpt-4-1106-vision-preview":[5.00,   null,   15.00],
  "gpt-4-0613":               [15.00,  null,   30.00],
  "gpt-4-0314":               [15.00,  null,   30.00],
  "gpt-4-32k":                [30.00,  null,   60.00],
  "gpt-3.5-turbo-0125":       [0.25,   null,   0.75],
  "gpt-3.5-turbo-1106":       [1.00,   null,   2.00],
  "gpt-3.5-turbo-0613":       [1.50,   null,   2.00],
  "gpt-3.5-0301":             [1.50,   null,   2.00],
  "gpt-3.5-turbo-16k-0613":   [1.50,   null,   2.00],
  "davinci-002":              [1.00,   null,   1.00],
  "babbage-002":              [0.20,   null,   0.20],
};

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  input_tokens_details?: { cached_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
};

export type CostBreakdown = {
  inputCost: number;
  cachedCost: number;
  outputCost: number;
  total: number;
  hasCachedRate: boolean;
};

function getPricing(model: string) {
  if (BATCH_PRICING[model]) return BATCH_PRICING[model];
  const keys = Object.keys(BATCH_PRICING).sort((a, b) => b.length - a.length);
  const match = keys.find(k => model.startsWith(k));
  return match ? BATCH_PRICING[match] : null;
}

export function estimateCost(usage: Usage, model: string): CostBreakdown | null {
  const pricing = getPricing(model);
  if (!pricing) return null;
  const [inputRate, cachedRate, outputRate] = pricing;
  const cached = usage.input_tokens_details?.cached_tokens ?? 0;
  const nonCached = usage.input_tokens - cached;
  const inputCost = (nonCached / 1_000_000) * inputRate;
  const cachedCost = (cached / 1_000_000) * (cachedRate ?? inputRate);
  const outputCost = (usage.output_tokens / 1_000_000) * outputRate;
  return { inputCost, cachedCost, outputCost, total: inputCost + cachedCost + outputCost, hasCachedRate: cachedRate != null };
}
