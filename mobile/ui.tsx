import React,{memo} from 'react';
import {View,Text,TextInput,Pressable,ActivityIndicator,Modal,KeyboardAvoidingView,Platform,ScrollView,StyleSheet,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import Svg,{Path} from 'react-native-svg';
import {C,s} from './design';
import {MotionContext} from './components/MotionContext';
const paths: Record<string, string> = {
  menu: "M4 7h16M4 12h16M4 17h10",
  plus: "M12 5v14M5 12h14",
  close: "m6 6 12 12M6 18 18 6",
  back: "m14 5-7 7 7 7",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  up: "m6 15 6-6 6 6",
  send: "M12 19V5m-6 6 6-6 6 6",
  computer: "M3 4h18v13H3zM8 21h8M12 17v4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  file: "M5 3h9l5 5v13H5zM14 3v6h5",
  folder: "M3 6h7l2 2h9v12H3z",
  terminal: "m5 7 5 5-5 5M12 17h7",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  check: "m5 12 4 4L19 6",
  copy: "M9 8h12v13H9zM15 8V3H3v12h6",
  download: "M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5",
  search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14m5 12 6 6",
  edit: "m14 4 6 6M4 16 16 4l4 4L8 20H4z",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  logout: "M9 4H4v16h5M9 12h12m-5-5 5 5-5 5",
  key: "M8 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10m4 8 9 9m-5-5 3-3m-6 0 3-3",
  shield: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z",
  refresh: "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-2M19 16a8 8 0 0 1-14 2",
  pause: "M8 5v14M16 5v14",
  stop: "M6 6h12v12H6z",
  expand: "M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6",
  spark: "m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3zM12 6v16",
  alert: "M12 3 2 21h20zM12 9v5M12 17v1",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
  attach: "m8 14 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l9-9",
  help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3M12 17v1",
};
export const Icon = memo(
  ({
    name,
    size = 20,
    color = C.muted,
  }: {
    name: string;
    size?: number;
    color?: string;
  }) => (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d={paths[name] || paths.spark}
        fill="none"
        stroke={color}
        strokeWidth={1.65}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  ),
);
export function Brand({ size = 27 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Path
        d="M16 2 30 16 16 30 2 16Z"
        stroke={C.text}
        fill="none"
        strokeWidth="1.8"
      />
      <Path d="m16 9 7 7-7 7-7-7Z" fill={C.text} />
    </Svg>
  );
}
export function IconButton({
  name,
  label,
  onPress,
  active = false,
  disabled = false,
}: {
  name: string;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.iconButton,
        active && { backgroundColor: C.accentBg },
        (pressed || disabled) && { opacity: disabled ? 0.35 : 0.7 },
      ]}
    >
      <Icon name={name} color={active ? C.accent : C.muted} />
    </Pressable>
  );
}
export function Button({
  label,
  onPress,
  secondary = false,
  loading = false,
  disabled = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={loading || disabled}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (pressed || disabled) && { opacity: 0.5 },
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={secondary ? C.text : C.bg} />
      ) : label === "Continue with Google" ? (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path
            d="M22.6 12.3c0-.7-.1-1.5-.2-2.2H12v4.2h6a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.6 3.3-8Z"
            fill="#4285F4"
          />
          <Path
            d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7a6.6 6.6 0 0 1-3.8 1.1 6.8 6.8 0 0 1-6.4-4.7H2v2.8A11 11 0 0 0 12 23Z"
            fill="#34A853"
          />
          <Path
            d="M5.6 14a6.6 6.6 0 0 1 0-4V7.2H2A11 11 0 0 0 2 17Z"
            fill="#FBBC05"
          />
          <Path
            d="M12 5.3c1.7 0 3.2.6 4.4 1.7l3.2-3.2A11 11 0 0 0 2 7.2L5.6 10A6.8 6.8 0 0 1 12 5.3Z"
            fill="#EA4335"
          />
        </Svg>
      ) : (
        icon && <Icon name={icon} size={18} color={secondary ? C.text : C.bg} />
      )}
      <Text style={[s.buttonText, secondary && { color: C.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  secret?: boolean;
}) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={C.subtle}
        secureTextEntry={secret}
        multiline={multiline}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          s.input,
          multiline && { minHeight: 108, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Row({
  icon,
  title,
  subtitle,
  onPress,
  right,
  disabled = false,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || disabled}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => [
        s.row,
        pressed && { backgroundColor: C.surface },
      ]}
    >
      <View style={s.rowIcon}>
        <Icon name={icon} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle && <Text style={s.caption}>{subtitle}</Text>}
      </View>
      {right || (onPress && <Icon name="chevron" size={17} />)}
    </Pressable>
  );
}
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionLabel}>{title}</Text>
      {children}
    </View>
  );
}
export function Sheet({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
  fullScreen = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
  fullScreen?: boolean;
}) {
  const { width } = useWindowDimensions();
  const full = fullScreen && width < 700;
  const motion = React.useContext(MotionContext);
  return (
    <Modal
      transparent
      animationType={motion ? "slide" : "none"}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[s.scrim, full && { paddingHorizontal: 0, paddingVertical: 0 }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityLabel="Close dialog"
        />
        <SafeAreaView
          style={[
            s.sheet,
            wide && { maxWidth: 800 },
            full && {
              maxWidth: 700,
              maxHeight: "100%",
              height: "100%",
              borderRadius: 0,
              borderWidth: 0,
              backgroundColor: C.bg,
            },
          ]}
        >
          <View style={s.sheetHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.sheetTitle}>{title}</Text>
              {subtitle && <Text style={s.caption}>{subtitle}</Text>}
            </View>
            <IconButton name="close" label="Close" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.sheetContent}
          >
            {children}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
