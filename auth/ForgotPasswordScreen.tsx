import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { postForgotPassword } from './endpoints';
import { formatAuthError } from './formatError';
import type { AuthStackParamList } from './navigation.types';
import { authColors, authStyles } from './theme';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const onSubmit = async () => {
    const em = email.trim();
    if (!em) {
      Alert.alert('Відновлення', 'Введіть email.');
      return;
    }
    setSending(true);
    try {
      const res = await postForgotPassword({ email: em });
      if (res.message === 'email_sent') {
        Alert.alert('Готово', 'Якщо акаунт існує, на пошту надіслано інструкції.', [
          { text: 'OK', onPress: () => navigation.navigate('AuthMain') },
        ]);
      }
    } catch (e) {
      Alert.alert('Помилка', formatAuthError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView style={authStyles.flex} contentContainerStyle={authStyles.scrollContent}>
      <Text style={authStyles.title}>Забули пароль</Text>
      <Text style={authStyles.subtitle}>Вкажіть email — надішлемо посилання для скидання.</Text>

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

      <Pressable
        style={[authStyles.primaryBtn, sending && { opacity: 0.6 }]}
        onPress={onSubmit}
        disabled={sending}
      >
        <Text style={authStyles.primaryBtnText}>Надіслати</Text>
      </Pressable>

      <Pressable style={authStyles.secondaryBtn} onPress={() => navigation.navigate('AuthMain')}>
        <Text style={authStyles.secondaryBtnText}>Назад до входу</Text>
      </Pressable>
    </ScrollView>
  );
}
