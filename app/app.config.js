const appJson = require('./app.json');

const PROFILE_TO_CHANNEL = {
  development: 'development',
  preview: 'preview',
  production: 'production',
};

const updateChannel =
  PROFILE_TO_CHANNEL[process.env.EAS_BUILD_PROFILE] ||
  process.env.EXPO_UPDATES_CHANNEL ||
  'development';

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY ||
  appJson.expo?.extra?.googleMapsApiKey ||
  '';

const basePlugins = appJson.expo?.plugins || [];
const hasMapsPlugin = basePlugins.some(
  (p) => (Array.isArray(p) ? p[0] : p) === 'react-native-maps',
);

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  ...appJson.expo,
  plugins: hasMapsPlugin
    ? basePlugins
    : [
        ...basePlugins,
        [
          'react-native-maps',
          {
            androidGoogleMapsApiKey: googleMapsApiKey,
            iosGoogleMapsApiKey: googleMapsApiKey,
          },
        ],
      ],
  extra: {
    ...appJson.expo.extra,
    googleMapsApiKey,
  },
  android: {
    ...appJson.expo.android,
    config: {
      ...(appJson.expo.android?.config || {}),
      googleMaps: {
        apiKey: googleMapsApiKey,
      },
    },
  },
  ios: {
    ...appJson.expo.ios,
    config: {
      ...(appJson.expo.ios?.config || {}),
      googleMapsApiKey,
    },
    infoPlist: {
      UIViewControllerBasedStatusBarAppearance: true,
      NSMicrophoneUsageDescription:
        'Мікрофон потрібен, щоб записувати та надсилати голосові повідомлення в чаті.',
    },
  },
  updates: {
    ...appJson.expo.updates,
    requestHeaders: {
      'expo-channel-name': updateChannel,
    },
  },
};