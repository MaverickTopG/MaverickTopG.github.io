export const appState = {
  tabId: Math.random().toString(36).substr(2, 9),
  isAuthenticated: false,
  currentAdmin: null,
  currentOrgCode: null,
  volunteersData: [],
  activityData: [],
  volunteersUnsub: null,
  logsUnsub: null,
  weeklyChart: null,
  chartWeekOffset: 0,
  trendChart: null,
  comparisonChart: null,
  heatmapDataCache: null,
  analyticsState: {
    trendMetric: 'hours',
    comparisonCategory: 'campaign',
    comparisonValue: 'hours',
    comparisonMode: 'stacked',
    heatmapYear: new Date().getFullYear()
  },
  approvalsExpanded: false,
  rolesCatalog: [
    { id: 'super-admin', name: 'Super Admin', description: 'Global oversight with full access.' },
    { id: 'org-admin', name: 'Org Admin', description: 'Manages organization-wide settings and teams.' },
    { id: 'program-manager', name: 'Program Manager', description: 'Runs programs, events, and campaigns.' },
    { id: 'scheduler', name: 'Scheduler', description: 'Plans shifts, capacity, and waitlists.' },
    { id: 'auditor', name: 'Read-only Auditor', description: 'Read-only access for compliance reviews.' },
    { id: 'volunteer', name: 'Volunteer', description: 'Standard volunteer access.' }
  ],
  verification: {
    status: 'pending',
    lastSubmittedAt: null,
    reviewerNotes: [],
    documents: []
  },
  verificationTimeline: [],
  verificationUnsub: null,
  approvalQueue: [],
  programTemplates: [],
  programTemplatesUnsub: null,
  scheduledReports: [],
  reportSchedulesUnsub: null,
  roleManagerSelection: new Set(),
  authInitialized: false
};
