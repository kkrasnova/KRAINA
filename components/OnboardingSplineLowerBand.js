import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { NativeSplineLowerView as SplineLowerNative } from './nativeSplineLowerView';
import {
  FINAL_ONBOARD_SPLINE_LOWER_URL,
  FINAL_ONBOARD_SPLINE_NATIVE_IOS,
} from '../splineOnboardingConfig';
import { buildAndroidSplineViewerHtml } from './splineAndroidWebViewerHtml';

/** Нативний Spline лише на iOS. Android — WebView + splineswift (нативний SDK падав у engineCreate). */

/**
 * iOS: SplineRuntime — scene.splineswift (build URL).
 * Android: WebView + @splinetool/viewer (splineswift), не нативний splinecontent.
 * Фолбек: FINAL_ONBOARD_SPLINE_LOWER_URL (публічний Web-URL).
 */
export default function OnboardingSplineLowerBand({ width, height, style }) {
  const webUri = (FINAL_ONBOARD_SPLINE_LOWER_URL || '').trim();
  const iosSceneUrl = (FINAL_ONBOARD_SPLINE_NATIVE_IOS || '').trim();
  const nativeSceneUrl = Platform.OS === 'ios' ? iosSceneUrl : '';

  const androidHtml = useMemo(() => {
    if (Platform.OS !== 'android' || !iosSceneUrl) return '';
    return buildAndroidSplineViewerHtml(iosSceneUrl);
  }, [iosSceneUrl]);

  if (SplineLowerNative && nativeSceneUrl) {
    return (
      <View style={[styles.shell, { width, height }, style]}>
        <SplineLowerNative style={styles.nativeSplineFill} sceneUrl={nativeSceneUrl} />
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

  if (!webUri) {
    return <View style={[styles.shell, { width, height }, style]} />;
  }

  return (
    <View style={[styles.shell, { width, height }, style]}>
      <WebView
        source={{ uri: webUri }}
        style={styles.web}
        backgroundColor="#000000"
        originWhitelist={['https://*', 'http://*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        {...Platform.select({
          ios: { allowsAirPlayForMediaPlayback: true },
          android: { nestedScrollEnabled: true },
        })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  nativeSplineFill: {
    flex: 1,
  },
  web: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
