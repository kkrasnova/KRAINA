import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { postResetPassword } from './endpoints';
import { formatAuthError } from './formatError';
import type { AuthStackParamList } from './navigation.types';
import { authColors, authStyles, isPasswordStrong } from './theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const initialToken = route.params?.token ?? '';
  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async () => {
    const t = token.trim();
    if (!t) {
      Alert.alert('Скидання', 'Вставте токен з листа.');
      return;
    }
    if (!isPasswordStrong(password)) {
      Alert.alert('Скидання', 'Новий пароль: мінімум 8 символів і хоча б одна цифра.');
      return;
    }
    setBusy(true);
    try {
      const res = await postResetPassword({ token: t, new_password: password });
      if (res.message === 'password_reset') {
        Alert.alert('Готово', 'Пароль оновлено. Увійдіть знову.', [
          { text: 'OK', onPress: () => navigation.navigate('AuthMain') },
        ]);
      }
    } catch (e) {
      Alert.alert('Помилка', formatAuthError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={authStyles.flex} contentContainerStyle={authStyles.scrollContent}>
      <Text style={authStyles.title}>Новий пароль</Text>
      <Text style={authStyles.subtitle}>Токен з листа та новий пароль.</Text>

      <Text style={authStyles.label}>Токен</Text>
      <TextInput
        style={authStyles.input}
        placeholder="opaque token"
        placeholderTextColor={authColors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        value={token}
        onChangeText={setToken}
      />

      <Text style={authStyles.label}>Новий пароль</Text>
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
        onPress={onSubmit}
        disabled={busy}
      >
        <Text style={authStyles.primaryBtnText}>Зберегти пароль</Text>
      </Pressable>

      <Pressable style={authStyles.secondaryBtn} onPress={() => navigation.navigate('AuthMain')}>
        <Text style={authStyles.secondaryBtnText}>До входу</Text>
      </Pressable>
    </ScrollView>
  );
}
