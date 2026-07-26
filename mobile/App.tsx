import { useNetInfo } from '@react-native-community/netinfo';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Resolved at build time: EXPO_PUBLIC_APP_URL (from .env / EAS env) wins,
// falling back to extra.appUrl in app.json.
const APP_URL: string =
  process.env.EXPO_PUBLIC_APP_URL ?? Constants.expoConfig?.extra?.appUrl ?? '';

const APP_ORIGIN = (() => {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return '';
  }
})();

// External auth/video hosts that must stay inside the WebView for the
// web app to function (Clerk auth frames, Mux playback, Loom embeds).
const IN_APP_HOSTS = ['clerk.', 'mux.com', 'litix.io', 'loom.com', 'youtube.com', 'youtube-nocookie.com', 'vimeo.com'];

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const canGoBackRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const netInfo = useNetInfo();

  // Android hardware back navigates the WebView history before exiting the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (canGoBackRef.current) {
        webViewRef.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, []);

  const handleFirstLoad = useCallback(() => {
    if (!firstLoadDone) {
      setFirstLoadDone(true);
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [firstLoadDone]);

  const retry = useCallback(() => {
    setLoadError(null);
    webViewRef.current?.reload();
  }, []);

  if (!APP_URL || APP_URL.includes('YOUR-PRODUCTION-DOMAIN')) {
    return (
      <Screen>
        <Text style={styles.errorTitle}>App URL not configured</Text>
        <Text style={styles.errorBody}>
          Set EXPO_PUBLIC_APP_URL in mobile/.env (or extra.appUrl in app.json) to the deployed CMB
          Lab domain, then restart the dev server.
        </Text>
      </Screen>
    );
  }

  const offline = netInfo.isConnected === false;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <WebView
          ref={webViewRef}
          source={{ uri: APP_URL }}
          style={styles.webview}
          // Keep the Clerk session cookie across app restarts.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          // Interactive video + audio exercises need inline playback and mic access.
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          mediaCapturePermissionGrantType="grant"
          allowsBackForwardNavigationGestures
          pullToRefreshEnabled
          setSupportMultipleWindows={false}
          onNavigationStateChange={(nav) => {
            canGoBackRef.current = nav.canGoBack;
          }}
          onShouldStartLoadWithRequest={(request) => {
            // mailto:, tel:, app deep links → hand off to the OS.
            if (!request.url.startsWith('http')) {
              Linking.openURL(request.url).catch(() => {});
              return false;
            }
            // Subframe loads (Clerk auth frames, Mux/Loom embeds) pass through.
            if (request.isTopFrame === false) {
              return true;
            }
            // Same-origin and required embed hosts stay in the WebView;
            // anything else (Discord, checkout pages) opens in the browser.
            const stayInApp =
              request.url.startsWith(APP_ORIGIN) ||
              IN_APP_HOSTS.some((host) => request.url.includes(host));
            if (!stayInApp) {
              Linking.openURL(request.url).catch(() => {});
              return false;
            }
            return true;
          }}
          onLoadEnd={handleFirstLoad}
          onError={(e) => setLoadError(e.nativeEvent.description ?? 'Failed to load')}
          onHttpError={(e) => {
            if (e.nativeEvent.statusCode >= 500) {
              setLoadError(`Server error (${e.nativeEvent.statusCode})`);
            }
          }}
          startInLoadingState
          renderLoading={() => (
            <View style={[StyleSheet.absoluteFill, styles.center, styles.dark]}>
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          )}
        />
        {(loadError || offline) && (
          <View style={[StyleSheet.absoluteFill, styles.center, styles.dark]}>
            <Text style={styles.errorTitle}>{offline ? 'No connection' : 'Something went wrong'}</Text>
            <Text style={styles.errorBody}>
              {offline
                ? 'CMB Lab needs an internet connection. Reconnect and try again.'
                : loadError}
            </Text>
            <Pressable style={styles.retryButton} onPress={retry} disabled={offline}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={[styles.safeArea, styles.center]}>
        <StatusBar style="light" />
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  webview: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  dark: {
    backgroundColor: '#0a0a0a',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    color: '#a1a1aa',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    color: '#0a0a0a',
    fontSize: 14,
    fontWeight: '600',
  },
});
