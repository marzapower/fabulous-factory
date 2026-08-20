import DEFAULT_PRICING_JSON from "../pricing.json";

export interface ModelPricing {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
}

export type PricingConfig = Record<string, ModelPricing>;

export const DEFAULT_PRICING: PricingConfig = DEFAULT_PRICING_JSON;

/**
 * Estimates the USD cost (in cents) of a call, given known per-1M-token prices (plan
 * F.2.6/F.2.7/F.10.7). Pure. Returns `null` — never `0` or `NaN` — when the model has no
 * `pricing.json` entry, or when either token count is `undefined` (no usage numbers yet,
 * e.g. the pre-call budget estimate for an unmeasured call, or a provider that omitted
 * usage). Callers map a `null` result to `cost_source: 'unknown'` (F.10.7).
 *
 * No rounding beyond ordinary floating-point math — the `cost_cents` column stores 6
 * decimal places (`numeric(14, 6)`), so sub-cent precision is preserved on write.
 */
export function estimateCostCents(
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  pricing: PricingConfig = DEFAULT_PRICING,
): number | null {
  const modelPricing = pricing[model];
  if (!modelPricing) return null;
  if (inputTokens === undefined || outputTokens === undefined) return null;

  const usd =
    inputTokens * modelPricing.inputUsdPerMTok + outputTokens * modelPricing.outputUsdPerMTok;
  return (usd / 1_000_000) * 100;
}
