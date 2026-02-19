import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  CreditCard, 
  CheckCircle2, 
  Download, 
  Zap, 
  Shield, 
  Clock, 
  ChevronRight, 
  AlertCircle,
  FileText
} from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseAuth, getFirebaseFunctions } from '../lib/firebase';

const DEFAULT_ORBIT_PRICE_ORG_MONTHLY = 'price_1T0r32H9sPZuClpwTCH9zACb';
const DEFAULT_ORBIT_PRICE_ORG_YEARLY = 'price_1T0r32H9sPZuClpw5S5tHVLf';
const DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY = 'price_1T0r32H9sPZuClpwyIXrwxgo';
const DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY = 'price_1T0r32H9sPZuClpwp0wrydOg';
const DEFAULT_NEBULA_PRICE_ORG_MONTHLY = 'price_1T0r31H9sPZuClpwgnehfez9';
const DEFAULT_NEBULA_PRICE_ORG_YEARLY = 'price_1T0r31H9sPZuClpwfGyHaVcq';
const DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY = 'price_1T0r31H9sPZuClpwNIUeJa7l';
const DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY = 'price_1T0r31H9sPZuClpw2ZnG20bj';
const DEFAULT_COSMOS_PRICE_ORG_MONTHLY = 'price_1T0r2wH9sPZuClpwNW8Gkjey';
const DEFAULT_COSMOS_PRICE_ORG_YEARLY = 'price_1T0r2wH9sPZuClpwLujOCPZK';
const DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY = 'price_1T0r2wH9sPZuClpwNW8Gkjey';
const DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY = 'price_1T0r2wH9sPZuClpwE0KCMSrA';

