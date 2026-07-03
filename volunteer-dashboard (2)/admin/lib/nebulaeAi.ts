import { GoogleGenerativeAI } from '@google/generative-ai';

export const NEBULAE_MODEL_ID = 'gemini-2.5-flash-lite';
const NEBULAE_API_KEY = 'AIzaSyCX9iZt_rDr0B1jQu-pqhGHiQm3avmDt6o';
const NEBULA_CONTEXT_BASE_CHARS = 12000;
const COSMOS_CONTEXT_MULTIPLIER = 1.3;
const INSIGHT_CONTEXT_KEY = 'nexolink:ai-insight-context';

export const getContextCapForTier = () => Math.round(NEBULA_CONTEXT_BASE_CHARS * COSMOS_CONTEXT_MULTIPLIER);

export const createNebulaeModel = (withSearch = false) => {
  const genAI = new GoogleGenerativeAI(NEBULAE_API_KEY);
  return genAI.getGenerativeModel({
    model: NEBULAE_MODEL_ID,
    tools: withSearch ? [{ googleSearch: {} as any }] : undefined,
  });
};

export const trimToCap = (value: string, cap: number) => {
  if (!value) return '';
  if (value.length <= cap) return value;
  return value.slice(value.length - cap);
};

export const safeParseJson = (raw: string) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
};

export const loadInsightContext = () => {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(INSIGHT_CONTEXT_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

export const saveInsightContext = (pageKey: string, payload: {
  summary: string;
  sections: Array<{ title: string; items: Array<{ label: string; value?: string }> }>;
  updatedAt?: number;
}) => {
  if (typeof window === 'undefined') return;
  const existing = loadInsightContext();
  const slimItems = payload.sections
    .flatMap((section) => section.items.map((item) => ({
      label: item.label,
      value: item.value,
    })))
    .slice(0, 8);
  const updated = {
    ...existing,
    [pageKey]: {
      summary: payload.summary,
      items: slimItems,
      updatedAt: payload.updatedAt || Date.now(),
    },
  };
  window.localStorage.setItem(INSIGHT_CONTEXT_KEY, JSON.stringify(updated));
};

export const buildInsightContextText = (cap: number) => {
  const context = loadInsightContext();
  const pages = Object.entries(context)
    .filter(([, value]) => value && typeof value === 'object')
    .map(([key, value]) => {
      const summary = (value as any).summary || '';
      const items = Array.isArray((value as any).items)
        ? (value as any).items
            .map((item: any) => `${item.label}${item.value ? `:${item.value}` : ''}`)
            .join(', ')
        : '';
      return `${key.toUpperCase()}: ${summary}${items ? ` | ${items}` : ''}`;
    })
    .join('\n');
  return trimToCap(pages, cap);
};
