import { Platform } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AuthMainScreen from './AuthMainScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import PostAuthHomeScreen from './PostAuthHomeScreen';
import ResetPasswordScreen from './ResetPasswordScreen';
import SplashAuthScreen from './SplashAuthScreen';
import type { AuthStackParamList } from './navigation.types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  return (
    <Stack.Navigator
      initialRouteName="SplashAuth"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000', flex: 1 },
        ...(Platform.OS === 'android'
          ? {
              statusBarTranslucent: true,
              navigationBarColor: '#000000',
            }
          : {}),
      }}
    >
      <Stack.Screen name="SplashAuth" component={SplashAuthScreen} />
      <Stack.Screen name="AuthMain" component={AuthMainScreen} />
      <Stack.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#E1FF00',
          title: 'Відновлення',
        }}
      />
      <Stack.Screen
        name="ResetPassword"
        component={ResetPasswordScreen}
        options={{
          headerShown: true,
          headerStyle: { backgroundColor: '#000000' },
          headerTintColor: '#E1FF00',
          title: 'Новий пароль',
        }}
      />
      <Stack.Screen name="PostAuthHome" component={PostAuthHomeScreen} />
    </Stack.Navigator>
  );
}
