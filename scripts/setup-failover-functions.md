# Failover Cloud Functions (Pay + Email while Convex is down)

## 1. Install + login
```bash
cd D:\dkmerch-react\functions
npm install
cd ..
npx firebase login
npx firebase use dkmerch-2b2c3
```

## 2. Set secrets (same values as Convex env where possible)
```bash
npx firebase functions:secrets:set PAYMONGO_SECRET_KEY
npx firebase functions:secrets:set BREVO_API_KEY
npx firebase functions:secrets:set RESEND_API_KEY
npx firebase functions:secrets:set FAILOVER_FN_SECRET
```
Pick a long random string for `FAILOVER_FN_SECRET`.

Optional site URL param (Firebase console → Functions → failoverCheckoutAssist → SITE_URL)
or default `https://dkmerchwebsite.vercel.app`.

## 3. Deploy functions + rules
```bash
npx firebase deploy --only functions,firestore:rules
```

## 4. Client env (`.env`)
```
REACT_APP_FAILOVER_FN_URL=https://asia-southeast1-dkmerch-2b2c3.cloudfunctions.net/failoverCheckoutAssist
REACT_APP_FAILOVER_FN_SECRET=<same secret>
```

Restart CRA after changing env.

## Notes
- Requires Firebase **Blaze** plan for outbound PayMongo/email API calls.
- Checkout uses this automatically when Convex createPaymentLink fails / order used failover.
