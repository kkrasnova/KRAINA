
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_payment_provider_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_payment_provider_check CHECK (
    payment_provider IS NULL
    OR payment_provider IN ('apple', 'google', 'stripe', 'admin')
  );
