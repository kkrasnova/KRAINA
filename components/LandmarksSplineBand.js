import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeSplineLowerView as SplineLowerNative } from './nativeSplineLowerView';
import { LANDMARKS_SPLINE_NATIVE_IOS } from '../splineOnboardingConfig';
import { buildAndroidSplineViewerHtml } from './splineAndroidWebViewerHtml';

/**
 * iOS: SplineRuntime — scene.splineswift (build URL).
 * Android: WebView + splineswift (нативний splinecontent давав crash у engineCreate).
 */
export default function LandmarksSplineBand({ width, height, style }) {
  const iosUrl = (LANDMARKS_SPLINE_NATIVE_IOS || '').trim();
  const nativeSceneUrl = Platform.OS === 'ios' ? iosUrl : '';

  const androidHtml = useMemo(() => {
    if (Platform.OS !== 'android' || !iosUrl) return '';
    return buildAndroidSplineViewerHtml(iosUrl);
  }, [iosUrl]);

  if (SplineLowerNative && nativeSceneUrl) {
    return (
      <View style={[styles.shell, { width, height }, style]}>
        <SplineLowerNative style={styles.nativeFill} sceneUrl={nativeSceneUrl} />
      </View>
    );
  }

  if (Platform.OS === 'android' && androidHtml) {
    return (
      <View style={[styles.shell, { width, height }, style]}>
        <WebView
          originWhitelist={['*']}
          source={{ html: androidHtml, baseUrl: 'https://build.spline.design/' }}
          style={styles.web}
          backgroundColor="#000000"
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="always"
          setSupportMultipleWindows={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          nestedScrollEnabled
          cacheEnabled
          setBuiltInZoomControls={false}
          displayZoomControls={false}
        />
      </View>
    );
  }

  return <View style={[styles.shell, { width, height }, style]} />;
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  nativeFill: {
    flex: 1,
  },
  web: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
