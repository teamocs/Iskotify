import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button } from "@iskotify/ui";
import { APP_NAME, APP_TAGLINE } from "@iskotify/utils";

export default function HomeScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-start justify-center gap-4 px-6">
        <Text className="text-3xl font-bold text-ink">{APP_NAME}</Text>
        <Text className="text-base text-ink-muted">{APP_TAGLINE}</Text>

        <View className="w-full flex-row gap-3 pt-4">
          <Button
            label="Primary action"
            onPress={() => console.log("mobile: primary pressed")}
          />
          <Button
            variant="secondary"
            label="Secondary"
            onPress={() => console.log("mobile: secondary pressed")}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
