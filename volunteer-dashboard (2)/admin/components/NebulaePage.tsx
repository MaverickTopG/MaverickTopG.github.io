
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  ExternalLink, 
  Zap, 
  Cpu, 
  Layers, 
  Globe, 
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertCircle,
  Award,
  Users2,
  Compass,
  Plus,
  FileText,
  X,
  ChevronDown,
  Network,
  Shield,
} from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp
} from 'firebase/firestore';
import { getFirestoreDb, getFirebaseAuth } from '../lib/firebase';
import { NebulaeOpsCenter } from './NebulaeOpsCenter';
import type { NebulaeAction, NebulaeOpsActionKey, NebulaePriority, NebulaeRecommendation } from '../hooks/useNebulaeOpsCenter';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  grounding?: any[];
}

interface NebulaeOpsPanel {
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
  opsMetrics: {
    upcomingEvents: number;
    totalCapacity: number;
    filledSlots: number;
    staffingShortage: number;
    pendingLogs: number;
    pendingLogsAged: number;
    monthHoursCurrent: number;
    monthHoursPrevious: number;
    monthHoursDelta: number;
    reliableVolunteers: number;
    recommendationsCount: number;
  };
}

interface NebulaePageProps {
  planTier?: string;
  aiEnabled?: boolean;
  opsCenter?: NebulaeOpsPanel | null;
  contextScope?: 'superadmin-only' | 'include-subadmins';
  onContextScopeChange?: (scope: 'superadmin-only' | 'include-subadmins') => void;
  isSubAdminPortal?: boolean;
}

const INTELLIGENCE_MODULES = [
  {
    id: 'staffing-risk',
    title: 'Staffing Risk',
    description: 'Surface coverage gaps',
    icon: Users2,
    color: 'indigo',
    prompt: 'Run a staffing risk scan and identify the top volunteer coverage gaps for this week.'
  },
  {
    id: 'retention-radar',
    title: 'Retention Radar',
    description: 'Spot volunteer drop-off risk',
    icon: Compass,
    color: 'sky',
    prompt: 'Review recent volunteer activity and identify who is at risk of disengaging. Provide an outreach plan for the next 7 days.'
  },
  {
    id: 'reliability-watch',
    title: 'Reliability Watch',
    description: 'Detect no-show risk',
    icon: TrendingUp,
    color: 'emerald',
    prompt: 'Analyze volunteer reliability patterns and list the highest no-show risk areas with mitigation actions.'
  },
  {
    id: 'recognition-moments',
    title: 'Recognition Moments',
    description: 'Highlight top contributors',
    icon: Award,
    color: 'violet',
    prompt: 'Identify volunteers with strong recent impact and draft short recognition messages with specific accomplishments.'
  },
  {
    id: 'backlog-clear',
    title: 'Backlog Clear',
    description: 'Prioritize approvals queue',
    icon: CheckCircle2,
    color: 'amber',
    prompt: 'Review approval and request backlogs and provide a prioritized clear-the-backlog execution plan.'
  },
  {
    id: 'engagement-pulse',
    title: 'Engagement Pulse',
    description: 'Improve weekly participation',
    icon: Clock,
    color: 'rose',
    prompt: 'Analyze this week’s participation trend and suggest 5 actions to increase volunteer engagement before next week.'
  }
];

const ADVANCED_VOLUNTEER_PLAYBOOKS = [
  {
    id: 'burnout-shield',
    title: 'Burnout Shield',
    description: 'Prevent attrition in your top performers',
    prompt: 'Create a 30-day burnout prevention plan for high-contributing volunteers. Include workload balancing, check-ins, and backup staffing recommendations with measurable thresholds.'
  },
  {
    id: 'matching-engine',
    title: 'Role Matching',
    description: 'Match volunteers to the right shifts',
    prompt: 'Build an AI-assisted volunteer matching plan that assigns people to shifts by reliability, skills, and availability. Include fallback assignments and tie-breaker rules.'
  },
  {
    id: 'recovery-protocol',
    title: 'No-Show Recovery',
    description: 'Handle surprise staffing gaps',
    prompt: 'Draft an operational incident protocol for no-show spikes. Include first 15-minute actions, escalation tree, replacement messages, and post-incident learning loop.'
  },
  {
    id: 'retention-ladder',
    title: '90-Day Retention',
    description: 'Increase repeat volunteer rate',
    prompt: 'Design a 90-day retention ladder for new volunteers with milestones, nudges, recognition moments, and decision gates for high-potential volunteers.'
  }
];

const STRATEGY_GOALS = [
  { id: 'coverage', label: 'Coverage Stability' },
  { id: 'retention', label: 'Retention Growth' },
  { id: 'compliance', label: 'Log Compliance' },
  { id: 'recognition', label: 'Recognition Program' },
];

const STRATEGY_HORIZONS = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
];

const STRATEGY_STYLES = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'conservative', label: 'Conservative' },
];

const LIME_ACCENT = '#D2F677';
const LIME_GLOW = 'rgba(210,246,119,0.35)';

type NebulaeModeKey =
  | 'grants'
  | 'opportunity-distribution'
  | 'portal-guidance'
  | 'decision-support';

interface NebulaeModeConfig {
  key: NebulaeModeKey;
  label: string;
  buttonLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  glow: string;
  focus: string;
  inputPlaceholder: string;
  sidebarEyebrow: string;
  sidebarTitle: string;
  sidebarEmpty: string;
  insightLine: string;
  refreshLabel: string;
}

