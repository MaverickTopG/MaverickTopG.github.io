import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowUpRight, CheckCircle2, Loader2, Sparkles, Wand2 } from 'lucide-react';
import type {
  NebulaeAction,
  NebulaeOpsActionKey,
  NebulaePriority,
  NebulaeRecommendation,
} from '../hooks/useNebulaeOpsCenter';

interface NebulaeOpsCenterProps {
  loading: boolean;
  priorities: NebulaePriority[];
  actions: NebulaeAction[];
  recommendations: NebulaeRecommendation[];
  primaryRecommendation: NebulaeRecommendation | null;
  autopilot: {
    autoInvite: boolean;
    autoReminders: boolean;
    autoRecognition: boolean;
  };
  toggleAutopilot: (key: 'autoInvite' | 'autoReminders' | 'autoRecognition', value: boolean) => void;
  runAction: (actionKey: NebulaeOpsActionKey, options?: { automatic?: boolean }) => Promise<{ ok: boolean; message: string }>;
  lastSignal: { timestamp: number; text: string; auto: boolean } | null;
  learningSummary: {
    acceptedActions: number;
    autoRuns: number;
    invitePrecision: number;
    messageLift: number;
  };
  onOpenNebulae: () => void;
  ctaLabel?: string;
}

const toneStyles: Record<string, string> = {
  alert: 'border-red-200 bg-red-50 text-red-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  ok: 'border-lime-200 bg-lime-50 text-lime-700',
  info: 'border-gray-200 bg-gray-50 text-gray-600',
};

const actionLabelMap: Record<NebulaeOpsActionKey, string> = {
  invite_reliable: 'Fill staffing gap',
  send_log_reminders: 'Nudge volunteers',
  send_recognition: 'Recognize top volunteers',
  launch_reengagement: 'Launch re-engagement',
};

