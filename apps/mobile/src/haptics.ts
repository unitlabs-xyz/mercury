import * as ExpoHaptics from "expo-haptics";
import { currentPrefs } from "./prefs";

/**
 * `expo-haptics`, honouring the Haptic feedback setting. Every tap, selection
 * and success in the app goes through here, so turning it off in Settings
 * turns it off everywhere rather than in the places someone remembered.
 */
const on = () => currentPrefs().haptics;

export const Haptics = {
  ImpactFeedbackStyle: ExpoHaptics.ImpactFeedbackStyle,
  NotificationFeedbackType: ExpoHaptics.NotificationFeedbackType,
  impactAsync: (style?: ExpoHaptics.ImpactFeedbackStyle) =>
    on() ? ExpoHaptics.impactAsync(style) : Promise.resolve(),
  selectionAsync: () => (on() ? ExpoHaptics.selectionAsync() : Promise.resolve()),
  notificationAsync: (type?: ExpoHaptics.NotificationFeedbackType) =>
    on() ? ExpoHaptics.notificationAsync(type) : Promise.resolve(),
};