const NEBULAE_MODE_CONFIG: Record<NebulaeModeKey, NebulaeModeConfig> = {
  grants: {
    key: 'grants',
    label: 'Grant Discovery',
    buttonLabel: 'Grants',
    icon: Layers,
    accent: LIME_ACCENT,
    glow: LIME_GLOW,
    focus: 'Eligibility + deadlines + geography',
    inputPlaceholder: "Ask Anything: 'Find 2024 environmental grants in Seattle'...",
    sidebarEyebrow: 'Grant Intelligence',
    sidebarTitle: 'Live Discoveries',
    sidebarEmpty: 'Perform a grant search to populate intelligence feed.',
    insightLine: 'Real-time grant metadata is aligned with your volunteer initiatives.',
    refreshLabel: 'Refresh Grant Search',
  },
  'opportunity-distribution': {
    key: 'opportunity-distribution',
    label: 'Opportunity Distribution',
    buttonLabel: 'Distribution',
    icon: Users2,
    accent: LIME_ACCENT,
    glow: LIME_GLOW,
    focus: 'Right volunteers to right opportunities',
    inputPlaceholder: "Ask Anything: 'Distribute Saturday tutoring shifts across available volunteers'...",
    sidebarEyebrow: 'Distribution Metrics',
    sidebarTitle: 'Live Allocation Signals',
    sidebarEmpty: 'Run a distribution query to surface allocation guidance.',
    insightLine: 'Signal stream highlights allocation balance, staffing pressure, and fill opportunities.',
    refreshLabel: 'Refresh Distribution Feed',
  },
  'portal-guidance': {
    key: 'portal-guidance',
    label: 'Portal Guidance',
    buttonLabel: 'Guidance',
    icon: Globe,
    accent: LIME_ACCENT,
    glow: LIME_GLOW,
    focus: 'Workflows, setup steps, and navigation',
    inputPlaceholder: "Ask Anything: 'Guide me through configuring volunteer approvals in the portal'...",
    sidebarEyebrow: 'Portal Guidance',
    sidebarTitle: 'Workflow Clarity',
    sidebarEmpty: 'Ask a portal workflow question to populate guidance telemetry.',
    insightLine: 'Guidance telemetry tracks setup progress, blockers, and recommended next actions.',
    refreshLabel: 'Refresh Guidance Feed',
  },
  'decision-support': {
    key: 'decision-support',
    label: 'Decision Support',
    buttonLabel: 'Decisions',
    icon: Cpu,
    accent: LIME_ACCENT,
    glow: LIME_GLOW,
    focus: 'Tradeoffs, risk, and execution choices',
    inputPlaceholder: "Ask Anything: 'What decision should we make to reduce no-shows next week?'...",
    sidebarEyebrow: 'Decision Metrics',
    sidebarTitle: 'Decision Signals',
    sidebarEmpty: 'Run a decision-support query to populate recommendations.',
    insightLine: 'Decision stream surfaces risks, confidence, and execution recommendations.',
    refreshLabel: 'Refresh Decision Feed',
  },
};

const NEBULAE_MODE_ORDER: NebulaeModeKey[] = [
  'grants',
  'opportunity-distribution',
  'portal-guidance',
  'decision-support',
];

const getModeSelectionKey = (modes: NebulaeModeKey[]) =>
  [...modes].sort((a, b) => NEBULAE_MODE_ORDER.indexOf(a) - NEBULAE_MODE_ORDER.indexOf(b)).join('|');

// Temporarily hidden sections (kept for later re-enable).
const SHOW_EMBEDDED_OPS_CENTER = false;
const SHOW_VOLUNTEER_AI_TOOLS = false;