export const NebulaeOpsCenter: React.FC<NebulaeOpsCenterProps> = ({
  loading,
  priorities,
  actions,
  recommendations,
  primaryRecommendation,
  autopilot,
  toggleAutopilot,
  runAction,
  lastSignal,
  learningSummary,
  onOpenNebulae,
  ctaLabel = 'Open Nebulae',
}) => {
  const [runningAction, setRunningAction] = useState<NebulaeOpsActionKey | null>(null);
  const [localSignal, setLocalSignal] = useState<string>('');

  const signalText = useMemo(() => {
    if (lastSignal?.text) return `${lastSignal.auto ? 'Autopilot: ' : ''}${lastSignal.text}`;
    return localSignal;
  }, [lastSignal, localSignal]);

  const handleAction = async (actionKey: NebulaeOpsActionKey) => {
    if (runningAction) return;
    setRunningAction(actionKey);
    const result = await runAction(actionKey);
    setLocalSignal(result.message);
    setRunningAction(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-[2.8rem] border border-gray-900/10 bg-gradient-to-br from-white via-gray-50 to-lime-50/40 shadow-[0_30px_70px_rgba(15,23,42,0.12)] overflow-hidden"
    >
      <div className="px-8 md:px-10 py-8 border-b border-gray-900/10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-[1.2rem] bg-gray-900 text-white flex items-center justify-center shadow-xl">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-gray-500">Nebulae AI Ops Center</p>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900">Today's Priorities</h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenNebulae}
              className="h-11 px-5 rounded-full bg-gray-900 text-white text-sm font-bold inline-flex items-center gap-2 hover:bg-black transition-colors"
            >
              {ctaLabel}
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-8 md:px-10 py-8 grid grid-cols-1 xl:grid-cols-[1.35fr_1fr] gap-8">
        <div className="space-y-6">
          <div className="space-y-3">
            {priorities.map((priority) => (
              <div
                key={priority.id}
                className={`rounded-2xl border px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${toneStyles[priority.tone] || toneStyles.info}`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-xs font-black uppercase tracking-wider mt-1 min-w-[44px]">{priority.emoji}</div>
                  <p className="text-sm md:text-base font-bold leading-tight">{priority.label}</p>
                </div>
                {priority.actionKey && (
                  <button
                    onClick={() => handleAction(priority.actionKey as NebulaeOpsActionKey)}
                    disabled={runningAction != null}
                    className="h-9 px-4 rounded-full bg-white/90 text-gray-900 text-xs font-black uppercase tracking-wider border border-black/10 hover:bg-white disabled:opacity-50"
                  >
                    {runningAction === priority.actionKey ? 'Running...' : (actionLabelMap[priority.actionKey] || 'Run')}
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500 mb-3">One-click actions</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {actions.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleAction(action.key)}
                  disabled={runningAction != null}
                  className="text-left p-4 rounded-2xl bg-white border border-gray-200 hover:border-gray-300 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-gray-900">{action.label}</div>
                      <p className="text-xs text-gray-500 mt-1">{action.helper}</p>
                    </div>
                    {runningAction === action.key ? <Loader2 className="w-4 h-4 animate-spin text-gray-500" /> : <Wand2 className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {signalText && (
            <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-lime-600" />
              <span>{signalText}</span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-gray-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Explainable recommendation</p>
            {primaryRecommendation ? (
              <div className="mt-3 space-y-3">
                <div>
                  <div className="text-sm text-gray-500">Suggested volunteer</div>
                  <div className="text-xl font-black text-gray-900">{primaryRecommendation.volunteerName}</div>
                </div>
                <div className="space-y-2 text-sm text-gray-700">
                  {primaryRecommendation.reasons.map((reason, index) => (
                    <div key={`${primaryRecommendation.volunteerId}-${index}`} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-gray-500" />
                      <span>{reason}</span>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Confidence</div>
                    <div className="text-base font-black text-gray-900">{primaryRecommendation.confidence}%</div>
                  </div>
                  <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                    <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">Data source</div>
                    <div className="text-[11px] font-bold text-gray-700 leading-tight">{primaryRecommendation.dataSource}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-3 text-sm text-gray-500">Waiting for enough volunteer activity data to build recommendations.</div>
            )}
          </div>

          <div className="rounded-[2rem] border border-gray-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Autopilot</p>
            <div className="mt-3 space-y-2">
              <label className="flex items-center justify-between text-sm text-gray-700">
                <span>Auto-send reminders</span>
                <input
                  type="checkbox"
                  checked={autopilot.autoReminders}
                  onChange={(e) => toggleAutopilot('autoReminders', e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-sm text-gray-700">
                <span>Auto-invite matching volunteers</span>
                <input
                  type="checkbox"
                  checked={autopilot.autoInvite}
                  onChange={(e) => toggleAutopilot('autoInvite', e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between text-sm text-gray-700">
                <span>Auto-recognition messages</span>
                <input
                  type="checkbox"
                  checked={autopilot.autoRecognition}
                  onChange={(e) => toggleAutopilot('autoRecognition', e.target.checked)}
                />
              </label>
            </div>
          </div>

          <div className="rounded-[2rem] border border-gray-200 bg-white p-5">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Continuous learning loop</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Accepted actions</div>
                <div className="text-lg font-black text-gray-900">{learningSummary.acceptedActions}</div>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Autopilot runs</div>
                <div className="text-lg font-black text-gray-900">{learningSummary.autoRuns}</div>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Invite precision</div>
                <div className="text-lg font-black text-gray-900">{learningSummary.invitePrecision}%</div>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Message lift</div>
                <div className="text-lg font-black text-gray-900">{learningSummary.messageLift}%</div>
              </div>
            </div>
          </div>

          {loading && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 text-amber-700 px-4 py-3 text-sm inline-flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Syncing Nebulae Ops context...
            </div>
          )}

          {recommendations.length > 1 && (
            <div className="rounded-[2rem] border border-gray-200 bg-white p-5">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Additional reliable volunteers</p>
              <div className="mt-3 space-y-2">
                {recommendations.slice(1).map((candidate) => (
                  <div key={candidate.volunteerId} className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-gray-800">{candidate.volunteerName}</span>
                    <span className="text-gray-500">{candidate.reliability}% reliability</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};
