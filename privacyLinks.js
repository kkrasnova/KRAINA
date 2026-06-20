/**
 * URL та email для екрана конфіденційності.
 * Задайте у `.env` (Expo / Metro): EXPO_PUBLIC_PRIVACY_POLICY_URL, EXPO_PUBLIC_TERMS_URL,
 * EXPO_PUBLIC_PRIVACY_EMAIL або EXPO_PUBLIC_SUPPORT_EMAIL.
 */
function readEnv(key) {
  try {
    if (typeof process === 'undefined' || !process.env) return '';
    const v = process.env[key];
    return v && String(v).trim() ? String(v).trim() : '';
  } catch {
    return '';
  }
}

function isHttpUrl(s) {
  return /^https?:\/\//i.test(s);
}

export function getPrivacyPolicyUrl() {
  const u = readEnv('EXPO_PUBLIC_PRIVACY_POLICY_URL');
  return isHttpUrl(u) ? u : '';
}

export function getTermsOfServiceUrl() {
  const u = readEnv('EXPO_PUBLIC_TERMS_URL');
  return isHttpUrl(u) ? u : '';
}

export function getPrivacyContactEmail() {
  return (
    readEnv('EXPO_PUBLIC_PRIVACY_EMAIL') ||
    readEnv('EXPO_PUBLIC_SUPPORT_EMAIL') ||
    'support@kraina.world'
  );
}
