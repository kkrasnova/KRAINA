export type AuthStackParamList = {
  SplashAuth: undefined;
  AuthMain: { tab?: 'login' | 'register' } | undefined;
  /** @deprecated — використовуй AuthMain */
  Login: { tab?: 'login' } | undefined;
  /** @deprecated — використовуй AuthMain */
  Register: { tab?: 'register' } | undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string } | undefined;
  PostAuthHome: undefined;
};
