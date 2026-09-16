import { useState, useEffect, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

export interface OTAUpdateState {
  isUpdateAvailable: boolean;
  isCheckingForUpdate: boolean;
  isDownloading: boolean;
  lastCheckedTime: string | null;
  checkStatusMessage: string | null;
  checkForUpdate: (manual?: boolean) => Promise<boolean>;
  applyUpdate: () => Promise<void>;
  dismissUpdate: () => void;
}

/**
 * useOTAUpdate
 *
 * Manages Over-The-Air (OTA) runtime updates via expo-updates.
 * - Automatically checks for bundles on app launch and whenever returning to foreground.
 * - Exposes manual check triggering for the unified settings page.
 * - Drives <UpdateModal> for instant, seamless in-app bundle hot-reloading.
 */
export function useOTAUpdate(): OTAUpdateState {
  const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
  const [isCheckingForUpdate, setIsCheckingForUpdate] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [lastCheckedTime, setLastCheckedTime] = useState<string | null>(null);
  const [checkStatusMessage, setCheckStatusMessage] = useState<string | null>(null);

  const checkForUpdate = useCallback(async (manual = false): Promise<boolean> => {
    // expo-updates is a no-op in Expo Go or local dev mode
    if (!Updates.isEnabled || __DEV__) {
      if (manual) {
        setCheckStatusMessage('Development mode — OTA updates active in release APK builds.');
      }
      return false;
    }

    try {
      setIsCheckingForUpdate(true);
      setCheckStatusMessage('Checking EAS cloud for updates...');
      console.log('[OTA] Checking for available updates on channel:', Updates.channel);

      const result = await Updates.checkForUpdateAsync();
      setLastCheckedTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

      if (result.isAvailable) {
        console.log('[OTA] Update bundle available! Manifest ID:', result.manifest?.id);
        setIsUpdateAvailable(true);
        setCheckStatusMessage('Fresh update available!');
        return true;
      } else {
        setCheckStatusMessage('App is on the latest version.');
        return false;
      }
    } catch (error) {
      console.warn('[OTA] Check failed:', error);
      if (manual) {
        setCheckStatusMessage('Could not reach update server.');
      }
      return false;
    } finally {
      setIsCheckingForUpdate(false);
    }
  }, []);

  // Automatic check on mount and foreground transitions
  useEffect(() => {
    void checkForUpdate(false);

    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        void checkForUpdate(false);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [checkForUpdate]);

  const applyUpdate = useCallback(async () => {
    if (!Updates.isEnabled || __DEV__) return;
    try {
      setIsDownloading(true);
      setCheckStatusMessage('Downloading update bundle...');
      await Updates.fetchUpdateAsync();
      // Hot-reload the app with the freshly fetched bundle
      await Updates.reloadAsync();
    } catch (error) {
      console.warn('[OTA] Failed to download or reload update:', error);
      setCheckStatusMessage('Failed to download update.');
      setIsDownloading(false);
    }
  }, []);

  const dismissUpdate = useCallback(() => {
    setIsUpdateAvailable(false);
  }, []);

  return {
    isUpdateAvailable,
    isCheckingForUpdate,
    isDownloading,
    lastCheckedTime,
    checkStatusMessage,
    checkForUpdate,
    applyUpdate,
    dismissUpdate,
  };
}
