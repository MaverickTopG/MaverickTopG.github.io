import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpRight, Sparkles } from 'lucide-react';

export type InsightTone = 'alert' | 'warning' | 'ok' | 'info';

export type AiInsightItem = {
  label: string;
  value?: string;
  tone?: InsightTone;
  helper?: string;
};

export type AiInsightSection = {
  title: string;
  description?: string;
  items: AiInsightItem[];
  footer?: string;
};

interface AiInsightWidgetProps {
  title: string;
  subtitle?: string;
  summary: string;
  sections: AiInsightSection[];
  pillLabel?: string;
  defaultOpen?: boolean;
  updatedLabel?: string;
  onOpenCopilot?: () => void;
  copilotPrompt?: string;
}

const toneStyles: Record<InsightTone, string> = {
  alert: 'bg-red-50 text-red-700 border-red-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  ok: 'bg-lime-50 text-lime-700 border-lime-100',
  info: 'bg-gray-50 text-gray-600 border-gray-100',
};

export const AiInsightWidget: React.FC<AiInsightWidgetProps> = ({
  title,
  subtitle,
  summary,
  sections,
  pillLabel = 'Open AI Summary',
  defaultOpen = false,
  updatedLabel = 'Live insights · Just updated',
  onOpenCopilot,
  copilotPrompt,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const [panelWidth, setPanelWidth] = useState(420);
  const [panelRight, setPanelRight] = useState(32);

  const sectionList = useMemo(() => sections.filter((section) => section.items.length > 0), [sections]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const measure = () => {
      const anchor = document.querySelector('[data-ai-anchor="right-panel"]');
      if (anchor instanceof HTMLElement) {
        const rect = anchor.getBoundingClientRect();
        const width = Math.max(280, Math.round(rect.width));
        const right = Math.max(16, Math.round(window.innerWidth - rect.right));
        setPanelWidth(width);
        setPanelRight(right);
        return;
      }
      setPanelWidth(420);
      setPanelRight(32);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [mounted]);

  if (!mounted) {
    return null;
  }

  const content = (
    <div
      className="fixed bottom-8 z-[1200] flex flex-col items-stretch gap-3 max-w-[calc(100vw-32px)]"
      style={{ right: panelRight, width: panelWidth }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="w-full rounded-[2rem] bg-white shadow-[0_30px_70px_rgba(0,0,0,0.2)] border border-gray-100 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gray-900 text-white flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{title}</div>
                  {subtitle && <div className="text-xs text-gray-500">{subtitle}</div>}
                </div>
              </div>
              <button
                onClick={() => {
                  if (copilotPrompt) {
                    window.sessionStorage.setItem('nexolink:nebulae-context', copilotPrompt);
                  }
                  if (onOpenCopilot) {
                    onOpenCopilot();
                  }
                  setOpen(false);
                }}
                className="w-9 h-9 rounded-full bg-gray-900 text-white hover:bg-black flex items-center justify-center transition-colors"
                aria-label="Open Nebulae AI"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <p className="text-base font-semibold text-gray-700 leading-relaxed">{summary}</p>

              <div className="space-y-4">
                {sectionList.map((section) => (
                  <div key={section.title} className="rounded-2xl border border-gray-100 bg-gray-50/40 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="text-sm font-bold uppercase tracking-widest text-gray-500">{section.title}</div>
                    </div>
                    {section.description && (
                      <p className="text-xs text-gray-500 mb-3">{section.description}</p>
                    )}
                    <div className="flex flex-col gap-2">
                      {section.items.map((item, idx) => (
                        <div key={`${section.title}-${idx}`} className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base font-semibold text-gray-900">{item.label}</div>
                            {item.helper && <div className="text-xs text-gray-500">{item.helper}</div>}
                          </div>
                          {item.value && (
                            <span
                              className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest border ${
                                toneStyles[item.tone || 'info']
                              }`}
                            >
                              {item.value}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    {section.footer && (
                      <div className="mt-3 text-[11px] text-gray-500 font-medium">{section.footer}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-[11px] text-gray-500 font-medium">
              <span>{updatedLabel}</span>
              <button
                onClick={() => setOpen(false)}
                className="text-gray-700 hover:text-gray-900 font-bold uppercase tracking-widest"
              >
                Hide
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="ml-auto w-12 h-12 rounded-full bg-transparent text-white transition-shadow flex items-center justify-center"
        >
          <span className="w-12 h-12 rounded-full bg-lime-300 text-gray-900 flex items-center justify-center shadow-[0_10px_20px_rgba(0,0,0,0.2)]">
            <Sparkles className="w-4 h-4" />
          </span>
        </button>
      )}
    </div>
  );

  return createPortal(content, document.body);
};
