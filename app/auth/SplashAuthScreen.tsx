import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuthStore } from './authStore';
import type { AuthStackParamList } from './navigation.types';

type Props = NativeStackScreenProps<AuthStackParamList, 'SplashAuth'>;

export default function SplashAuthScreen({ navigation }: Props) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await hydrate();
      if (cancelled) return;
      const state = useAuthStore.getState();
      if (state.user || state.accessToken || state.refreshToken) {
        navigation.replace('PostAuthHome');
      } else {
        navigation.replace('AuthMain');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrate, navigation]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000000', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color="#E1FF00" />
    </View>
  );
}
