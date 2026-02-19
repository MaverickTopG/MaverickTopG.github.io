import { useEffect, useMemo, useRef, useState } from 'react';
import { createNebulaeModel, getContextCapForTier, safeParseJson, saveInsightContext, trimToCap } from '../lib/nebulaeAi';
import type { AiInsightSection } from '../components/AiInsightWidget';

type InsightResult = {
  summary: string;
  sections: AiInsightSection[];
};

type UseGeminiInsightArgs = {
  enabled: boolean;
  planTier: string;
  pageKey: string;
  sourceData: Record<string, unknown>;
  fallback: InsightResult;
  minIntervalMs?: number;
};

const DEFAULT_MIN_INTERVAL = 25000;

export const useGeminiInsight = ({
  enabled,
  planTier,
  pageKey,
  sourceData,
  fallback,
  minIntervalMs = DEFAULT_MIN_INTERVAL,
}: UseGeminiInsightArgs) => {
  const [insight, setInsight] = useState<InsightResult>(fallback);
  const [loading, setLoading] = useState(false);
  const lastSignatureRef = useRef<string>('');
  const lastRunRef = useRef<number>(0);
  const debounceRef = useRef<number | null>(null);
  const requestIdRef = useRef<number>(0);

  const signature = useMemo(() => {
    try {
      return JSON.stringify(sourceData);
    } catch {
      return String(Date.now());
    }
  }, [sourceData]);

  useEffect(() => {
    if (!enabled) {
      setInsight(fallback);
      return;
    }
    if (!signature || signature === lastSignatureRef.current) return;
    lastSignatureRef.current = signature;
    setInsight(fallback);
    saveInsightContext(pageKey, fallback);

    const now = Date.now();
    const delay = Math.max(400, minIntervalMs - (now - lastRunRef.current));
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
    debounceRef.current = window.setTimeout(async () => {
      setLoading(true);
      const reqId = ++requestIdRef.current;
      try {
        const cap = getContextCapForTier(planTier);
        const promptData = trimToCap(JSON.stringify(sourceData), Math.floor(cap * 0.45));
        const prompt = `Return JSON ONLY, no markdown.
Schema:
{"summary":"", "sections":[{"title":"","items":[{"label":"","value":"","tone":"alert|warning|ok|info","helper":""}]}]}
Rules:
- Summary <= 120 chars.
- Max 3 sections.
- Each section max 3 items.
- label <= 26 chars, value <= 10 chars, helper <= 32 chars.
- Use short, punchy language.
Data:
${promptData}`;

        const model = createNebulaeModel(false);
        const response = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 600,
            temperature: 0.4,
          },
        });

        const text = response.response.text();
        const parsed = safeParseJson(text);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Invalid AI response');
        }

        const rawSections = Array.isArray((parsed as any).sections) ? (parsed as any).sections : [];
        const normalized: InsightResult = {
          summary: String((parsed as any).summary || fallback.summary).slice(0, 140),
          sections: rawSections.slice(0, 3).map((section: any) => ({
            title: String(section.title || '').slice(0, 32),
            items: Array.isArray(section.items)
              ? section.items.slice(0, 3).map((item: any) => ({
                  label: String(item.label || '').slice(0, 26),
                  value: item.value ? String(item.value).slice(0, 10) : undefined,
                  tone: item.tone || 'info',
                  helper: item.helper ? String(item.helper).slice(0, 32) : undefined,
                }))
              : [],
          })),
        };

        if (reqId === requestIdRef.current) {
          setInsight(normalized);
          saveInsightContext(pageKey, normalized);
          lastRunRef.current = Date.now();
        }
      } catch (error) {
        if (reqId === requestIdRef.current) {
          setInsight(fallback);
          lastRunRef.current = Date.now();
        }
      } finally {
        if (reqId === requestIdRef.current) {
          setLoading(false);
        }
      }
    }, delay);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [enabled, fallback, minIntervalMs, planTier, signature]);

  return { insight, loading };
};
