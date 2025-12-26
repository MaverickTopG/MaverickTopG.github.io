export const SCHOOL_PLAN_KEY = 'school';
export const SCHOOL_PRODUCT_ID = 'prod_TUYT6k3Xq3JUOJ';

function normalizeId(value) {
  return (value || '').toString().trim();
}

export function normalizePlanKey(value) {
  const key = normalizeId(value).toLowerCase();
  return key || null;
}

export function collectSubscriptionProductIds(subscription = {}) {
  const products = new Set();

  const tryAdd = (value) => {
    const normalized = normalizeId(value);
    if (normalized) products.add(normalized);
  };

  tryAdd(subscription.product);
  tryAdd(subscription.plan?.product);
  tryAdd(subscription.plan_product || subscription.planProduct);

  const items = Array.isArray(subscription.items?.data)
    ? subscription.items.data
    : Array.isArray(subscription.items)
      ? subscription.items
      : [];

  items.forEach((item) => {
    tryAdd(item?.price?.product || item?.productId || item?.product);
  });

  return Array.from(products);
}

export function isSchoolPlan(subscription) {
  if (!subscription) return false;

  const planKey = normalizePlanKey(
    subscription.planKey
    || subscription.plan_key
    || subscription.metadata?.plan_key
  );
  if (planKey === SCHOOL_PLAN_KEY) return true;

  const products = collectSubscriptionProductIds(subscription);
  return products.some((id) => id === SCHOOL_PRODUCT_ID);
}

export function resolveDefaultSharePolicy(subscription) {
  // Only enforce default sharing for school plans.
  if (isSchoolPlan(subscription)) return 'required';
  return 'optional';
}