export const NebulaePage: React.FC<NebulaePageProps> = ({
  aiEnabled = false,
  opsCenter = null,
  contextScope = 'superadmin-only',
  onContextScopeChange,
  isSubAdminPortal = false,
}) => {
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [groundingResults, setGroundingResults] = useState<any[]>([]);
  const [attachments, setAttachments] = useState<{file: File, type: string, preview?: string}[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedModes, setSelectedModes] = useState<NebulaeModeKey[]>([]);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [strategyGoal, setStrategyGoal] = useState(STRATEGY_GOALS[0].id);
  const [strategyHorizon, setStrategyHorizon] = useState(STRATEGY_HORIZONS[1].id);
  const [strategyStyle, setStrategyStyle] = useState(STRATEGY_STYLES[0].id);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const modeSearchTimerRef = useRef<number | null>(null);
  const lastModeQueryRef = useRef<Record<string, string>>({});
  const selectedModesKey = useMemo(() => getModeSelectionKey(selectedModes), [selectedModes]);
  const hasModeSelection = selectedModes.length > 0;
  const isDeepMode = selectedModes.length >= 2;
  const contextLabel =
    contextScope === 'include-subadmins' ? 'Superadmin + Subadmins' : 'Superadmin Only';
  const contextInstruction = useMemo(() => {
    if (contextScope === 'include-subadmins') {
      return 'Context scope: Include all organization data from superadmin and all subadmin groups to provide a holistic response.';
    }
    return 'Context scope: Use only superadmin-scope data (exclude subadmin-scoped data) for this response.';
  }, [contextScope]);
  const primaryMode = selectedModes[0] || null;
  const activeModeConfig = primaryMode ? NEBULAE_MODE_CONFIG[primaryMode] : null;
  const ActiveModeIcon = activeModeConfig?.icon || Layers;
  const intelligenceModules = useMemo(() => [
    ...INTELLIGENCE_MODULES,
    {
      id: 'predictive-orchestration',
      title: 'Predictive Orchestration',
      description: 'Simulate staffing outcomes',
      icon: Cpu,
      color: 'gray',
      prompt: 'Simulate next week volunteer operations and provide three staffing scenarios (safe, expected, stretch) with action triggers.'
    },
  ], []);

  // Persistence Logic
  const saveToFirestore = async (newMessages: Message[], results: any[]) => {
    const auth = getFirebaseAuth();
    const db = getFirestoreDb();
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (!chatId) {
        const docRef = await addDoc(collection(db, 'nebulae_chats'), {
          userId: user.uid,
          messages: newMessages,
          groundingResults: results,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          title: newMessages.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Intelligence Session'
        });
        setChatId(docRef.id);
      } else {
        await updateDoc(doc(db, 'nebulae_chats', chatId), {
          messages: newMessages,
          groundingResults: results,
          updatedAt: Timestamp.now(),
          title: newMessages.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Intelligence Session'
        });
      }
    } catch (err) {
      console.error('Persistence failed', err);
    }
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  useEffect(() => {
    if (!showContextMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!contextMenuRef.current) return;
      if (!contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [showContextMenu]);

  const buildModePrompt = (mode: NebulaeModeKey, queryText: string) => {
    const normalizedQuery = queryText || 'Provide mode-specific analysis for volunteer operations.';
    if (mode === 'grants') {
      return `Context: You are in Grant Discovery mode. Focus on eligibility, geography, and deadlines. Prioritize grants that fund volunteer engagement, training, and coordination.
Query: ${normalizedQuery}
Output: Provide a concise shortlist with clickable links and a one-line eligibility note each.`;
    }
    if (mode === 'opportunity-distribution') {
      return `Context: You are in Opportunity Distribution mode. Focus on assigning volunteers to opportunities with fairness, skill fit, and schedule reliability.
Query: ${normalizedQuery}
Output: Provide assignment recommendations, allocation tradeoffs, and a short execution checklist.`;
    }
    if (mode === 'portal-guidance') {
      return `Context: You are in Portal Guidance mode. Focus on step-by-step setup, navigation, and admin workflow clarity in NexoLink.
Query: ${normalizedQuery}
Output: Provide clear steps, where to click, and quick validation checks after each step.`;
    }
    return `Context: You are in Decision Support mode. Focus on operational tradeoffs, risks, confidence levels, and actionable recommendations for volunteer programs.
Query: ${normalizedQuery}
Output: Provide top options, expected impact, risks, and a recommended path with reasons.`;
  };

  const buildDeepModePrompt = (modes: NebulaeModeKey[], queryText: string) => {
    const normalizedQuery = queryText || 'Run cross-functional volunteer intelligence analysis.';
    const modeContext = modes
      .map((mode) => `- ${NEBULAE_MODE_CONFIG[mode].label}: ${NEBULAE_MODE_CONFIG[mode].focus}`)
      .join('\n');
    return `Context: You are in multi-mode advanced reasoning for volunteer management intelligence.
Selected modes:
${modeContext}

Task: Crunch the full picture and calculate interactions across staffing, grants, portal workflow, and decision risk where applicable.
Query: ${normalizedQuery}
Reasoning directive: Think deeply, evaluate cross-dependencies, and favor completeness over speed.

Output format:
1) Cross-factor diagnosis with hard constraints.
2) Quantified impact table (coverage, pending logs, staffing gaps, trend implications).
3) Coordinated execution plan across all selected modes.
4) Risk and dependency map with mitigation triggers.
5) Final recommended path with explicit tradeoff justification.`;
  };

  const buildActivePrompt = (modes: NebulaeModeKey[], queryText: string) => {
    if (!modes.length) return queryText || 'Provide volunteer operations guidance.';
    if (modes.length === 1) return buildModePrompt(modes[0], queryText);
    return buildDeepModePrompt(modes, queryText);
  };

  useEffect(() => {
    if (!hasModeSelection) return;
    const queryText = input.trim();
    if (isThinking || queryText.length < 3 || queryText === lastModeQueryRef.current[selectedModesKey]) return;

    if (modeSearchTimerRef.current) {
      window.clearTimeout(modeSearchTimerRef.current);
    }

    modeSearchTimerRef.current = window.setTimeout(() => {
      lastModeQueryRef.current[selectedModesKey] = queryText;
      handleSendMessage(undefined, buildActivePrompt(selectedModes, queryText), queryText);
    }, 600);

    return () => {
      if (modeSearchTimerRef.current) {
        window.clearTimeout(modeSearchTimerRef.current);
      }
    };
  }, [hasModeSelection, input, isThinking, selectedModes, selectedModesKey]);

  const buildOpsSnapshot = () => {
    if (!opsCenter) return 'Ops snapshot unavailable.';
    const topPriorities = (opsCenter.priorities || [])
      .slice(0, 3)
      .map((priority) => `- ${priority.label}`)
      .join('\n');
    const recommendation = opsCenter.primaryRecommendation
      ? `${opsCenter.primaryRecommendation.volunteerName} (${opsCenter.primaryRecommendation.confidence}% confidence)`
      : 'No primary recommendation yet';
    return `Ops context:
${contextInstruction}
Top priorities:
${topPriorities || '- None'}
Primary recommendation: ${recommendation}
Autopilot: reminders=${opsCenter.autopilot.autoReminders}, invites=${opsCenter.autopilot.autoInvite}, recognition=${opsCenter.autopilot.autoRecognition}
Learning: accepted=${opsCenter.learningSummary.acceptedActions}, auto_runs=${opsCenter.learningSummary.autoRuns}, invite_precision=${opsCenter.learningSummary.invitePrecision}%`;
  };

  const buildStrategyPrompt = () => {
    const goalLabel = STRATEGY_GOALS.find((goal) => goal.id === strategyGoal)?.label || strategyGoal;
    const horizonLabel = STRATEGY_HORIZONS.find((horizon) => horizon.id === strategyHorizon)?.label || `${strategyHorizon} days`;
    const styleLabel = STRATEGY_STYLES.find((style) => style.id === strategyStyle)?.label || strategyStyle;
    return `You are Nebulae AI, a volunteer operations strategist.
Objective: Build a ${horizonLabel} volunteer-management plan for "${goalLabel}" in ${styleLabel} mode.

${buildOpsSnapshot()}

Output format:
1) Executive diagnosis (3 bullets).
2) Week-by-week operational plan.
3) Message templates for volunteers/admins.
4) Risk register with early warning triggers.
5) KPI dashboard (daily + weekly).
6) First 48-hour action checklist.`;
  };

  const doesResultMatchCurrentSelection = (result: any) => {
    if (!hasModeSelection) return false;
    if (isDeepMode) {
      return result?.__deep === true && result?.__selectionKey === selectedModesKey;
    }
    return result?.__mode === primaryMode;
  };

  const activeGroundingResults = useMemo(
    () => groundingResults.filter((result: any) => doesResultMatchCurrentSelection(result)),
    [groundingResults, hasModeSelection, isDeepMode, primaryMode, selectedModesKey],
  );

  const opsMetrics = opsCenter?.opsMetrics || null;

  const modeMetrics = useMemo(() => {
    const sourceCount = activeGroundingResults.length;
    const uniqueDomains = new Set(
      activeGroundingResults
        .map((result: any) => {
          const uri = String(result?.web?.uri || '').trim();
          if (!uri) return null;
          try {
            return new URL(uri).hostname;
          } catch (_error) {
            return null;
          }
        })
        .filter(Boolean),
    ).size;
    const hasCapacity = Boolean(opsMetrics && opsMetrics.totalCapacity > 0);
    const coverageRate = hasCapacity
      ? `${Math.round((opsMetrics!.filledSlots / opsMetrics!.totalCapacity) * 100)}%`
      : 'N/A';
    if (!hasModeSelection) {
      return [
        { label: 'Modes selected', value: '0' },
        { label: 'Deep mode', value: 'Off' },
        { label: 'Coverage', value: 'N/A' },
      ];
    }
    if (isDeepMode) {
      const coverageFilled = opsMetrics?.filledSlots ?? 0;
      const coverageTotal = opsMetrics?.totalCapacity ?? 0;
      const coverageValue = coverageTotal > 0 ? `${coverageFilled}/${coverageTotal}` : 'N/A';
      return [
        { label: 'Deep mode', value: `On (${selectedModes.length})` },
        { label: 'Coverage', value: coverageValue },
        { label: 'Aged >3d', value: `${opsMetrics?.pendingLogsAged ?? 0}` },
      ];
    }
    if (primaryMode === 'grants') {
      return [
        { label: 'Discoveries', value: `${sourceCount}` },
        { label: 'Sources', value: `${uniqueDomains}` },
        { label: 'Coverage gap', value: `${opsMetrics?.staffingShortage ?? 0}` },
      ];
    }
    if (primaryMode === 'opportunity-distribution') {
      return [
        { label: 'Upcoming events', value: `${opsMetrics?.upcomingEvents ?? 0}` },
        { label: 'Coverage', value: coverageRate },
        { label: 'Open slots', value: `${opsMetrics?.staffingShortage ?? 0}` },
      ];
    }
    if (primaryMode === 'portal-guidance') {
      return [
        { label: 'Pending logs', value: `${opsMetrics?.pendingLogs ?? 0}` },
        { label: 'Aged >3d', value: `${opsMetrics?.pendingLogsAged ?? 0}` },
        { label: 'Reliable pool', value: `${opsMetrics?.reliableVolunteers ?? 0}` },
      ];
    }
    const delta = opsMetrics?.monthHoursDelta ?? 0;
    return [
      {
        label: 'Month trend',
        value: `${delta > 0 ? '+' : ''}${delta}%`,
      },
      { label: 'Recommendations', value: `${opsMetrics?.recommendationsCount ?? 0}` },
      { label: 'Coverage gap', value: `${opsMetrics?.staffingShortage ?? 0}` },
    ];
  }, [activeGroundingResults, hasModeSelection, isDeepMode, opsMetrics, primaryMode, selectedModes.length]);

  const handleModeSelect = (mode: NebulaeModeKey) => {
    setSelectedModes((prev) => {
      const exists = prev.includes(mode);
      const next = exists
        ? prev.filter((entry) => entry !== mode)
        : [...prev, mode];
      const sorted = [...next].sort(
        (a, b) => NEBULAE_MODE_ORDER.indexOf(a) - NEBULAE_MODE_ORDER.indexOf(b),
      );
      setSidebarOpen(sorted.length > 0);
      if (sorted.length > 0) {
        inputRef.current?.focus();
      }
      return sorted;
    });
  };

  const handleSendMessage = async (e?: React.FormEvent, overrideInput?: string, displayInput?: string) => {
    if (e) e.preventDefault();
    const finalInput = overrideInput ?? input;
    const modesAtSend = [...selectedModes];
    const modeSelectionKeyAtSend = getModeSelectionKey(modesAtSend);
    const deepModeAtSend = modesAtSend.length >= 2;
    const primaryModeAtSend = modesAtSend[0] || null;
    if ((!finalInput.trim() && attachments.length === 0) || isThinking) return;
    if (modeSearchTimerRef.current) {
      window.clearTimeout(modeSearchTimerRef.current);
    }
    if (modeSelectionKeyAtSend) {
      lastModeQueryRef.current[modeSelectionKeyAtSend] = (displayInput ?? finalInput).trim();
    }

    // Helper to convert File to Gemini part
    const fileToGenerativePart = async (file: File) => {
      return new Promise<{inlineData: {data: string, mimeType: string}}>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = (reader.result as string).split(',')[1];
          resolve({
            inlineData: { data: base64Data, mimeType: file.type }
          });
        };
        reader.readAsDataURL(file);
      });
    };

    const userMessage: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      content: (displayInput ?? finalInput) || (attachments.length > 0 ? `Sent ${attachments.length} attachment(s)` : '')
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    
    const modePrompt = buildActivePrompt(modesAtSend, finalInput.trim());
    const currentInput = overrideInput ?? `${contextInstruction}\n\n${modePrompt}`;
    const currentAttachments = [...attachments];
    
    setInput('');
    setAttachments([]);
    setIsThinking(true);

    try {
      const genAI = new GoogleGenerativeAI("AIzaSyCX9iZt_rDr0B1jQu-pqhGHiQm3avmDt6o");
      const model = genAI.getGenerativeModel({ 
        model: "gemini-2.5-flash-lite",
        tools: [{ 
          // @ts-ignore
          googleSearch: {} 
        }],
      });

      // Map previous messages to Gemini format
      const historyContents = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      // Prepare current multi-modal parts
      const currentParts: any[] = [{ text: currentInput || "Please analyze these attachments." }];
      
      for (const at of currentAttachments) {
        if (at.type === 'image' || at.file.type === 'application/pdf') {
          const part = await fileToGenerativePart(at.file);
          currentParts.push(part);
        } else {
          const text = await at.file.text();
          currentParts.push({ text: `Content of ${at.file.name}:\n${text}` });
        }
      }

      const response = await model.generateContent({
        contents: [
          ...historyContents,
          { role: 'user', parts: currentParts }
        ],
        generationConfig: {
          maxOutputTokens: 2000,
          temperature: 0.7,
        },
        systemInstruction: {
          role: 'system',
          parts: [{
            text: `You are Nebulae, the flagship intelligence layer for NexoLink. Your core objective is to serve as a high-fidelity co-pilot for nonprofit admins. 

            You operate across three priority topics:
            🥇 TOPIC 1: Grant Discovery & Readiness
            🥈 TOPIC 2: Volunteer Opportunity Distribution
            🥉 TOPIC 3: Portal Guidance & decision Support

            MULTI-MODAL CAPABILITY:
            You can see images and read documents (PDF, Word, Text). 
            - If an user sends a grant guideline, analyze it for readiness.
            - If an user sends an event photo, suggest social media captions.
            - If an user sends a project plan, identify missing Manpower needs.

            STYLE: High-level vocabulary, professional, reassuring, and intelligent. If searching for grants, ALWAYS provide clickable markdown links.`
          }]
        }
      });

      const text = response.response.text();
      const groundingMetadata = response.response.candidates?.[0]?.groundingMetadata;
      const chunks = groundingMetadata?.groundingChunks || [];
      const taggedChunks = chunks.map((chunk: any) => ({
        ...chunk,
        __mode: primaryModeAtSend,
        __modes: modesAtSend,
        __deep: deepModeAtSend,
        __selectionKey: modeSelectionKeyAtSend || null,
      }));

      setMessages(prev => {
        const assistantMessage: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'assistant', 
          content: text,
          grounding: taggedChunks
        };
        const updated = [...prev, assistantMessage];
        
        const newResults = [...groundingResults, ...taggedChunks];
        setGroundingResults(newResults);
        saveToFirestore(updated, newResults);
        return updated;
      });

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { 
        id: (Date.now() + 1).toString(), 
        role: 'assistant', 
        content: "I've encountered a sync latency in processing these inputs. Please try a smaller file or text only." 
      }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const newAttachments = files.map(file => ({
        file,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
      }));
      setAttachments(prev => [...prev, ...newAttachments]);
    }
  };

  return (
    <div className="w-full h-full bg-[#FAFAFA] flex overflow-hidden relative font-sans">
      
      {/* Immersive Animated Background */}
      <div className="absolute inset-0 pointer-events-none opacity-40">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            opacity: [0.2, 0.4, 0.2] 
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className="absolute -top-[20%] -right-[10%] w-[1000px] h-[1000px] bg-gradient-to-br from-[#D2F677]/10 to-transparent rounded-full blur-[160px]"
        />
        <motion.div 
          animate={{ 
            scale: [1.2, 1, 1.2],
            rotate: [0, -90, 0],
            opacity: [0.1, 0.3, 0.1]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className="absolute -bottom-[20%] -left-[10%] w-[800px] h-[800px] bg-gradient-to-tr from-gray-200/40 to-transparent rounded-full blur-[140px]"
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative z-10 border-r border-gray-100">
        
        {/* Floating Header */}
        <div className="px-12 py-8 flex items-center justify-between bg-white/60 backdrop-blur-3xl sticky top-0 z-20 border-b border-gray-100">
           <div className="flex items-center gap-6">
              <div>
                 <h2 className="text-4xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-none">Nebulae AI</h2>
              </div>
           </div>
           
           <div className="flex items-center gap-4">
              {!isSubAdminPortal && (
                <div className="relative" ref={contextMenuRef}>
                  <button
                    onClick={() => setShowContextMenu((prev) => !prev)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all shadow-sm bg-white text-gray-700 border-gray-100 hover:bg-gray-50"
                  >
                    {contextScope === 'include-subadmins' ? (
                      <Network className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Shield className="w-4 h-4 text-gray-500" />
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-widest">Context</span>
                    <ChevronDown className="w-3 h-3 text-gray-400" />
                  </button>
                  <AnimatePresence>
                    {showContextMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.98 }}
                        className="absolute right-0 top-14 w-72 bg-white rounded-2xl border border-gray-100 shadow-2xl p-2 z-30"
                      >
                        <button
                          onClick={() => {
                            onContextScopeChange?.('superadmin-only');
                            setShowContextMenu(false);
                          }}
                          className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${
                            contextScope === 'superadmin-only' ? 'bg-[#D2F677]/40' : 'hover:bg-gray-50'
                          }`}
                        >
                          <p className="text-xs font-black text-gray-900 uppercase tracking-[0.14em]">Superadmin Only</p>
                          <p className="text-[11px] text-gray-500 mt-1">Use only superadmin-scope records.</p>
                        </button>
                        <button
                          onClick={() => {
                            onContextScopeChange?.('include-subadmins');
                            setShowContextMenu(false);
                          }}
                          className={`w-full text-left rounded-xl px-3 py-3 transition-colors ${
                            contextScope === 'include-subadmins' ? 'bg-[#D2F677]/40' : 'hover:bg-gray-50'
                          }`}
                        >
                          <p className="text-xs font-black text-gray-900 uppercase tracking-[0.14em]">Include Subadmins</p>
                          <p className="text-[11px] text-gray-500 mt-1">Use superadmin + all subadmin data for holistic answers.</p>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
              {SHOW_EMBEDDED_OPS_CENTER && aiEnabled && opsCenter && (
                <button
                  onClick={() => {
                    inputRef.current?.focus();
                  }}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all shadow-sm bg-black text-white border-black"
                >
                  <Cpu className="w-4 h-4 text-white" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Ops Center</span>
                </button>
              )}
              {Object.values(NEBULAE_MODE_CONFIG).map((mode) => {
                const isActive = selectedModes.includes(mode.key);
                const ModeIcon = mode.icon;
                return (
                  <button
                    key={mode.key}
                    onClick={() => handleModeSelect(mode.key)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full border transition-all shadow-sm ${
                      isActive ? '' : 'bg-white text-gray-600 border-gray-100 hover:bg-gray-50'
                    }`}
                    style={
                      isActive
                        ? {
                            backgroundColor: mode.accent,
                            borderColor: mode.accent,
                            color: '#111111',
                          }
                        : undefined
                    }
                  >
                    <ModeIcon
                      className={`w-4 h-4 ${isActive ? 'text-black' : 'text-gray-400'}`}
                    />
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${isActive ? 'text-black' : 'text-gray-600'}`}>
                      {mode.buttonLabel}
                    </span>
                  </button>
                );
              })}
           </div>
        </div>

        {/* Chat Stream */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto no-scrollbar px-12 py-10 space-y-12"
        >
           {SHOW_EMBEDDED_OPS_CENTER && aiEnabled && opsCenter && (
             <motion.div
               initial={{ opacity: 0, y: 16 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ duration: 0.35 }}
               className="mb-8"
             >
               <NebulaeOpsCenter
                 loading={opsCenter.loading}
                 priorities={opsCenter.priorities}
                 actions={opsCenter.actions}
                 recommendations={opsCenter.recommendations}
                 primaryRecommendation={opsCenter.primaryRecommendation}
                 autopilot={opsCenter.autopilot}
                 toggleAutopilot={opsCenter.toggleAutopilot}
                 runAction={opsCenter.runAction}
                 lastSignal={opsCenter.lastSignal}
                 learningSummary={opsCenter.learningSummary}
                 onOpenNebulae={() => {
                   inputRef.current?.focus();
                 }}
                 ctaLabel="Focus Chat"
               />
             </motion.div>
           )}

           {/* Welcome Dashboard - Premium Center Layout */}
           {messages.length === 0 && (
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               className="flex-1 flex flex-col items-center justify-center min-h-[60vh] text-center"
             >
                <div className="w-full max-w-6xl px-6">
                   <motion.div
                     initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                     animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                     transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                     className="mb-12 relative"
                   >
                      <h1 className="text-6xl md:text-7xl font-[1000] text-gray-900 tracking-tighter italic uppercase leading-[0.9] mb-6">
                         How can I <span className="text-transparent bg-clip-text bg-gradient-to-r from-black via-gray-700 to-[#D2F677] animate-gradient-x">help you</span> today?
                      </h1>
                      <div className="h-1 w-24 bg-[#D2F677] mx-auto rounded-full shadow-[0_0_20px_#D2F677]" />
                      
                      <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.8 }}
                        className="mt-8 text-sm font-bold text-gray-400 uppercase tracking-[0.4em]"
                      >
                         Operations + Volunteer Management Intelligence Ready
                      </motion.p>
                   </motion.div>

                   <div className="grid w-full grid-cols-1 gap-4 mt-8 sm:grid-cols-2 lg:grid-cols-3">
                      {intelligenceModules.map((module, idx) => (
                        <motion.button
                          key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 + idx * 0.1 }}
                onClick={() => {
                            handleSendMessage(undefined, module.prompt);
                          }}
                          className="w-full px-6 py-3.5 bg-white border border-gray-100 rounded-full hover:border-[#D2F677] hover:shadow-xl hover:shadow-[#D2F677]/10 transition-all flex items-center justify-between gap-3 group relative overflow-hidden"
                        >
                           <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-[#D2F677] group-hover:text-black transition-all">
                              <module.icon className="w-4 h-4" />
                           </div>
                           <span className="text-xs font-black text-gray-500 uppercase tracking-widest group-hover:text-black transition-colors">
                              {module.title}
                           </span>
                           <Plus className="w-3 h-3 text-gray-300 group-hover:text-black" />
                        </motion.button>
                      ))}
                   </div>

                   {SHOW_VOLUNTEER_AI_TOOLS && (
                     <div className="mt-10 grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-6 text-left">
                       <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                         <div className="flex items-center gap-3 mb-5">
                           <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center">
                             <TrendingUp className="w-5 h-5" />
                           </div>
                           <div>
                             <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Volunteer AI Playbooks</h3>
                             <p className="text-xs text-gray-500 font-semibold uppercase tracking-[0.2em]">One-click strategic workflows</p>
                           </div>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                           {ADVANCED_VOLUNTEER_PLAYBOOKS.map((playbook) => (
                             <button
                               key={playbook.id}
                               onClick={() => {
                                 handleSendMessage(undefined, playbook.prompt, playbook.title);
                               }}
                               className="p-4 rounded-2xl border border-gray-100 bg-gray-50 hover:bg-white hover:border-[#D2F677] hover:shadow-lg transition-all text-left"
                             >
                               <p className="text-sm font-black text-gray-900">{playbook.title}</p>
                               <p className="mt-1 text-xs text-gray-500">{playbook.description}</p>
                             </button>
                           ))}
                         </div>
                       </div>

                       <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                         <div className="flex items-center justify-between gap-3 mb-5">
                           <div>
                             <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Strategy Composer</h3>
                             <p className="text-xs text-gray-500 font-semibold uppercase tracking-[0.2em]">AI plan generator</p>
                           </div>
                           <span className="px-3 py-1 rounded-full bg-[#D2F677]/30 text-[10px] font-black uppercase tracking-[0.18em] text-gray-700">
                             Tier: Cosmos
                           </span>
                         </div>
                         <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                           <select
                             value={strategyGoal}
                             onChange={(event) => setStrategyGoal(event.target.value)}
                             className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700"
                           >
                             {STRATEGY_GOALS.map((goal) => (
                               <option key={goal.id} value={goal.id}>{goal.label}</option>
                             ))}
                           </select>
                           <select
                             value={strategyHorizon}
                             onChange={(event) => setStrategyHorizon(event.target.value)}
                             className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700"
                           >
                             {STRATEGY_HORIZONS.map((horizon) => (
                               <option key={horizon.id} value={horizon.id}>{horizon.label}</option>
                             ))}
                           </select>
                           <select
                             value={strategyStyle}
                             onChange={(event) => setStrategyStyle(event.target.value)}
                             className="h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700"
                           >
                             {STRATEGY_STYLES.map((style) => (
                               <option key={style.id} value={style.id}>{style.label}</option>
                             ))}
                           </select>
                         </div>
                         <button
                           onClick={() => {
                             handleSendMessage(undefined, buildStrategyPrompt(), 'Build volunteer strategy');
                           }}
                           className="mt-4 w-full h-12 rounded-xl bg-black text-white text-sm font-black uppercase tracking-[0.18em] hover:bg-gray-800 transition-colors"
                         >
                           Generate Strategy
                         </button>
                         <p className="mt-3 text-xs text-gray-500">
                           Generates an execution plan with KPIs, escalation triggers, message templates, and first 48-hour actions.
                         </p>
                       </div>
                     </div>
                   )}
                </div>
             </motion.div>
           )}

           <AnimatePresence mode="popLayout">
              {messages.map((msg) => (
                <motion.div 
                  key={msg.id}
                  initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[75%] flex flex-col gap-3 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                     <div 
                       className={`p-8 rounded-[2.5rem] text-xl font-medium leading-relaxed tracking-tight shadow-lg transition-all
                        ${msg.role === 'user' 
                          ? 'bg-black text-white rounded-tr-none' 
                          : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)]'
                        }`}
                     >
                        {msg.content}
                        
                        {/* Grounding Inline Links */}
                        {msg.grounding && msg.grounding.length > 0 && (
                          <div className="mt-8 pt-8 border-t border-gray-100 flex flex-wrap gap-3">
                             {msg.grounding.map((chunk, i) => (
                                chunk.web && (
                                  <a 
                                    key={i}
                                    href={chunk.web.uri}
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#D2F677]/10 text-gray-700 rounded-xl text-xs font-[1000] uppercase tracking-tighter hover:bg-[#D2F677] hover:text-black hover:scale-105 transition-all"
                                  >
                                    <Globe className="w-3 h-3" />
                                    {chunk.web.title || 'Source'}
                                  </a>
                                )
                             ))}
                          </div>
                        )}
                     </div>
                     <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">
                        {msg.role === 'user' ? 'Dashboard Admin' : 'Nebulae Intelligence'}
                     </span>
                  </div>
                </motion.div>
              ))}
              
              {isThinking && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-full bg-white border border-gray-100 flex items-center justify-center relative overflow-hidden shadow-sm">
                     <motion.div 
                       animate={{ 
                         scale: [1, 1.5, 1],
                         opacity: [0.2, 0.5, 0.2]
                       }}
                       transition={{ duration: 1.5, repeat: Infinity }}
                       className="absolute inset-0 bg-[#D2F677]"
                     />
                     <Zap className="w-5 h-5 text-black relative z-10 animate-pulse" />
                  </div>
                  <span className="text-xs font-black text-gray-400 uppercase tracking-[0.3em] italic">Synthesizing intelligence...</span>
                </motion.div>
              )}
           </AnimatePresence>
        </div>

        {/* Dynamic Action Input */}
        <div className="p-10 bg-transparent">
           <form 
             onSubmit={handleSendMessage}
             onDragEnter={handleDrag}
             onDragLeave={handleDrag}
             onDragOver={handleDrag}
             onDrop={handleDrop}
             className={`max-w-4xl mx-auto flex items-center gap-4 bg-white rounded-[3rem] p-3 transition-all duration-300 relative
               ${isDragging 
                 ? 'border border-[#D2F677] shadow-[0_0_40px_rgba(210,246,119,0.2)] scale-[1.02]' 
                 : 'border border-gray-200 shadow-[0_10px_28px_rgba(15,23,42,0.08)] focus-within:border-[#D2F677] focus-within:shadow-[0_0_30px_rgba(210,246,119,0.1)]'
               }`}
             style={
               !isDragging && hasModeSelection
                 ? {
                     borderColor: LIME_ACCENT,
                     boxShadow: `0 0 35px ${LIME_GLOW}`,
                   }
                 : undefined
             }
           >
              {!isDragging && hasModeSelection && (
                <div className="absolute -top-7 left-8 flex items-center gap-2">
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.3em]"
                    style={{
                      backgroundColor: `${LIME_ACCENT}66`,
                      color: '#0F172A',
                    }}
                  >
                    {isDeepMode ? 'Multi-Mode Active' : `${activeModeConfig?.label || 'Mode'} Active`}
                  </span>
                  <span
                    className="px-3 py-1 rounded-full bg-white text-[10px] font-black uppercase tracking-[0.2em] text-gray-500"
                    style={{ border: `1px solid ${LIME_ACCENT}` }}
                  >
                    {isDeepMode
                      ? `Modes: ${selectedModes.map((mode) => NEBULAE_MODE_CONFIG[mode].buttonLabel).join(' + ')}`
                      : `Focus: ${activeModeConfig?.focus || ''}`}
                  </span>
                  {!isSubAdminPortal && (
                    <span
                      className="px-3 py-1 rounded-full bg-white text-[10px] font-black uppercase tracking-[0.2em] text-gray-500"
                      style={{ border: `1px solid ${LIME_ACCENT}` }}
                    >
                      {`Context: ${contextLabel}`}
                    </span>
                  )}
                </div>
              )}
              {isDragging && (
                <div className="absolute inset-0 z-10 bg-[#D2F677]/10 rounded-[3rem] flex items-center justify-center pointer-events-none">
                  <div className="flex items-center gap-3 px-6 py-3 bg-[#D2F677] text-black rounded-full shadow-lg scale-110">
                    <Plus className="w-5 h-5 animate-bounce" />
                    <span className="text-xs font-black uppercase tracking-widest">Drop files to attach</span>
                  </div>
                </div>
              )}
              <input 
                type="file" 
                id="nebulae-file-upload" 
                className="hidden" 
                multiple
                accept="image/*,.doc,.docx,.pdf,.txt"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  const newAttachments = files.map(file => ({
                    file,
                    type: file.type.startsWith('image/') ? 'image' : 'document',
                    preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
                  }));
                  setAttachments(prev => [...prev, ...newAttachments]);
                }}
              />
              
              {/* Attachment Previews */}
              {attachments.length > 0 && (
                <div className="absolute bottom-full left-0 mb-4 flex flex-wrap gap-2 px-12">
                   {attachments.map((at, i) => (
                     <div key={i} className="relative group p-2 bg-white rounded-xl border border-gray-100 shadow-sm flex items-center gap-2">
                         {at.type === 'image' ? (
                           <img src={at.preview} className="w-10 h-10 rounded-lg object-cover" />
                         ) : (
                           <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                              <FileText className="w-5 h-5 text-gray-500" />
                           </div>
                         )}
                        <span className="text-[10px] font-bold text-gray-500 max-w-[100px] truncate">{at.file.name}</span>
                        <button 
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center scale-0 group-hover:scale-100 transition-transform shadow-sm"
                        >
                           <X className="w-3 h-3" />
                        </button>
                     </div>
                   ))}
                </div>
              )}

              <button 
                type="button"
                onClick={() => document.getElementById('nebulae-file-upload')?.click()}
                className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center text-gray-500 hover:bg-gray-100 transition-colors"
              >
                 <Plus className="w-6 h-6" />
              </button>
              <input 
                type="text" 
                value={input}
                onChange={(e) => setInput(e.target.value)}
                ref={inputRef}
                placeholder={
                  isDeepMode
                    ? 'Multi-mode active: ask for full cross-factor analysis across selected features...'
                    : activeModeConfig?.inputPlaceholder || 'Select one or more mode buttons above, then ask your question...'
                }
                className="flex-1 bg-transparent border-none focus:ring-0 text-gray-900 placeholder:text-gray-400 font-bold text-lg"
              />
              <button 
                type="submit"
                disabled={!input.trim() || isThinking}
                className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center hover:bg-gray-800 hover:scale-105 active:scale-95 transition-all disabled:opacity-20 disabled:grayscale shadow-lg"
              >
                 <Send className="w-6 h-6" />
              </button>
           </form>
        </div>
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div 
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 200 }}
            className="w-[420px] h-full bg-white flex flex-col p-10 relative z-20 border-l border-gray-100 shadow-2xl"
          >
             <div className="mb-12">
                <h3 className="text-xs font-[1000] text-gray-400 uppercase tracking-[0.5em] mb-4">
                  {isDeepMode ? 'Multi-Mode Intelligence' : activeModeConfig?.sidebarEyebrow}
                </h3>
                 <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black text-gray-900 italic uppercase tracking-tighter">
                      {isDeepMode ? 'Cross-Factor Command Center' : activeModeConfig?.sidebarTitle}
                    </h2>
                 </div>
             </div>

             <div className="grid grid-cols-3 gap-3 mb-8">
               {modeMetrics.map((metric) => (
                 <div
                   key={metric.label}
                   className="rounded-2xl p-3"
                   style={{
                     backgroundColor: `${LIME_ACCENT}55`,
                     border: `1px solid ${LIME_ACCENT}`,
                   }}
                 >
                   <p className="text-[9px] font-black uppercase tracking-[0.18em] text-gray-400">
                     {metric.label}
                   </p>
                   <p className="mt-2 text-sm font-black text-gray-900">
                     {metric.value}
                   </p>
                 </div>
               ))}
             </div>

             {/* Discovery Stream */}
             <div className="flex-1 space-y-6 overflow-y-auto no-scrollbar">
                {activeGroundingResults.length > 0 ? (
                  activeGroundingResults.map((res, j) => (
                    <motion.div 
                      key={j}
                      initial={{ x: 20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: j * 0.1 }}
                      className="p-6 rounded-[2rem] transition-all group cursor-pointer shadow-sm"
                      style={{
                        backgroundColor: `${LIME_ACCENT}22`,
                        border: `1px solid ${LIME_ACCENT}`,
                      }}
                    >
                       <div className="flex justify-between items-start mb-4">
                          <div
                            className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 transition-all"
                            style={{ backgroundColor: `${LIME_ACCENT}66` }}
                          >
                             <ActiveModeIcon className="w-5 h-5" />
                          </div>
                          <ExternalLink className="w-4 h-4 text-gray-300 transition-colors" />
                       </div>
                       <h4 className="font-bold text-gray-900 text-base leading-snug mb-2 transition-colors">
                          {res.web?.title || "Verification Pending"}
                       </h4>
                          <p className="text-xs text-gray-400 font-medium line-clamp-2">
                          {isDeepMode
                            ? 'Multi-mode reasoning combines selected features to compute cross-factor operational guidance.'
                            : activeModeConfig?.insightLine}
                       </p>
                    </motion.div>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-center py-20 opacity-40">
                     <div className="w-20 h-20 rounded-[2.5rem] bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center mb-6">
                      <AlertCircle className="w-8 h-8 text-gray-300" />
                     </div>
                     <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Awaiting Queries</h4>
                     <p className="text-[10px] font-bold text-gray-400 max-w-[200px] mt-2">
                       {isDeepMode
                         ? 'Ask a multi-mode question to compute combined insights across your selected features.'
                         : activeModeConfig?.sidebarEmpty}
                     </p>
                  </div>
                )}
             </div>

             {/* AI Health & Status / Controls */}
             <div className="mt-10 pt-10 border-t border-gray-100 space-y-6">
                <button 
                  onClick={() => {
                     const filtered = groundingResults.filter((result: any) => !doesResultMatchCurrentSelection(result));
                     setGroundingResults(filtered);
                     if (chatId) {
                       const db = getFirestoreDb();
                       updateDoc(doc(db, 'nebulae_chats', chatId), { groundingResults: filtered });
                     }
                  }}
                  className="w-full py-5 rounded-2xl text-black font-[1000] text-xs uppercase tracking-[0.2em] italic hover:bg-black hover:text-white transition-all shadow-xl shadow-black/5"
                  style={{ backgroundColor: LIME_ACCENT }}
                >
                   {isDeepMode ? 'Refresh Multi-Mode' : activeModeConfig?.refreshLabel}
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
