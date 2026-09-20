import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

/** Placeholder. The web app in apps/web is the reference to build against. */
export default function Home() {
  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <Text style={styles.word}>Harbor</Text>
      <Text style={styles.note}>iOS app starts once the web build is carrying itself.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  word: { fontSize: 24, fontWeight: "600", letterSpacing: -0.3, color: "#1B1A17" },
  note: { marginTop: 8, fontSize: 15, lineHeight: 22, textAlign: "center", color: "#6B665C" },
});
