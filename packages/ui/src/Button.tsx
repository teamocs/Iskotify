import { Pressable, Text, type PressableProps } from "react-native";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps {
  label: string;
  onPress: PressableProps["onPress"];
  variant?: ButtonVariant;
  disabled?: boolean;
  testID?: string;
}

const containerByVariant: Record<ButtonVariant, string> = {
  primary: "bg-brand active:bg-brand-dark",
  secondary: "bg-transparent border border-brand active:bg-brand/10"
};

const labelByVariant: Record<ButtonVariant, string> = {
  primary: "text-white",
  secondary: "text-brand"
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
