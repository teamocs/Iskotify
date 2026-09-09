import { Pressable, Text, type PressableProps } from "react-native";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps {
  label: string;
  onPress: PressableProps["onPress"];
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
}

// Classes resolve against the shared preset in ../tailwind-preset.js. The
// previous values referenced a `brand` scale that no longer exists there.
const containerByVariant: Record<ButtonVariant, string> = {
  primary: "bg-maroon active:bg-maroon-light",
  secondary: "bg-transparent border border-maroon active:bg-maroon-dim"
};

const labelByVariant: Record<ButtonVariant, string> = {
  primary: "text-ink-inverse",
  secondary: "text-maroon"
};

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  testID
}: ButtonProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className={[
        "rounded-2xl px-5 py-3 items-center justify-center",
        containerByVariant[variant],
        disabled ? "opacity-50" : ""
      ].join(" ")}
    >
      <Text className={`text-base font-semibold ${labelByVariant[variant]}`}>
        {label}
      </Text>
    </Pressable>
  );
}