export const BillingPage: React.FC = () => {
  const [subscription, setSubscription] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<any | null>(null);
  const [lastInvoice, setLastInvoice] = useState<any | null>(null);
  const [planTier, setPlanTier] = useState<string>('orbit');
  const [pendingPlanTier, setPendingPlanTier] = useState<string | null>(null);
  const [pendingPlanEffectiveAt, setPendingPlanEffectiveAt] = useState<number | null>(null);
  const [grandfathered, setGrandfathered] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const stripePriceIds = useMemo(() => {
    const globalConfig = (window as unknown as Record<string, string | undefined>);
    return {
      orbitOrgMonthly: globalConfig.ORBIT_PRICE_ORG_MONTHLY || (import.meta as any).env.ORBIT_PRICE_ORG_MONTHLY || DEFAULT_ORBIT_PRICE_ORG_MONTHLY,
      orbitOrgYearly: globalConfig.ORBIT_PRICE_ORG_YEARLY || (import.meta as any).env.ORBIT_PRICE_ORG_YEARLY || DEFAULT_ORBIT_PRICE_ORG_YEARLY,
      orbitSchoolMonthly: globalConfig.ORBIT_PRICE_SCHOOL_MONTHLY || (import.meta as any).env.ORBIT_PRICE_SCHOOL_MONTHLY || DEFAULT_ORBIT_PRICE_SCHOOL_MONTHLY,
      orbitSchoolYearly: globalConfig.ORBIT_PRICE_SCHOOL_YEARLY || (import.meta as any).env.ORBIT_PRICE_SCHOOL_YEARLY || DEFAULT_ORBIT_PRICE_SCHOOL_YEARLY,
      nebulaOrgMonthly: globalConfig.NEBULA_PRICE_ORG_MONTHLY || (import.meta as any).env.NEBULA_PRICE_ORG_MONTHLY || DEFAULT_NEBULA_PRICE_ORG_MONTHLY,
      nebulaOrgYearly: globalConfig.NEBULA_PRICE_ORG_YEARLY || (import.meta as any).env.NEBULA_PRICE_ORG_YEARLY || DEFAULT_NEBULA_PRICE_ORG_YEARLY,
      nebulaSchoolMonthly: globalConfig.NEBULA_PRICE_SCHOOL_MONTHLY || (import.meta as any).env.NEBULA_PRICE_SCHOOL_MONTHLY || DEFAULT_NEBULA_PRICE_SCHOOL_MONTHLY,
      nebulaSchoolYearly: globalConfig.NEBULA_PRICE_SCHOOL_YEARLY || (import.meta as any).env.NEBULA_PRICE_SCHOOL_YEARLY || DEFAULT_NEBULA_PRICE_SCHOOL_YEARLY,
      cosmosOrgMonthly: globalConfig.COSMOS_PRICE_ORG_MONTHLY || (import.meta as any).env.COSMOS_PRICE_ORG_MONTHLY || DEFAULT_COSMOS_PRICE_ORG_MONTHLY,
      cosmosOrgYearly: globalConfig.COSMOS_PRICE_ORG_YEARLY || (import.meta as any).env.COSMOS_PRICE_ORG_YEARLY || DEFAULT_COSMOS_PRICE_ORG_YEARLY,
      cosmosSchoolMonthly: globalConfig.COSMOS_PRICE_SCHOOL_MONTHLY || (import.meta as any).env.COSMOS_PRICE_SCHOOL_MONTHLY || DEFAULT_COSMOS_PRICE_SCHOOL_MONTHLY,
      cosmosSchoolYearly: globalConfig.COSMOS_PRICE_SCHOOL_YEARLY || (import.meta as any).env.COSMOS_PRICE_SCHOOL_YEARLY || DEFAULT_COSMOS_PRICE_SCHOOL_YEARLY,
    };
  }, []);

  const derivePlanTier = (subscription: any) => {
    const key = (
      subscription?.metadata?.plan_key
      || subscription?.metadata?.planKey
      || subscription?.plan?.metadata?.plan_key
      || subscription?.plan?.metadata?.planKey
    );
    if (typeof key === 'string') {
      const normalized = key.toLowerCase();
      if (['orbit', 'nebula', 'cosmos'].includes(normalized)) return normalized;
    }
    const productHints = [
      subscription?.items?.data?.[0]?.price?.product?.name,
      subscription?.items?.data?.[0]?.price?.nickname,
      subscription?.plan?.nickname,
      subscription?.plan?.name,
    ]
      .filter(Boolean)
      .map((value: unknown) => String(value).toLowerCase());
    if (productHints.some((value) => value.includes('orbit'))) return 'orbit';
    if (productHints.some((value) => value.includes('nebula'))) return 'nebula';
    if (productHints.some((value) => value.includes('cosmos'))) return 'cosmos';

    const priceId = subscription?.items?.data?.[0]?.price?.id
      || subscription?.plan?.id
      || subscription?.plan
      || null;
    if (!priceId) return null;
    if ([
      stripePriceIds.orbitOrgMonthly,
      stripePriceIds.orbitOrgYearly,
      stripePriceIds.orbitSchoolMonthly,
      stripePriceIds.orbitSchoolYearly
    ].includes(priceId)) return 'orbit';
    if ([
      stripePriceIds.nebulaOrgMonthly,
      stripePriceIds.nebulaOrgYearly,
      stripePriceIds.nebulaSchoolMonthly,
      stripePriceIds.nebulaSchoolYearly
    ].includes(priceId)) return 'nebula';
    if ([
      stripePriceIds.cosmosOrgMonthly,
      stripePriceIds.cosmosOrgYearly,
      stripePriceIds.cosmosSchoolMonthly,
      stripePriceIds.cosmosSchoolYearly
    ].includes(priceId)) return 'cosmos';
    return null;
  };

  useEffect(() => {
    if (!showPlans) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showPlans]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setSubscription(null);
        setInvoices([]);
        setLoading(false);
        return;
      }
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const [subsResponse, invoicesResponse] = await Promise.all([
          fetch('/api/subscriptions', { headers }),
          fetch('/api/invoices?limit=6', { headers }).catch(() => null),
        ]);

        if (!subsResponse.ok) {
          let message = 'Unable to load billing details.';
          try {
            const payload = await subsResponse.json();
            if (payload?.error) message = payload.error;
          } catch {
            // Keep fallback message.
          }
          throw new Error(message);
        }

        const subsData = await subsResponse.json();
        let invData: { invoices?: any[] } = { invoices: [] };
        if (invoicesResponse?.ok) {
          invData = await invoicesResponse.json();
        } else {
          console.warn('Invoice endpoint unavailable; falling back to subscription invoice history.');
        }

        // Debug log to help identify missing Stripe fields
        console.log('[Billing Debug] Subscription Data:', subsData);
        console.log('[Billing Debug] Invoice Data:', invData, 'Invoice response:', invoicesResponse?.status);

        const nextTier = (
          subsData.planTier
          || subsData.subscription?.planKey
          || derivePlanTier(subsData.subscription)
          || 'orbit'
        ).toString().toLowerCase();
        const normalizedTier = (nextTier === 'nebula' || nextTier === 'cosmos') ? nextTier : 'orbit';
        const mergedSubscription = {
          ...(subsData.subscription || {}),
          status: subsData.normalizedStatus || subsData.subscription?.status || null,
          trial_end: subsData.trialEnd || subsData.subscription?.trial_end || subsData.subscription?.trialEnd || null,
          current_period_end: subsData.currentPeriodEnd || subsData.subscription?.current_period_end || subsData.subscription?.currentPeriodEnd || null,
        };
        setSubscription(mergedSubscription);
        setPaymentMethod(subsData.paymentMethod || null);
        const fallbackInvoices = Array.isArray(subsData.invoiceHistory)
          ? subsData.invoiceHistory.slice(0, 6)
          : [];
        const resolvedInvoices = (invData.invoices && invData.invoices.length)
          ? invData.invoices
          : fallbackInvoices;
        setLastInvoice(subsData.lastInvoice || resolvedInvoices[0] || null);
        setInvoices(resolvedInvoices);
        setPlanTier(normalizedTier);
        const subInterval = mergedSubscription?.items?.data?.[0]?.price?.recurring?.interval
          || mergedSubscription?.items?.[0]?.interval
          || null;
        if (subInterval === 'year' || subInterval === 'yearly') {
          setBillingCycle('yearly');
        } else if (subInterval === 'month' || subInterval === 'monthly') {
          setBillingCycle('monthly');
        }
        setPendingPlanTier(subsData.pendingPlanTier ? String(subsData.pendingPlanTier).toLowerCase() : null);
        setPendingPlanEffectiveAt(subsData.pendingPlanEffectiveAt ? Number(subsData.pendingPlanEffectiveAt) : null);
        setGrandfathered(Boolean(subsData.grandfathered));
        setBillingError(null);
        window.dispatchEvent(new CustomEvent('nexolink:plan-updated', { detail: { planTier: normalizedTier } }));
      } catch (error) {
        console.error('Billing fetch failed', error);
        setBillingError('Unable to load billing details.');
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const planDetails = useMemo(() => {
    // Helper to extract nested price info regardless of snake_case or camelCase
    const getNestedPrice = () => {
      // 1. Raw Stripe format
      const stripePrice = subscription?.items?.data?.[0]?.price;
      if (stripePrice) return stripePrice;

      // 2. Local Firestore normalized format
      const localItem = subscription?.items?.[0];
      if (localItem) {
        return {
          id: localItem.priceId,
          unit_amount: localItem.amount,
          recurring: { interval: localItem.interval }
        };
      }

      // 3. Fallback to latest invoice line item
      const invoiceLine = invoices?.[0]?.lines?.find((line: any) => line?.priceId) || invoices?.[0]?.lines?.[0] || null;
      if (invoiceLine) {
        return {
          id: invoiceLine.priceId,
          unit_amount: invoiceLine.amount,
          recurring: { interval: invoiceLine.interval }
        };
      }

      // 4. Fallback for legacy plans
      return subscription?.plan || null;
    };

    const price = getNestedPrice();
    const priceId = typeof price === 'string' ? price : (price?.id || subscription?.plan?.id || subscription?.plan || null);
    const amount = typeof price === 'object' ? (price?.unit_amount ? price.unit_amount / 100 : null) : null;
    const rawInterval = typeof price === 'object' ? (price?.recurring?.interval || price?.interval || 'month') : 'month';
    const interval = rawInterval === 'yearly' || rawInterval === 'annual' || rawInterval === 'yr'
      ? 'year'
      : rawInterval === 'monthly'
        ? 'month'
        : rawInterval;
    const intervalLabel = interval === 'year' ? 'yr' : 'mo';
    const intervalLabelFull = interval === 'year' ? 'year' : 'month';

    const resolvedPlanType =
      priceId && (
        priceId === stripePriceIds.orbitSchoolMonthly
        || priceId === stripePriceIds.orbitSchoolYearly
        || priceId === stripePriceIds.nebulaSchoolMonthly
        || priceId === stripePriceIds.nebulaSchoolYearly
        || priceId === stripePriceIds.cosmosSchoolMonthly
        || priceId === stripePriceIds.cosmosSchoolYearly
      )
        ? 'school'
        : 'org';

    const resolvedTier =
      priceId && (
        priceId === stripePriceIds.orbitSchoolMonthly
        || priceId === stripePriceIds.orbitSchoolYearly
        || priceId === stripePriceIds.orbitOrgMonthly
        || priceId === stripePriceIds.orbitOrgYearly
      )
        ? 'orbit'
        : priceId && (
          priceId === stripePriceIds.cosmosSchoolMonthly
          || priceId === stripePriceIds.cosmosSchoolYearly
          || priceId === stripePriceIds.cosmosOrgMonthly
          || priceId === stripePriceIds.cosmosOrgYearly
        )
          ? 'cosmos'
          : priceId && (
            priceId === stripePriceIds.nebulaSchoolMonthly
            || priceId === stripePriceIds.nebulaSchoolYearly
            || priceId === stripePriceIds.nebulaOrgMonthly
            || priceId === stripePriceIds.nebulaOrgYearly
          )
            ? 'nebula'
            : null;

    const fallbackTier = (resolvedTier || planTier || 'orbit').toString().toLowerCase();
    const normalizedFallbackTier = (fallbackTier === 'nebula' || fallbackTier === 'cosmos') ? fallbackTier : 'orbit';
    const planName = `${normalizedFallbackTier.toUpperCase()} ${interval === 'year' ? 'Yearly' : 'Monthly'} Plan`;
    const status = (subscription?.status || '').toLowerCase() || (invoices?.length ? 'trialing' : 'inactive');
    const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end || subscription?.cancelAtPeriodEnd);

    // Date parsing helper
    const parseDate = (val: any) => {
      if (!val) return null;
      // Firestore Timestamp
      if (typeof val?.toMillis === 'function') return new Date(val.toMillis());
      // Milliseconds or Seconds
      const num = Number(val);
      if (isNaN(num)) return null;
      return new Date(num > 1_000_000_000_000 ? num : num * 1000);
    };

    const invoiceCreatedDate = parseDate(lastInvoice?.created || invoices?.[0]?.created);
    const trialEndDate = parseDate(subscription?.trial_end || subscription?.trialEnd)
      || (invoiceCreatedDate ? new Date(invoiceCreatedDate.getTime() + 14 * 24 * 60 * 60 * 1000) : null);
    const periodEndDate = parseDate(subscription?.current_period_end || subscription?.currentPeriodEnd);

    let nextInvoiceDate = periodEndDate;
    if (!nextInvoiceDate && invoiceCreatedDate) {
      const baseDate = new Date(invoiceCreatedDate);
      if (interval === 'year') {
        baseDate.setFullYear(baseDate.getFullYear() + 1);
      } else {
        baseDate.setMonth(baseDate.getMonth() + 1);
      }
      nextInvoiceDate = baseDate;
    }
    if (!nextInvoiceDate && trialEndDate) {
      nextInvoiceDate = new Date(trialEndDate);
    }

    let effectiveAmount = amount;
    if (effectiveAmount == null) {
      const invoiceAmount = typeof invoices?.[0]?.amountPaid === 'number'
        ? invoices[0].amountPaid / 100
        : typeof invoices?.[0]?.amountDue === 'number'
          ? invoices[0].amountDue / 100
          : null;
      if (invoiceAmount != null) {
        effectiveAmount = invoiceAmount;
      } else if (normalizedFallbackTier === 'nebula') {
        effectiveAmount = interval === 'year' ? 100 : 10;
      } else if (normalizedFallbackTier === 'cosmos') {
        effectiveAmount = interval === 'year' ? 150 : 15;
      } else {
        effectiveAmount = interval === 'year' ? 50 : 5;
      }
    }

    return {
      planName,
      amount: effectiveAmount,
      intervalLabel,
      intervalLabelFull,
      status,
      cancelAtPeriodEnd,
      nextInvoiceDate,
      trialEndDate,
      planType: resolvedPlanType,
      tierFromPrice: resolvedTier,
    };
  }, [invoices, lastInvoice, stripePriceIds, subscription, planTier]);

  const effectiveTier = (planDetails.tierFromPrice || planTier || 'orbit').toString().toLowerCase();
  const normalizedEffectiveTier = (effectiveTier === 'nebula' || effectiveTier === 'cosmos') ? effectiveTier : 'orbit';
  const currentTierLabel = normalizedEffectiveTier.toUpperCase();
  const inferredStatus = (() => {
    const raw = (planDetails.status || '').toString().toLowerCase();
    if (raw) return raw;
    if (planDetails.trialEndDate && planDetails.trialEndDate.getTime() > Date.now()) return 'trialing';
    if (subscription?.id) return 'active';
    if (planDetails.nextInvoiceDate) return 'active';
    if ((planDetails.amount || 0) > 0 && invoices.length > 0) return 'active';
    return 'inactive';
  })();
  const statusLabel = inferredStatus;
  const statusText = statusLabel === 'trialing'
    ? 'Trialing'
    : statusLabel === 'active'
      ? 'Active'
    : statusLabel === 'canceled'
      ? 'Deactivated'
    : statusLabel === 'past_due'
      ? 'Past Due'
    : 'Deactivated';
  const statusPillClass = statusLabel === 'active'
    ? 'bg-lime-300 text-gray-900'
    : statusLabel === 'trialing'
      ? 'bg-yellow-200 text-gray-900'
      : 'bg-gray-200 text-gray-600';

  const planOptions = [
    { key: 'orbit', title: 'Orbit', price: 5, yearlyPrice: 50, limit: 'Up to 50 volunteers' },
    { key: 'nebula', title: 'Nebula', price: 10, yearlyPrice: 100, limit: 'Up to 500 volunteers' },
    { key: 'cosmos', title: 'Cosmos', price: 15, yearlyPrice: 150, limit: 'Unlimited volunteers' },
  ];

  const planRank: Record<string, number> = { orbit: 0, nebula: 1, cosmos: 2 };

  const resolvePriceIdForTier = (tier: string, cycle: 'monthly' | 'yearly' = billingCycle) => {
    const interval = cycle === 'yearly' ? 'yearly' : 'monthly';
    if (planDetails.planType === 'school') {
      if (tier === 'orbit') return interval === 'yearly' ? stripePriceIds.orbitSchoolYearly : stripePriceIds.orbitSchoolMonthly;
      if (tier === 'nebula') return interval === 'yearly' ? stripePriceIds.nebulaSchoolYearly : stripePriceIds.nebulaSchoolMonthly;
      if (tier === 'cosmos') return interval === 'yearly' ? stripePriceIds.cosmosSchoolYearly : stripePriceIds.cosmosSchoolMonthly;
    }
    if (tier === 'orbit') return interval === 'yearly' ? stripePriceIds.orbitOrgYearly : stripePriceIds.orbitOrgMonthly;
    if (tier === 'nebula') return interval === 'yearly' ? stripePriceIds.nebulaOrgYearly : stripePriceIds.nebulaOrgMonthly;
    if (tier === 'cosmos') return interval === 'yearly' ? stripePriceIds.cosmosOrgYearly : stripePriceIds.cosmosOrgMonthly;
    return '';
  };

  const startTierCheckout = async (target: string, cycle: 'monthly' | 'yearly' = billingCycle) => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const priceId = resolvePriceIdForTier(target, cycle);
    if (!priceId) {
      setBillingError('Pricing is not configured for this tier yet.');
      return;
    }
    const token = await user.getIdToken();
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        priceId,
        plan: target,
        trial: false,
      }),
    });
    if (!response.ok) {
      setBillingError('Unable to start checkout.');
      window.location.assign('/pricing');
      return;
    }
    const data = await response.json();
    if (data?.url) {
      window.location.href = data.url;
    }
  };

  const schedulePlanChange = async (target: string) => {
    if (grandfathered) {
      setBillingError('Grandfathered accounts already have full access. No change required.');
      return;
    }
    try {
      const targetRank = planRank[target] ?? 0;
      const currentRank = planRank[normalizedEffectiveTier] ?? 0;
      if (targetRank > currentRank) {
        await startTierCheckout(target, billingCycle);
        return;
      }
      const functions = getFirebaseFunctions();
      const requestChange = httpsCallable(functions, 'requestPlanChange');
      const result = await requestChange({ targetTier: target });
      const data = result.data as any;
      if (data?.pendingPlanTier) {
        setPendingPlanTier(String(data.pendingPlanTier).toLowerCase());
        setPendingPlanEffectiveAt(Number(data.effectiveAt));
        setBillingError(null);
      }
    } catch (error: any) {
      setBillingError(error?.message || 'Unable to schedule plan change.');
    }
  };

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const item = {
    hidden: { y: 20, opacity: 0 },
    show: { y: 0, opacity: 1, transition: { type: "spring", stiffness: 50 } }
  };

  const openPortal = async () => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const response = await fetch('/api/portal', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        let message = 'Unable to open billing portal.';
        try {
          const payload = await response.json();
          if (payload?.error) message = payload.error;
        } catch {
          // ignore JSON parse failures and keep default message
        }
        setBillingError(message);
        return;
      }
      const data = await response.json();
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error: any) {
      setBillingError(error?.message || 'Unable to open billing portal.');
    }
  };

  const scrollToPlans = () => {
    const el = document.getElementById('plan-selection');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const cancelSubscription = async () => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    if (!window.confirm('Cancel your subscription? You will keep access until the end of the current period.')) {
      return;
    }
    const token = await user.getIdToken();
    await fetch('/api/cancelSubscription', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    window.location.reload();
  };

  return (
    <motion.div 
      variants={container}
      initial="hidden"
      animate="show"
      className="w-full flex flex-col gap-6 mt-8 pb-10"
    >
      {billingError && (
        <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-2xl text-sm font-medium">
          {billingError}
        </div>
      )}
      
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column: Plan Details */}
        <motion.div variants={item} className="xl:col-span-2 h-full flex flex-col">
            
            {/* Current Plan Card */}
            <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 relative overflow-hidden group h-full flex flex-col justify-between min-h-[240px]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-lime-300/10 rounded-full blur-3xl -mr-16 -mt-16 pointer-events-none transition-opacity group-hover:opacity-100 opacity-50"></div>
                
                <div className="flex justify-between items-start mb-8 relative z-10">
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-xl font-bold text-gray-900">{planDetails.planName}</h3>
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] ${statusPillClass}`}>
                              {statusText}
                            </span>
                        </div>
                        
                        {/* Payment Method Text Label */}
                        {paymentMethod?.type && (
                          <div className="mb-2">
                             <p className="text-gray-500 font-medium text-sm">
                               Payment Method: <span className="text-gray-900 font-bold">
                                 {paymentMethod.type === 'card' 
                                   ? (paymentMethod.brand || 'Card')
                                   : (paymentMethod.type.charAt(0).toUpperCase() + paymentMethod.type.slice(1))}
                               </span>
                             </p>
                          </div>
                        )}

                        {planDetails.cancelAtPeriodEnd && (
                          <p className="text-gray-500 font-medium text-sm">Cancels at period end</p>
                        )}
                    </div>
                    <div className="text-right"></div>
                </div>

                <div className="flex flex-wrap gap-3 relative z-10">
                    {normalizedEffectiveTier !== 'cosmos' && !grandfathered && (
                      <button
                        onClick={() => {
                          setShowPlans(true);
                          scrollToPlans();
                        }}
                        className="px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 bg-lime-300 hover:bg-lime-400 text-gray-900 shadow-lime-300/10"
                      >
                          <Zap className="w-4 h-4 fill-current" />
                          View Plans
                      </button>
                    )}
                    <button
                      onClick={cancelSubscription}
                      className="px-6 py-3 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-bold transition-colors"
                    >
                        Cancel Subscription
                    </button>
                </div>
            </div>

        </motion.div>

        {/* Right Column: Summary & Benefits */}
        <motion.div variants={item} className="xl:col-span-1 h-full flex flex-col">
            
            {/* Payment Visual Card */}
            <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-xl shadow-gray-900/20 h-full">
                {/* Decorative Circles */}
                <div className="absolute top-[-50px] right-[-50px] w-40 h-40 bg-white/5 rounded-full blur-2xl"></div>
                <div className="absolute bottom-[-20px] left-[-20px] w-32 h-32 bg-lime-300/20 rounded-full blur-2xl"></div>
                
                <div className="flex flex-col h-full justify-center min-h-[240px] relative z-10">
                    <div>
                        <div className="text-4xl font-medium tracking-tight mb-6">
                          {planDetails.amount != null ? `$${planDetails.amount}` : '$0'}
                          <span className="text-lg text-white/70 font-medium">/{planDetails.intervalLabelFull}</span>
                        </div>
                        
                        <div className="pt-6 border-t border-white/10 flex items-center gap-3">
                            <div className="p-2 bg-lime-300 rounded-full">
                                <Clock className="w-4 h-4 text-gray-900" />
                            </div>
                            <div>
                                <span className="block text-xs text-lime-300 font-bold uppercase tracking-wide">
                                  {statusLabel === 'trialing' ? 'Trial Ends' : 'Next Invoice'}
                                </span>
                                <span className="text-sm font-medium text-white/90">
                                  {statusLabel === 'trialing' && planDetails.trialEndDate
                                    ? planDetails.trialEndDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                                    : planDetails.nextInvoiceDate
                                      ? planDetails.nextInvoiceDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                                      : statusLabel === 'active'
                                        ? '—'
                                        : 'Inactive'}
                                </span>
                            </div>
                        </div>
                        <button
                          onClick={openPortal}
                          className="mt-6 w-full sm:w-auto px-5 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
                        >
                          <CreditCard className="w-4 h-4" />
                          Change Card
                        </button>
                    </div>
                </div>
            </div>

            {/* Plan Benefits removed */}

        </motion.div>
      </div>

      {showPlans && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-md"
            onClick={() => setShowPlans(false)}
          />
          <motion.div
            variants={item}
            initial="hidden"
            animate="show"
            className="relative w-full max-w-6xl mx-6 bg-white rounded-[2.5rem] shadow-2xl border border-gray-100 overflow-hidden"
          >
            <div className="p-8 border-b border-gray-100 flex flex-col gap-4 bg-gray-50/50">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-lg text-gray-900">Plans</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 rounded-full border border-gray-200 bg-white p-1 text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
                    <button
                      onClick={() => setBillingCycle('monthly')}
                      className={`px-3 py-1 rounded-full ${billingCycle === 'monthly' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setBillingCycle('yearly')}
                      className={`px-3 py-1 rounded-full ${billingCycle === 'yearly' ? 'bg-gray-900 text-white' : 'text-gray-500'}`}
                    >
                      Yearly
                    </button>
                  </div>
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">
                    Current: {currentTierLabel}
                  </span>
                  <button
                    onClick={() => setShowPlans(false)}
                    className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400 hover:text-gray-900"
                  >
                    Close
                  </button>
                </div>
              </div>
              {grandfathered && (
                <p className="text-sm text-lime-700 font-semibold">
                  Grandfathered access: full features unlocked.
                </p>
              )}
              {pendingPlanTier && (
                <p className="text-sm text-gray-500 font-medium">
                  Scheduled change to {pendingPlanTier.toUpperCase()} on{' '}
                  {pendingPlanEffectiveAt ? new Date(pendingPlanEffectiveAt).toLocaleDateString() : 'your renewal date'}.
                </p>
              )}
              <p className="text-sm text-gray-500">
                Downgrades take effect after your current plan ends. Existing volunteers remain visible, but new accepts
                are blocked if you exceed the new tier limit.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 p-10">
              {planOptions.map((option) => {
                const isCurrent = option.key === normalizedEffectiveTier;
                const isPending = pendingPlanTier === option.key;
                return (
                  <div
                    key={option.key}
                    className={`rounded-2xl border p-9 flex flex-col gap-4 ${
                      isCurrent ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-100 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-2xl font-bold">{option.title}</h4>
                      <span className={`text-sm font-bold uppercase tracking-[0.2em] ${isCurrent ? 'text-lime-300' : 'text-gray-400'}`}>
                        {isCurrent ? 'Active' : isPending ? 'Pending' : 'Plan'}
                      </span>
                    </div>
                    <div className={`text-5xl font-black ${isCurrent ? 'text-white' : 'text-gray-900'}`}>
                      ${billingCycle === 'yearly' ? option.yearlyPrice : option.price}
                      <span className={`text-sm font-semibold ${isCurrent ? 'text-white/60' : 'text-gray-400'}`}>
                        {billingCycle === 'yearly' ? '/yr' : '/mo'}
                      </span>
                    </div>
                    <p className={`text-base ${isCurrent ? 'text-white/70' : 'text-gray-500'}`}>{option.limit}</p>
                    <button
                      disabled={isCurrent || isPending || grandfathered}
                      onClick={() => schedulePlanChange(option.key)}
                      className={`mt-auto px-6 py-3 rounded-xl text-base font-bold transition ${
                        isCurrent || isPending || grandfathered
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-gray-900 text-white hover:bg-black'
                      }`}
                    >
                      {grandfathered 
                        ? 'Grandfathered' 
                        : isCurrent 
                          ? 'Current Plan' 
                          : isPending 
                            ? 'Scheduled' 
                            : (planRank[option.key] > planRank[normalizedEffectiveTier]) 
                              ? 'Buy Now' 
                              : 'Schedule Change'}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}

      {/* Invoice History */}
      <motion.div variants={item} className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
         <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
             <h3 className="font-bold text-lg text-gray-900">Billing History</h3>
             <button
               onClick={openPortal}
               className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
             >
                View All <ChevronRight className="w-4 h-4" />
             </button>
         </div>
         
         <div className="flex flex-col">
             {/* Header */}
             <div className="grid grid-cols-5 p-4 bg-gray-50/30 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">
                 <div className="col-span-2 pl-4">Invoice</div>
                 <div className="">Date</div>
                 <div className="">Amount</div>
                 <div className="text-right pr-4">Download</div>
             </div>

             {invoices.length === 0 ? (
               <div className="p-8 text-sm text-gray-500">No invoices available yet.</div>
             ) : invoices.map((inv) => (
                 <div key={inv.id} className="grid grid-cols-5 p-4 items-center hover:bg-gray-50/50 transition-colors border-b border-gray-50 last:border-0 group">
                     <div className="col-span-2 flex items-center gap-4 pl-4">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-white group-hover:shadow-sm transition-all">
                            <FileText className="w-5 h-5" />
                        </div>
                        <div>
                            <span className="block font-bold text-gray-900 text-sm">Invoice</span>
                            <span className="block text-xs text-gray-500 font-mono mt-0.5">{inv.id}</span>
                        </div>
                     </div>
                     <div className="text-sm font-medium text-gray-600">
                       {inv.created ? new Date(inv.created).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                     </div>
                     <div className="text-sm font-bold text-gray-900">
                       {inv.amountPaid != null
                         ? `$${(inv.amountPaid / 100).toFixed(2)}`
                         : inv.amountDue != null
                           ? `$${(inv.amountDue / 100).toFixed(2)}`
                           : '—'}
                     </div>
                     <div className="flex justify-end pr-4">
                        <button
                          onClick={() => {
                            if (inv.invoicePdf || inv.hostedInvoiceUrl) {
                              window.open(inv.invoicePdf || inv.hostedInvoiceUrl, '_blank');
                            }
                          }}
                          className="p-2 text-gray-400 hover:text-lime-600 hover:bg-lime-50 rounded-lg transition-colors"
                        >
                            <Download className="w-5 h-5" />
                        </button>
                     </div>
                 </div>
             ))}
         </div>
      </motion.div>

    </motion.div>
  );
};
