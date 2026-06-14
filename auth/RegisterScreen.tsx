import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from './authStore';
import { formatAuthError } from './formatError';
import type { AuthStackParamList } from './navigation.types';
import { authColors, authStyles, isPasswordStrong } from './theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const busy = useAuthStore((s) => s.busy);
  const registerWithPassword = useAuthStore((s) => s.registerWithPassword);

  const onRegister = async () => {
    const u = username
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    const em = email.trim();
    if (!u || !em || !password) {
      Alert.alert('Реєстрація', 'Заповніть усі поля.');
      return;
    }
    if (!isPasswordStrong(password)) {
      Alert.alert('Реєстрація', 'Пароль має бути не коротше 8 символів і містити цифру.');
      return;
    }
    if (!/^[a-z0-9_]{3,32}$/.test(u)) {
      Alert.alert('Реєстрація', 'Нікнейм: 3-32 символи, лише латиниця, цифри та _.');
      return;
    }
    try {
      await registerWithPassword(em, password, u);
      navigation.replace('PostAuthHome');
    } catch (e) {
      Alert.alert('Реєстрація', formatAuthError(e));
    }
  };

  return (
    <ScrollView style={authStyles.flex} contentContainerStyle={authStyles.scrollContent}>
      <Text style={authStyles.title}>Реєстрація</Text>
      <Text style={authStyles.subtitle}>Email, пароль та нікнейм</Text>

      <Text style={authStyles.label}>Нікнейм</Text>
      <TextInput
        style={authStyles.input}
        placeholder="mandrivnyk"
        placeholderTextColor={authColors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="nickname"
        value={username}
        onChangeText={setUsername}
      />

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
        onPress={onRegister}
        disabled={busy}
      >
        <Text style={authStyles.primaryBtnText}>Зареєструватись</Text>
      </Pressable>

      <Pressable style={authStyles.secondaryBtn} onPress={() => navigation.navigate('Login')}>
        <Text style={authStyles.secondaryBtnText}>Вже є акаунт — увійти</Text>
      </Pressable>
    </ScrollView>
  );
}
