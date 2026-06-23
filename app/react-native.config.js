/** expo-av@16 is not compatible with Expo SDK 56 / expo-modules-core@56 (missing LazyKType). */
module.exports = {
  dependencies: {
    'expo-av': {
      platforms: {
        android: null,
        ios: null,
      },
    },
    'react-native-performance': {
      platforms: {
        android: null,
        ios: null,
      },
    },
    'react-native-health-connect': {
      platforms: {
        android: {
          libraryName: null,
          cmakeListsPath: null,
        },
      },
    },
    'react-native-nitro-modules': {
      platforms: {
        android: {
          libraryName: null,
          cmakeListsPath: null,
        },
      },
    },
    // iOS CallKit only — Android build breaks under New Architecture (RNCallKeep).
    'react-native-callkeep': {
      platforms: {
        android: null,
      },
    },
  },
};
