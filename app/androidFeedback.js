import { Platform } from 'react-native';

const borderless = false;


export const noAndroidRipple = Platform.OS === 'android' ? null : undefined;


export const rippleOnAccent =
  Platform.OS === 'android' ? { color: 'rgba(30, 30, 30, 0.26)', borderless } : undefined;


export const rippleOnDarkSurface =
  Platform.OS === 'android' ? { color: 'rgba(255, 255, 255, 0.16)', borderless } : undefined;


export const rippleOnLightSurface =
  Platform.OS === 'android' ? { color: 'rgba(0, 0, 0, 0.14)', borderless } : undefined;
