import { StyleSheet } from 'react-native';

export const authColors = {
  bg: '#0A0A0F',
  accent: '#C8F135',
  text: '#F4F4F5',
  muted: '#A1A1AA',
  border: '#27272A',
  error: '#F87171',
};

export const authStyles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: authColors.bg },
  scrollContent: { padding: 24, paddingBottom: 48 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: authColors.text,
    marginBottom: 8,
  },
  subtitle: { fontSize: 15, color: authColors.muted, marginBottom: 24 },
  label: { fontSize: 13, color: authColors.muted, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: authColors.text,
    fontSize: 16,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: authColors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: { color: '#0A0A0F', fontSize: 16, fontWeight: '600' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { color: authColors.accent, fontSize: 15 },
  linkRow: { marginTop: 16, alignItems: 'center' },
  errorText: { color: authColors.error, fontSize: 14, marginBottom: 8 },
  oauthRow: { flexDirection: 'row', gap: 12, marginTop: 20, justifyContent: 'center' },
  oauthBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: authColors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  oauthBtnText: { color: authColors.text, fontSize: 14, fontWeight: '500' },
});

export function isPasswordStrong(password: string): boolean {
  return password.length >= 8 && /\d/.test(password);
}
