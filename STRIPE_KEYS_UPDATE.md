# How to Update Stripe Keys

## Overview
This project uses Stripe for payment processing. There are two keys that need to be configured:

1. **Stripe Secret Key** (Backend) - Used in Firebase Functions
2. **Stripe Publishable Key** (Frontend) - Used in the client-side code

## 1. Update Stripe Secret Key (Firebase Secret)

The secret key is stored as a Firebase secret. To update it:

### Using Firebase CLI:

```bash
# Set the new secret key
firebase functions:secrets:set STRIPE_SECRET_KEY

# When prompted, paste your new Stripe secret key
# Format: sk_live_... or sk_test_...
```

### Alternative: Using Firebase Console

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to **Functions** → **Secrets** (or **Config** → **Secrets**)
4. Click **Add Secret** or edit existing `STRIPE_SECRET_KEY`
5. Enter your new Stripe secret key
6. Save

### After updating the secret:

```bash
# Redeploy your functions to use the new secret
firebase deploy --only functions
```

## 2. Update Stripe Publishable Key (Frontend)

The publishable key can be set in multiple ways (in order of priority):

### Option A: Environment Variable (Recommended for Production)

Create or update your `.env` file in the project root:

```env
PUBLIC_STRIPE_PUBLISHABLE_KEY=REDACTED_STRIPE_LIVE_PUBLISHABLE_KEY_NEW_KEY_HERE
```

Then rebuild your site:
```bash
npm run build
```

### Option B: Update Hardcoded Value

Edit `js/modules/billing.js` line 7-9 and replace the key:

```javascript
const STRIPE_PUBLISHABLE_KEY = 
  window.STRIPE_PUBLISHABLE_KEY || 
  window.PUBLIC_STRIPE_PUBLISHABLE_KEY || 
  'REDACTED_STRIPE_LIVE_PUBLISHABLE_KEY_NEW_KEY_HERE';  // ← Update this
```

### Option C: Set via Window Object (For Testing)

You can also set it dynamically in the browser console or in your HTML:

```html
<script>
  window.STRIPE_PUBLISHABLE_KEY = 'REDACTED_STRIPE_LIVE_PUBLISHABLE_KEY_NEW_KEY_HERE';
</script>
```

## 3. Update Default Secret Key in Code (Optional)

If you want to update the fallback default in `functions/index.js`:

Edit line 25 in `functions/index.js`:

```javascript
const DEFAULT_STRIPE_SECRET_KEY = 'REDACTED_STRIPE_LIVE_SECRET_KEY_NEW_KEY_HERE';
```

**Note:** This is only used as a fallback if the Firebase secret is not set. It's better to use Firebase secrets.

## Verification

After updating:

1. **Test the checkout flow** - Try clicking "Start Monthly Plan" on the pricing page
2. **Check browser console** - Look for any Stripe-related errors
3. **Check Firebase Functions logs** - Verify the secret key is being used correctly

## Security Notes

- ⚠️ **Never commit secret keys to git**
- ✅ Secret keys should only be in Firebase secrets
- ✅ Publishable keys can be in environment variables (they're safe to expose)
- ✅ Use test keys (`sk_test_`, `pk_test_`) for development
- ✅ Use live keys (`sk_live_`, `pk_live_`) for production

## Current Configuration

- **Secret Key Location**: Firebase Secret `STRIPE_SECRET_KEY`
- **Publishable Key Locations**:
  - `js/modules/billing.js` (hardcoded fallback)
  - `src/components/widgets/Pricing.astro` (reads from `PUBLIC_STRIPE_PUBLISHABLE_KEY` env var)
  - Can be set via `window.STRIPE_PUBLISHABLE_KEY` or `window.PUBLIC_STRIPE_PUBLISHABLE_KEY`

