import { useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from './authStore';
import { formatAuthError } from './formatError';
import type { AuthStackParamList } from './navigation.types';
import { authColors, authStyles } from './theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const busy = useAuthStore((s) => s.busy);
  const loginWithPassword = useAuthStore((s) => s.loginWithPassword);
  const loginWithGoogleIdToken = useAuthStore((s) => s.loginWithGoogleIdToken);
  const loginWithAppleIdentityToken = useAuthStore((s) => s.loginWithAppleIdentityToken);

  useEffect(() => {
    const wid =
      typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID : '';
    if (wid && typeof wid === 'string') {
      GoogleSignin.configure({ webClientId: wid });
    }
  }, []);

  const onEmailLogin = async () => {
    const em = email.trim();
    if (!em || !password) {
      Alert.alert('Помилка', 'Введіть email і пароль.');
      return;
    }
    try {
      await loginWithPassword(em, password);
      navigation.replace('PostAuthHome');
    } catch (e) {
      Alert.alert('Вхід', formatAuthError(e));
    }
  };

  const onGoogle = async () => {
    try {
      if (Platform.OS === 'android') {
        await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      }
      await GoogleSignin.signIn();
      const tokens = await GoogleSignin.getTokens();
      if (!tokens.idToken) {
        Alert.alert('Google', 'Не вдалося отримати id_token.');
        return;
      }
      await loginWithGoogleIdToken(tokens.idToken);
      navigation.replace('PostAuthHome');
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === statusCodes.SIGN_IN_CANCELLED) return;
      Alert.alert('Google', formatAuthError(e));
    }
  };

  const onApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert('Apple', 'Не вдалося отримати identity_token.');
        return;
      }
      let fullName: string | null = null;
      if (credential.fullName) {
        const p = credential.fullName;
        const parts = [p.givenName, p.familyName].filter(Boolean);
        fullName = parts.length ? parts.join(' ') : null;
      }
      await loginWithAppleIdentityToken(credential.identityToken, fullName);
      navigation.replace('PostAuthHome');
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err?.code === 'ERR_REQUEST_CANCELED') return;
      Alert.alert('Apple', formatAuthError(e));
    }
  };

  const webConfigured =
    typeof process !== 'undefined' &&
    !!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.length;

  return (
    <ScrollView style={authStyles.flex} contentContainerStyle={authStyles.scrollContent}>
      <Text style={authStyles.title}>Вхід</Text>
      <Text style={authStyles.subtitle}>Обліковий запис KRAÏNA (бекенд API)</Text>

      <Text style={authStyles.label}>Email</Text>
      <TextInput
        style={authStyles.input}
        placeholder="you@example.com"
        placeholderTextColor={authColors.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={setEmail}
      />

      <Text style={authStyles.label}>Пароль</Text>
      <TextInput
        style={authStyles.input}
        placeholder="••••••••"
        placeholderTextColor={authColors.muted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable
        style={[authStyles.primaryBtn, busy && { opacity: 0.6 }]}
        onPress={onEmailLogin}
        disabled={busy}
      >
        <Text style={authStyles.primaryBtnText}>Увійти</Text>
      </Pressable>

      <Pressable style={authStyles.linkRow} onPress={() => navigation.navigate('ForgotPassword')}>
        <Text style={authStyles.secondaryBtnText}>Забули пароль?</Text>
      </Pressable>

      <Pressable style={authStyles.secondaryBtn} onPress={() => navigation.navigate('ResetPassword', {})}>
        <Text style={authStyles.secondaryBtnText}>Маю токен скидання</Text>
      </Pressable>

      <Pressable style={authStyles.secondaryBtn} onPress={() => navigation.navigate('Register')}>
        <Text style={authStyles.secondaryBtnText}>Створити акаунт</Text>
      </Pressable>

      <View style={authStyles.oauthRow}>
        <Pressable
          style={[authStyles.oauthBtn, (!webConfigured || busy) && { opacity: 0.45 }]}
          onPress={onGoogle}
          disabled={!webConfigured || busy}
        >
          <Text style={authStyles.oauthBtnText}>Google</Text>
        </Pressable>
        {Platform.OS === 'ios' ? (
          <Pressable
            style={[authStyles.oauthBtn, busy && { opacity: 0.6 }]}
            onPress={onApple}
            disabled={busy}
          >
            <Text style={authStyles.oauthBtnText}>Apple</Text>
          </Pressable>
        ) : (
          <View style={[authStyles.oauthBtn, { opacity: 0.35 }]}>
            <Text style={authStyles.oauthBtnText}>Apple (iOS)</Text>
          </View>
        )}
      </View>
      {!webConfigured ? (
        <Text style={[authStyles.subtitle, { marginTop: 12, fontSize: 12 }]}>
          Для Google задайте EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID у збірці.
        </Text>
      ) : null}
    </ScrollView>
  );
}
