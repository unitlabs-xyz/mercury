import { useEffect, useState } from "react";
import { Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { space } from "../theme";

/**
 * The space under a screen's last action, the same on every screen.
 *
 * Clears the home indicator by a fixed margin, so a pinned button sits at one
 * height everywhere rather than at whatever each screen happened to pick. While
 * the keyboard is up the indicator is hidden behind it and a
 * `KeyboardAvoidingView` has already lifted the content, so the inset would be
 * paid twice — the gap drops to the plain margin instead.
 */
export const useBottomGap = (): number => {
  const insets = useSafeAreaInsets();
  const [keyboard, setKeyboard] = useState(false);

  useEffect(() => {
    const shown = Keyboard.addListener("keyboardWillShow", () => setKeyboard(true));
    const hidden = Keyboard.addListener("keyboardWillHide", () => setKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return keyboard ? space.md : Math.max(insets.bottom, space.md) + space.md;
};
