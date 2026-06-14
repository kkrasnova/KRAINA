



- Mobile runtime now uses Firebase Auth/Firestore/Storage/Functions.
- `backend/` is no longer required for app runtime calls.
- `EXPO_PUBLIC_KRAINA_API_URL` is retained only for rollback diagnostics.
- Password reset can use custom localized email via Cloud Function `sendPasswordResetEmailCustom`.



1. Prepare service account JSON and export into:
   - `FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'`
2. Ensure PostgreSQL archive is reachable:
   - `DATABASE_URL=...`
3. Run one-time migration:
   - `cd backend && npm run migrate:firestore`



- `RESEND_API_KEY` - API key from Resend (format `re_...`)
- `RESET_MAIL_FROM` - sender address, e.g. `KRAINA <noreply@yourdomain.com>`
- `RESET_MAIL_REPLY_TO` - support mailbox
- `RESET_PASSWORD_CONTINUE_URL` - URL where user lands after reset click



- Keep PostgreSQL in read-only archive mode for audits.
- Keep `backend/` service disabled in daily development/runtime.
- If rollback is needed, restore API endpoints via feature flag and replay from archive.
