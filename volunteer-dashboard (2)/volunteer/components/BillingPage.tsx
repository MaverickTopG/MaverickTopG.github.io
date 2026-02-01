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
import { getFirebaseAuth } from '../lib/firebase';

export const BillingPage: React.FC = () => {
  const [subscription, setSubscription] = useState<any | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<any | null>(null);
  const [lastInvoice, setLastInvoice] = useState<any | null>(null);
  const stripePriceIds = useMemo(() => {
    const globalConfig = (window as Window & Record<string, string | undefined>);
    return {
      orgMonthly: globalConfig.PUBLIC_STRIPE_PRICE_MONTHLY || import.meta.env.PUBLIC_STRIPE_PRICE_MONTHLY || '',
      orgYearly: globalConfig.PUBLIC_STRIPE_PRICE_YEARLY || import.meta.env.PUBLIC_STRIPE_PRICE_YEARLY || '',
      schoolMonthly: globalConfig.PUBLIC_STRIPE_PRICE_SCHOOL || import.meta.env.PUBLIC_STRIPE_PRICE_SCHOOL || '',
      schoolYearly: globalConfig.PUBLIC_STRIPE_PRICE_SCHOOL_YEARLY || import.meta.env.PUBLIC_STRIPE_PRICE_SCHOOL_YEARLY || '',
    };
  }, []);

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
          fetch('/api/invoices?limit=6', { headers }),
        ]);

        if (!subsResponse.ok || !invoicesResponse.ok) {
          throw new Error('Billing endpoints unavailable.');
        }

        const subsData = await subsResponse.json();
        const invData = await invoicesResponse.json();

        // Debug log to help identify missing Stripe fields
        console.log('[Billing Debug] Subscription Data:', subsData);
        console.log('[Billing Debug] Invoice Data:', invData);

        setSubscription(subsData.subscription || null);
        setPaymentMethod(subsData.paymentMethod || null);
        setLastInvoice(subsData.lastInvoice || null);
        setInvoices(invData.invoices || []);
        setBillingError(null);
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
    const price = subscription?.items?.data?.[0]?.price;
    const priceId = price?.id || subscription?.plan?.id || subscription?.plan || null;
    const planKey = subscription?.metadata?.plan_key || subscription?.metadata?.planKey || null;
    const amount = price?.unit_amount ? price.unit_amount / 100 : null;
    const interval = price?.recurring?.interval || 'month';
    const intervalLabel = interval === 'year' ? 'yr' : 'mo';
    const intervalLabelFull = interval === 'year' ? 'year' : 'month';
    const resolvedPlanType =
      priceId && (priceId === stripePriceIds.schoolMonthly || priceId === stripePriceIds.schoolYearly)
        ? 'school'
        : 'org';
    const planName = `${resolvedPlanType === 'school' ? 'School' : 'Organization'} ${interval === 'year' ? 'Yearly' : 'Monthly'} Plan`;
    const status = subscription?.status || 'inactive';
    const cancelAtPeriodEnd = Boolean(subscription?.cancel_at_period_end);
    const rawPeriodEnd = subscription?.current_period_end || subscription?.currentPeriodEnd || null;
    const normalizedPeriodEnd = rawPeriodEnd
      ? (rawPeriodEnd > 1_000_000_000_000 ? rawPeriodEnd : rawPeriodEnd * 1000)
      : null;
    const rawInvoiceCreated = lastInvoice?.created || null;
    const normalizedInvoiceCreated = rawInvoiceCreated
      ? (rawInvoiceCreated > 1_000_000_000_000 ? rawInvoiceCreated : rawInvoiceCreated * 1000)
      : null;
    let nextInvoiceDate = normalizedPeriodEnd ? new Date(normalizedPeriodEnd) : null;
    if (!nextInvoiceDate && normalizedInvoiceCreated) {
      const baseDate = new Date(normalizedInvoiceCreated);
      if (interval === 'year') {
        baseDate.setFullYear(baseDate.getFullYear() + 1);
      } else {
        baseDate.setMonth(baseDate.getMonth() + 1);
      }
      nextInvoiceDate = baseDate;
    }
    let effectiveAmount = amount;
    if (effectiveAmount == null) {
      effectiveAmount = interval === 'year' ? 50 : 5;
    }
    return {
      planName,
      amount: effectiveAmount,
      intervalLabel,
      intervalLabelFull,
      status,
      cancelAtPeriodEnd,
      nextInvoiceDate,
      planType: resolvedPlanType,
    };
  }, [lastInvoice, stripePriceIds, subscription]);

  const planType = planDetails.planType;

  const isMonthlyPlan = useMemo(() => {
    const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval || 'month';
    return interval === 'month';
  }, [subscription]);

  const startUpgrade = async () => {
    if (!isMonthlyPlan) return;
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    const targetPriceId = planType === 'school' ? stripePriceIds.schoolYearly : stripePriceIds.orgYearly;
    if (!targetPriceId) {
      setBillingError('Yearly pricing is not configured yet.');
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
        priceId: targetPriceId,
        trial: false,
      }),
    });
    if (!response.ok) {
      throw new Error('Unable to start upgrade checkout.');
    }
    const data = await response.json();
    if (data?.url) {
      window.location.href = data.url;
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
      throw new Error('Unable to open billing portal.');
    }
    const data = await response.json();
    if (data?.url) {
      window.location.href = data.url;
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
                    <button
                      onClick={isMonthlyPlan ? startUpgrade : openPortal}
                      className={`px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2 ${
                        'bg-gray-900 hover:bg-black text-white shadow-gray-900/10'
                      }`}
                    >
                        <Zap className="w-4 h-4 fill-current" />
                        {isMonthlyPlan ? 'Switch to Yearly' : 'Switch to Monthly'}
                    </button>
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
                                <span className="block text-xs text-lime-300 font-bold uppercase tracking-wide">Next Invoice</span>
                                <span className="text-sm font-medium text-white/90">
                                  {planDetails.nextInvoiceDate
                                    ? planDetails.nextInvoiceDate.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
                                    : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Plan Benefits removed */}

        </motion.div>
      </div>

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
                       {inv.amountPaid != null ? `$${(inv.amountPaid / 100).toFixed(2)}` : '—'}
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
