import React, { useCallback, useEffect, useRef, useState, memo } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  useWindowDimensions,
  AppState,
  Switch,
  Linking,
  BackHandler,
  AccessibilityInfo,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import Svg, { Path, Rect, Circle, Line } from "react-native-svg";
import Markdown from "react-native-markdown-display";
import AgentFace, {
  MotionContext,
  faceColors,
  FaceMood,
} from "./components/AgentFace";
import Onboarding from "./components/Onboarding";
import SlideSurface from "./components/SlideSurface";

type Job = {
  control?: string;
  id: string;
  status: string;
  error?: string;
  created: number;
  events?: TaskEvent[];
};
type Agent = {
  id: string;
  name: string;
  role: string;
  instructions: string;
  avatar: number;
  memory: string;
  preview?: string;
  job?: Job | null;
};
type Message = { id: number; role: string; text: string; created?: number };
type TaskEvent = {
  kind: string;
  text?: string;
  name?: string;
  args?: Record<string, any>;
};
type WorkspaceFile = { name: string; directory: boolean; size: number };
type Skill = { id: string; name: string; instructions: string };
type Config = { url: string; key: string; model: string; animations: boolean };
type Api = (
  path: string,
  method?: string,
  body?: any,
  overrideToken?: string,
) => Promise<any>;
type Screen = "chat" | "computer" | "settings";
const C = {
  bg: "#111315",
  rail: "#151719",
  surface: "#1B1E21",
  raised: "#222629",
  line: "#2A2E32",
  text: "#ECEFF1",
  muted: "#949CA4",
  subtle: "#69737D",
  accent: "#B7C6FA",
  accentBg: "#252D40",
  green: "#8FC8A5",
  amber: "#E5BD80",
  red: "#E7A29E",
};
const DEFAULT_URL = "https://aethervm-api.onrender.com";
const defaults: Config = {
  url: process.env.EXPO_PUBLIC_API_URL?.includes("YOUR_")
    ? DEFAULT_URL
    : process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL,
  key: "",
  model: "gemini-2.5-flash",
  animations: true,
};
const emptyProfile = {
  name: "",
  role: "",
  instructions: "",
  avatar: 0,
  memory: "",
};
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
const Icon = memo(
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
function Brand({ size = 27 }: { size?: number }) {
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
const avatarColors = faceColors;
const Avatar = AgentFace;
function moodFor(status?: string): FaceMood {
  return status === "running"
    ? "working"
    : status === "waiting"
      ? "waiting"
      : status === "error" || status === "interrupted"
        ? "error"
        : status === "done"
          ? "success"
          : "idle";
}
function IconButton({
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
function Button({
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
function Field({
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
function Row({
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
function Section({
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
function Sheet({
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
function timeLabel(t?: number) {
  return t
    ? new Date(t * 1000).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}
function fileSize(n: number) {
  return n > 1024 * 1024
    ? (n / 1024 / 1024).toFixed(1) + " MB"
    : n > 1024
      ? Math.ceil(n / 1024) + " KB"
      : n + " B";
}
function stateLabel(a?: Agent) {
  return a?.job?.status === "running"
    ? "Working"
    : a?.job?.status === "error"
      ? "Needs attention"
      : a?.job?.status === "done"
        ? "Finished"
        : "Ready";
}
function eventLabel(e?: TaskEvent) {
  if (!e) return "Getting ready";
  if (e.kind === "status")
    return e.text?.includes("Waking")
      ? "Starting the computer"
      : e.text || "Working";
  if (e.kind === "tool") {
    const a = e.args || {};
    if (e.name === "run_shell")
      return /test|pytest/.test(a.command || "")
        ? "Running checks"
        : "Using the terminal";
    if (e.name === "read_file")
      return "Reading " + (a.path || "a file").split("/").pop();
    if (e.name === "write_file")
      return "Writing " + (a.path || "a file").split("/").pop();
    if (e.name === "browse" || e.name === "browser_open")
      return "Browsing the web";
    if (e.name === "remember") return "Saving a memory";
    if (e.name === "request_user_control") return "Waiting for you";
    return "Using the computer";
  }
  return "Working";
}
function CopyAction({ text, code = false }: { text: string; code?: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        copied ? "Copied" : code ? "Copy code" : "Copy response"
      }
      style={{
        minHeight: 44,
        minWidth: 44,
        flexDirection: "row",
        gap: 6,
        alignItems: "center",
        justifyContent: "center",
      }}
      onPress={async () => {
        await Clipboard.setStringAsync(text);
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
      }}
    >
      <Icon
        name={copied ? "check" : "copy"}
        size={15}
        color={copied ? C.green : C.muted}
      />
      {code && <Text style={s.tiny}>{copied ? "Copied" : "Copy code"}</Text>}
    </Pressable>
  );
}
function CodeBlock({ text, language }: { text: string; language?: string }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: C.line,
        borderRadius: 10,
        backgroundColor: C.surface,
        marginBottom: 14,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderColor: C.line,
        }}
      >
        <Text style={[s.tiny, { flex: 1 }]}>{language || "Code"}</Text>
        <CopyAction text={text} code />
      </View>
      <ScrollView horizontal>
        <Text selectable style={[s.codeText, { padding: 14 }]}>
          {text.trimEnd()}
        </Text>
      </ScrollView>
    </View>
  );
}
const MessageView = memo(
  ({
    message,
    agent,
    onFile,
  }: {
    message: Message;
    agent: Agent;
    onFile: (p: string) => void;
  }) => {
    const user = message.role === "user";
    const fileLinks = [
      ...message.text.matchAll(
        /\[[^\]]+\]\((?:sandbox:)?(\/workspace\/[^)]+)\)/g,
      ),
    ];
    return (
      <View style={[s.message, user && s.userMessage]}>
        {user ? (
          <>
            <Text selectable style={s.messageText}>
              {message.text}
            </Text>
            {!!message.created && (
              <Text style={s.messageTime}>{timeLabel(message.created)}</Text>
            )}
          </>
        ) : (
          <>
            <View style={s.authorRow}>
              <Avatar variant={agent.avatar} size={25} />
              <Text style={s.authorName}>{agent.name}</Text>
              <Text style={s.messageTime}>{timeLabel(message.created)}</Text>
            </View>
            <Markdown
              rules={{
                fence: (node: any) => (
                  <CodeBlock
                    key={node.key}
                    text={node.content}
                    language={node.sourceInfo}
                  />
                ),
                code_block: (node: any) => (
                  <CodeBlock key={node.key} text={node.content} />
                ),
              }}
              style={markdownStyles}
              onLinkPress={(url) => {
                if (
                  url.startsWith("/workspace/") ||
                  url.startsWith("sandbox:/workspace/")
                ) {
                  onFile(
                    url.replace("sandbox:", "").replace("/workspace/", ""),
                  );
                  return false;
                }
                if (/^https?:/.test(url)) Linking.openURL(url);
                return false;
              }}
            >
              {message.text}
            </Markdown>
            {fileLinks.map((m, i) => (
              <Row
                key={i}
                icon="file"
                title={m[1].split("/").pop() || "File"}
                subtitle="View artifact"
                onPress={() => onFile(m[1].replace("/workspace/", ""))}
              />
            ))}
            <View style={s.messageActions}>
              <CopyAction text={message.text} />
            </View>
          </>
        )}
      </View>
    );
  },
);
const markdownStyles = StyleSheet.create({
  body: { color: C.text, fontSize: 16, lineHeight: 25 },
  heading1: { fontSize: 23, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  heading2: { fontSize: 20, fontWeight: "600", marginTop: 14, marginBottom: 8 },
  heading3: { fontSize: 17, fontWeight: "600", marginTop: 12 },
  paragraph: { marginTop: 0, marginBottom: 12 },
  code_inline: {
    backgroundColor: C.surface,
    color: C.accent,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
  },
  fence: {
    backgroundColor: C.surface,
    borderColor: C.line,
    borderWidth: 1,
    borderRadius: 10,
    color: C.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 21,
    padding: 14,
  },
  link: { color: C.accent },
  blockquote: { backgroundColor: C.surface, borderColor: C.subtle },
  hr: { backgroundColor: C.line },
  table: { borderColor: C.line },
  tr: { borderColor: C.line },
  th: { padding: 6 },
  td: { padding: 6 },
  bullet_list: { marginBottom: 12 },
});

type InitialWorkspace = {
  config?: Config;
  ready?: boolean;
  token?: string;
  name?: string;
  email?: string;
  agents?: Agent[];
  selected?: string;
  messages?: Message[];
  job?: Job | null;
  screen?: Screen;
  onboarding?: boolean;
};
function WorkspaceApp({ initial }: { initial?: InitialWorkspace } = {}) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const [ready, setReady] = useState(initial?.ready || false),
    [token, setToken] = useState(initial?.token || ""),
    [name, setName] = useState(initial?.name || ""),
    [email, setEmail] = useState(initial?.email || ""),
    [config, setConfig] = useState(initial?.config || defaults);
  const [computerExpanded, setComputerExpanded] = useState(false),
    [screen, setScreen] = useState<Screen>(initial?.screen || "chat"),
    [drawer, setDrawer] = useState(false),
    [onboarding, setOnboarding] = useState(initial?.onboarding || false),
    [reduceMotion, setReduceMotion] = useState(false),
    [profileAdvanced, setProfileAdvanced] = useState(false),
    [agents, setAgents] = useState<Agent[]>(initial?.agents || []),
    [selected, setSelected] = useState(initial?.selected || ""),
    [messages, setMessages] = useState<Message[]>(initial?.messages || []),
    [job, setJob] = useState<Job | null>(initial?.job || null),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(""),
    [error, setError] = useState<{ title: string; details: string } | null>(
      null,
    ),
    [errorDetails, setErrorDetails] = useState(false),
    [offline, setOffline] = useState(false);
  const [profile, setProfile] = useState<Agent | null>(null),
    [editing, setEditing] = useState<Agent | typeof emptyProfile | null>(null),
    [skills, setSkills] = useState<Skill[]>([]),
    [skillDraft, setSkillDraft] = useState<{
      name: string;
      instructions: string;
    } | null>(null),
    [activityJob, setActivityJob] = useState<Job | null>(null),
    [activity, setActivity] = useState(false),
    [activityDetails, setActivityDetails] = useState(false),
    [history, setHistory] = useState<Job[]>([]),
    [historyOpen, setHistoryOpen] = useState(false),
    [providerOpen, setProviderOpen] = useState(false),
    [draftKey, setDraftKey] = useState(""),
    [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [connection, setConnection] = useState(""),
    [advanced, setAdvanced] = useState(false),
    [urlDraft, setUrlDraft] = useState(""),
    [policy, setPolicy] = useState("");
  const [filePreview, setFilePreview] = useState<{
      name: string;
      data: string;
      size: number;
    } | null>(null),
    [attachments, setAttachments] = useState<{ name: string; path: string }[]>(
      [],
    ),
    [computerState, setComputerState] = useState("unknown");
  const list = useRef<FlatList<Message>>(null),
    selectedRef = useRef(selected),
    refreshVersion = useRef(0),
    sending = useRef(false);
  selectedRef.current = selected;
  const agent = agents.find((a) => a.id === selected);
  const api: Api = useCallback(
    async (path, method = "GET", body, overrideToken) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 90000);
      try {
        const response = await fetch(config.url.replace(/\/+$/, "") + path, {
          method,
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            ...((overrideToken ?? token)
              ? { Authorization: "Bearer " + (overrideToken ?? token) }
              : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        let data: any;
        try {
          data = await response.json();
        } catch {
          throw new Error(
            "The server returned an unreadable response. Please retry.",
          );
        }
        if (response.status === 401) {
          await SecureStore.deleteItemAsync("session");
          setToken("");
          throw new Error("Your session expired. Sign in again.");
        }
        if (!response.ok)
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : "Request could not be completed (" + response.status + ").",
          );
        return data;
      } catch (e: any) {
        if (e.name === "AbortError")
          throw new Error(
            "The server took too long to respond. It may be waking up. Please retry.",
          );
        if (
          e.message?.includes("Network request failed") ||
          e.message?.includes("Failed to fetch")
        )
          throw new Error(
            "Could not reach AetherVM. Check your connection, then retry.",
          );
        throw e;
      } finally {
        clearTimeout(timer);
      }
    },
    [token, config.url],
  );
  const report = useCallback(
    (err: any, title = "Something needs attention") => {
      setError({ title, details: err.message || String(err) });
      setErrorDetails(false);
    },
    [],
  );
  const persist = async (next: Config) => {
    await SecureStore.setItemAsync("settings", JSON.stringify(next));
    setConfig(next);
  };
  const refreshAgents = useCallback(async () => {
    const items: Agent[] = await api("/agents");
    setAgents(items);
    return items;
  }, [api]);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => listener.remove();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("settings");
        if (raw) {
          const saved = { ...defaults, ...JSON.parse(raw) };
          saved.url =
            /^https:\/\//.test(saved.url) && !saved.url.includes("YOUR_")
              ? saved.url.trim().replace(/\/+$/, "")
              : DEFAULT_URL;
          setConfig(saved);
        }
        setName((await SecureStore.getItemAsync("name")) || "");
        setEmail((await SecureStore.getItemAsync("email")) || "");
        setSelected((await SecureStore.getItemAsync("agent")) || "");
        setToken((await SecureStore.getItemAsync("session")) || "");
        setOnboarding(
          (await SecureStore.getItemAsync("onboarding-v3")) !== "done",
        );
      } catch (e) {
        report(e, "Could not restore your account");
      } finally {
        setReady(true);
      }
    })();
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
  }, []);
  useEffect(() => {
    if (!token || !ready) return;
    let alive = true;
    refreshAgents()
      .then((items) => {
        if (alive && !items.some((a) => a.id === selectedRef.current))
          setSelected(items[0]?.id || "");
      })
      .catch((e) => report(e, "Could not restore your agents"));
    return () => {
      alive = false;
    };
  }, [token, ready, refreshAgents]);
  const restore = useCallback(async () => {
    if (!selected || !token) return;
    const version = ++refreshVersion.current;
    try {
      const [msgs, tasks] = await Promise.all([
        api("/messages?agent_id=" + selected),
        api("/agents/" + selected + "/tasks"),
      ]);
      if (version !== refreshVersion.current) return;
      setMessages(msgs);
      setHistory(tasks);
      if (tasks[0]) setJob(await api("/tasks/" + tasks[0].id));
      else setJob(null);
      setOffline(false);
    } catch (e) {
      if (version === refreshVersion.current) {
        setOffline(true);
        report(e, "Could not restore this workspace");
      }
    }
  }, [selected, token, api, report]);
  useEffect(() => {
    setMessages([]);
    setJob(null);
    setPrompt("");
    setAttachments([]);
    setScreen("chat");
    restore();
    if (selected) SecureStore.setItemAsync("agent", selected);
    return () => {
      refreshVersion.current++;
    };
  }, [selected, token]);
  useEffect(() => {
    if (!job?.id || job.status !== "running" || !token) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const id = job.id,
      aid = selected;
    const poll = async () => {
      try {
        const data: Job = await api("/tasks/" + id);
        if (!alive || aid !== selectedRef.current) return;
        setJob(data);
        setOffline(false);
        if (data.status === "running") timer = setTimeout(poll, 1600);
        else {
          await restore();
          await refreshAgents();
        }
      } catch {
        if (alive) {
          setOffline(true);
          timer = setTimeout(poll, 5000);
        }
      }
    };
    timer = setTimeout(poll, 1200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job?.id, job?.status, token, selected, api]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && token) {
        restore();
        refreshAgents().catch(() => {});
      }
    });
    return () => sub.remove();
  }, [restore, refreshAgents, token]);
  useEffect(() => {
    if (screen === "computer" && token)
      api("/workspace/status")
        .then((d) => setComputerState(d.state))
        .catch(() => setComputerState("unknown"));
  }, [screen, token, api]);
  const login = async () => {
    setBusy("login");
    try {
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return;
      if (!result.data.idToken)
        throw new Error("Google did not return a sign-in token. Try again.");
      const data = await api(
        "/auth/google",
        "POST",
        { id_token: result.data.idToken },
        "",
      );
      await SecureStore.setItemAsync("session", data.token);
      await SecureStore.setItemAsync("name", data.name);
      await SecureStore.setItemAsync("email", result.data.user.email);
      setName(data.name);
      setEmail(result.data.user.email);
      setToken(data.token);
    } catch (e) {
      report(e, "Could not sign in");
    } finally {
      setBusy("");
    }
  };
  const send = async (text = prompt) => {
    if (!text.trim() || !agent || job?.status === "running" || sending.current)
      return;
    if (!config.key) {
      setProviderOpen(true);
      return;
    }
    sending.current = true;
    setBusy("send");
    const aid = agent.id;
    try {
      const full =
        text.trim() +
        (attachments.length
          ? "\n\nAttached files in your computer:\n" +
            attachments.map((f) => "/workspace/" + f.path).join("\n")
          : "");
      const result = await api("/tasks", "POST", {
        prompt: full,
        api_key: config.key,
        model: config.model,
        agent_id: aid,
      });
      if (aid !== selectedRef.current) return;
      setMessages((m) => [
        ...m,
        {
          id: Date.now(),
          role: "user",
          text: full,
          created: Date.now() / 1000,
        },
      ]);
      setPrompt("");
      setAttachments([]);
      setJob({
        id: result.id,
        status: "running",
        events: [],
        created: Date.now() / 1000,
      });
      setAgents((items) =>
        items.map((a) =>
          a.id === aid
            ? {
                ...a,
                job: {
                  id: result.id,
                  status: "running",
                  created: Date.now() / 1000,
                },
                preview: text,
              }
            : a,
        ),
      );
      list.current?.scrollToEnd({ animated: config.animations });
    } catch (e) {
      report(e, "Could not start the task");
    } finally {
      sending.current = false;
      setBusy("");
    }
  };
  const cancelTask = async () => {
    if (!job) return;
    setBusy("cancel");
    try {
      await api("/tasks/" + job.id + "/cancel", "POST");
      setJob((j) =>
        j
          ? {
              ...j,
              events: [
                ...(j.events || []),
                { kind: "status", text: "Stopping after the current action" },
              ],
            }
          : j,
      );
    } catch (e) {
      report(e, "Could not stop the task");
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (drawer) {
        setDrawer(false);
        return true;
      }
      if (screen !== "chat") {
        setScreen("chat");
        return true;
      }
      return false;
    });
    return () => back.remove();
  }, [drawer, screen]);
  const finishOnboarding = async (key: string, model: string) => {
    await persist({ ...config, key, model });
    await SecureStore.setItemAsync("onboarding-v3", "done");
    setOnboarding(false);
  };
  const saveProfile = async () => {
    if (!editing || !editing.name.trim()) return;
    setBusy("agent");
    try {
      const editId = "id" in editing ? editing.id : "";
      const saved = await api(
        "/agents" + (editId ? "/" + editId : ""),
        editId ? "PUT" : "POST",
        {
          ...editing,
          role: editing.role.trim() || "General assistant",
          instructions:
            editing.instructions.trim() ||
            "Complete useful work, verify results and keep updates concise.",
        },
      );
      await refreshAgents();
      setEditing(null);
      setProfile(null);
      setSelected(saved.id);
    } catch (e) {
      report(e, "Could not save your agent");
    } finally {
      setBusy("");
    }
  };
  const openProfile = async () => {
    if (!agent) return;
    setProfile(agent);
    try {
      setSkills(await api("/agents/" + agent.id + "/skills"));
    } catch (e) {
      report(e, "Could not load skills");
    }
  };
  const saveSkill = async () => {
    if (!skillDraft || !agent) return;
    setBusy("skill");
    try {
      const saved = await api(
        "/agents/" + agent.id + "/skills",
        "POST",
        skillDraft,
      );
      setSkills((items) => [...items, saved]);
      setSkillDraft(null);
    } catch (e) {
      report(e, "Could not save this skill");
    } finally {
      setBusy("");
    }
  };
  const testConnection = async () => {
    setBusy("provider");
    setConnection("");
    try {
      const key = draftKey.trim() || config.key;
      if (!key) throw new Error("Enter your Gemini API key first.");
      const result = await api("/provider/test", "POST", {
        api_key: key,
        model: config.model,
      });
      setModels(result.models);
      await persist({
        ...config,
        key,
        model: result.model_checked || config.model,
      });
      setDraftKey("");
      setConnection("Connected to Google Gemini");
    } catch (e) {
      report(e, "Could not connect to Gemini");
      setConnection("Connection failed");
    } finally {
      setBusy("");
    }
  };
  const previewFile = useCallback(
    async (path: string) => {
      setBusy("file");
      try {
        setFilePreview(
          await api("/workspace/file?path=" + encodeURIComponent(path)),
        );
      } catch (e) {
        report(e, "Could not open this file");
      } finally {
        setBusy("");
      }
    },
    [api, report],
  );
  const downloadFile = async () => {
    if (!filePreview) return;
    setBusy("download");
    try {
      const uri = FileSystem.cacheDirectory + filePreview.name;
      await FileSystem.writeAsStringAsync(uri, filePreview.data, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else throw new Error("File sharing is not available on this device.");
    } catch (e) {
      report(e, "Could not export this file");
    } finally {
      setBusy("");
    }
  };
  const attachFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size || 0) > 4 * 1024 * 1024)
        throw new Error("Choose a file smaller than 4 MB.");
      setBusy("upload");
      const data = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const uploaded = await api("/workspace/upload", "POST", {
        name: asset.name,
        data,
      });
      setAttachments((items) => [...items, uploaded]);
    } catch (e) {
      report(e, "Could not attach this file");
    } finally {
      setBusy("");
    }
  };
  const logout = async () => {
    setBusy("logout");
    try {
      await api("/auth/logout", "POST");
      await GoogleSignin.signOut();
      await SecureStore.deleteItemAsync("session");
      setToken("");
      setAgents([]);
      setMessages([]);
      setSelected("");
      setScreen("chat");
    } catch (e) {
      report(e, "Could not sign out");
    } finally {
      setBusy("");
    }
  };
  const inspectedJob = activityJob || job;
  const currentAction =
    job?.control === "user"
      ? "Waiting for you to hand control back"
      : eventLabel(
          job?.events
            ?.filter((e) => e.kind === "status" || e.kind === "tool")
            .at(-1),
        );
  const liveText =
    job?.status === "running"
      ? job.events
          ?.filter((e) => e.kind === "text")
          .map((e) => e.text)
          .join("\n")
      : "";
  const attention = job?.events?.find((e) => e.kind === "attention");
  const artifactPaths = [
    ...new Set(
      (job?.events || [])
        .filter((e) => e.kind === "tool" && e.name === "write_file")
        .map((e) => e.args?.path as string)
        .filter(Boolean),
    ),
  ];
  const roster = (
    <SafeAreaView
      style={[
        s.roster,
        desktop && {
          width: 272,
          flexGrow: 0,
          flexShrink: 0,
          flexBasis: 272,
          borderRightWidth: 1,
          borderColor: C.line,
        },
      ]}
    >
      <View style={s.rosterHead}>
        <Brand size={25} />
        <Text style={s.brandName}>aetherVM</Text>
        {!desktop && (
          <IconButton
            name="close"
            label="Close navigation"
            onPress={() => setDrawer(false)}
          />
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        style={s.newAgent}
        onPress={() => {
          setDrawer(false);
          setProfileAdvanced(false);
          setEditing({ ...emptyProfile });
        }}
      >
        <Icon name="plus" size={18} color={C.text} />
        <Text style={s.rowTitle}>New agent</Text>
      </Pressable>
      <Text
        style={[
          s.sectionLabel,
          { paddingHorizontal: 22, marginTop: 25, marginBottom: 12 },
        ]}
      >
        YOUR AGENTS
      </Text>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 24 }}
      >
        {agents.map((a) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={"Open " + a.name}
            key={a.id}
            onPress={() => {
              setSelected(a.id);
              setDrawer(false);
              setScreen("chat");
            }}
            style={({ pressed }) => [
              s.agentRow,
              selected === a.id && s.selectedAgent,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Avatar
              variant={a.avatar}
              size={42}
              mood={moodFor(a.job?.status)}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={s.inline}>
                <Text numberOfLines={1} style={[s.agentName, { flex: 1 }]}>
                  {a.name}
                </Text>
                {a.job?.status === "running" && (
                  <Text style={[s.tiny, { color: C.green }]}>Working</Text>
                )}
                {a.job?.status === "waiting" && (
                  <Text style={[s.tiny, { color: C.amber }]}>Needs you</Text>
                )}
                {a.job?.status === "error" && (
                  <Icon name="alert" size={14} color={C.amber} />
                )}
              </View>
              <Text numberOfLines={1} style={s.caption}>
                {a.role}
              </Text>
              {!!a.preview && a.preview !== a.role && (
                <Text numberOfLines={1} style={[s.tiny, { marginTop: 5 }]}>
                  {a.preview}
                </Text>
              )}
            </View>
          </Pressable>
        ))}
      </ScrollView>
      <View style={s.rosterFoot}>
        <Row
          icon="settings"
          title="Settings"
          onPress={() => {
            setDrawer(false);
            setScreen("settings");
          }}
        />
        <View style={[s.inline, { padding: 14, paddingTop: 9 }]}>
          <View style={s.accountAvatar}>
            <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }}>
              {name.slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={s.smallText}>
              {name}
            </Text>
            <Text numberOfLines={1} style={s.tiny}>
              {email || "Google account"}
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
  const chat = (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          s.transcript,
          !messages.length && { flexGrow: 1 },
        ]}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) =>
          agent ? (
            <MessageView message={item} agent={agent} onFile={previewFile} />
          ) : null
        }
        ListHeaderComponent={
          messages.length ? (
            <Text style={s.dateDivider}>
              Your conversation with {agent?.name}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyChat}>
            {agent ? (
              <>
                <Avatar variant={agent.avatar} size={72} />
                <Text style={s.emptyTitle}>Meet {agent.name}.</Text>
                <Text style={s.emptyRole}>{agent.role}</Text>
                <Text style={s.emptyDescription}>
                  Give {agent.name} a job. Research, build, or work with
                  files—then come back for the results.
                </Text>
                <View style={s.suggestions}>
                  {[
                    {
                      icon: "search",
                      title: "Research something",
                      text: "Research ",
                    },
                    {
                      icon: "terminal",
                      title: "Build or fix a project",
                      text: "Help me build ",
                    },
                    {
                      icon: "file",
                      title: "Work with my files",
                      text: "Help me with ",
                    },
                  ].map((x) => (
                    <Pressable
                      key={x.icon}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        s.suggestion,
                        pressed && { backgroundColor: C.surface },
                      ]}
                      onPress={() => setPrompt(x.text)}
                    >
                      <Icon name={x.icon} size={19} />
                      <Text style={s.suggestionText}>{x.title}</Text>
                      <Icon name="arrow" size={16} color={C.subtle} />
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <>
                <ActivityIndicator color={C.accent} />
                <Text style={s.emptyRole}>Restoring your agents…</Text>
              </>
            )}
          </View>
        }
        ListFooterComponent={
          agent ? (
            <View>
              {liveText ? (
                <MessageView
                  message={{ id: -1, role: "assistant", text: liveText }}
                  agent={agent}
                  onFile={previewFile}
                />
              ) : null}
              {job?.status === "running" && (
                <Pressable
                  accessibilityRole="button"
                  style={s.activityStrip}
                  onPress={() => setActivity(true)}
                >
                  <ActivityIndicator size="small" color={C.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.smallText}>{agent.name} is working</Text>
                    <Text style={s.caption}>
                      {offline ? "Reconnecting to your task…" : currentAction}
                    </Text>
                  </View>
                  <Icon name="chevron" size={16} />
                </Pressable>
              )}
              {attention && (
                <View style={s.attention}>
                  <Icon name="help" color={C.amber} />
                  <Text style={[s.smallText, { flex: 1 }]}>
                    {attention.text}
                  </Text>
                  <Button
                    label="Open computer"
                    secondary
                    onPress={() => setScreen("computer")}
                  />
                </View>
              )}
              {job?.status === "done" && (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setActivity(true)}
                    style={s.completion}
                  >
                    <Icon name="check" size={15} color={C.green} />
                    <Text style={[s.tiny, { color: C.muted }]}>
                      Task completed
                    </Text>
                    <Text style={s.tiny}>{timeLabel(job.created)}</Text>
                  </Pressable>
                  {artifactPaths.map((path) => (
                    <Row
                      key={path}
                      icon="file"
                      title={path.split("/").pop() || path}
                      subtitle="Created by your agent · View file"
                      onPress={() =>
                        previewFile(path.replace(/^\/workspace\//, ""))
                      }
                    />
                  ))}
                </>
              )}
              {job &&
                ["error", "interrupted", "cancelled"].includes(job.status) && (
                  <View style={s.taskError}>
                    <Icon name="alert" color={C.amber} />
                    <View style={{ flex: 1 }}>
                      <Text style={s.smallText}>
                        {job.status === "cancelled"
                          ? "Task stopped"
                          : job.status === "interrupted"
                            ? "Task interrupted"
                            : "Task could not finish"}
                      </Text>
                      <Text style={s.caption}>
                        {job.error ||
                          "Send a message when you are ready to continue."}
                      </Text>
                    </View>
                  </View>
                )}
            </View>
          ) : null
        }
      />
      <View style={s.composerRegion}>
        {offline && (
          <Pressable
            accessibilityRole="button"
            style={s.connectionBanner}
            onPress={restore}
          >
            <Icon name="refresh" size={15} color={C.amber} />
            <Text style={[s.tiny, { color: C.amber }]}>
              Connection lost. Your task stays on the server. Retry
            </Text>
          </Pressable>
        )}
        {!config.key && (
          <Pressable
            accessibilityRole="button"
            style={s.setupBanner}
            onPress={() => setProviderOpen(true)}
          >
            <Icon name="key" size={17} color={C.accent} />
            <Text style={[s.smallText, { flex: 1, color: C.accent }]}>
              Connect Gemini to give your agent a job
            </Text>
            <Icon name="chevron" size={15} color={C.accent} />
          </Pressable>
        )}
        <View style={s.composer}>
          {attachments.length > 0 && (
            <View style={s.attachments}>
              {attachments.map((f, i) => (
                <Pressable
                  key={f.path}
                  onPress={() =>
                    setAttachments((items) => items.filter((_, n) => n !== i))
                  }
                  style={s.attachment}
                >
                  <Icon name="file" size={14} />
                  <Text numberOfLines={1} style={s.tiny}>
                    {f.name}
                  </Text>
                  <Icon name="close" size={13} />
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            accessibilityLabel="Message your agent"
            placeholder={"Message " + (agent?.name || "your agent") + "…"}
            placeholderTextColor={C.subtle}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            maxLength={15000}
            style={s.composerInput}
          />
          <View style={s.composerTools}>
            <IconButton
              name="plus"
              label="Attach a file"
              disabled={!!busy || job?.status === "running"}
              onPress={attachFile}
            />
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              onPress={() => setProviderOpen(true)}
              style={s.modelButton}
            >
              <Text style={s.tiny}>
                {config.model
                  .replace("gemini-", "Gemini ")
                  .replaceAll("-", " ")}
              </Text>
              <Icon name="down" size={13} color={C.subtle} />
            </Pressable>
            {job?.status === "running" ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop task"
                onPress={cancelTask}
                disabled={busy === "cancel"}
                style={s.sendButton}
              >
                <Icon name="stop" size={17} color={C.bg} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!prompt.trim() || !!busy || !agent}
                onPress={() => send()}
                style={[
                  s.sendButton,
                  (!prompt.trim() || !!busy) && { backgroundColor: C.raised },
                ]}
              >
                {busy === "send" || busy === "upload" ? (
                  <ActivityIndicator size="small" color={C.accent} />
                ) : (
                  <Icon
                    name="send"
                    size={19}
                    color={prompt.trim() ? C.bg : C.subtle}
                  />
                )}
              </Pressable>
            )}
          </View>
        </View>
        <Text style={s.composerNote}>
          {busy === "upload"
            ? "Uploading to your computer…"
            : job?.status === "running"
              ? "Work continues while this app is closed."
              : "Your agent can use its computer. Review important results."}
        </Text>
      </View>
    </View>
  );
  const settings = (
    <ScrollView contentContainerStyle={s.settingsContent}>
      <Text style={s.pageTitle}>Settings</Text>
      <Section title="ACCOUNT">
        <Row
          icon="shield"
          title={name || "Your account"}
          subtitle={email || "Signed in with Google"}
        />
      </Section>
      <Section title="AI PROVIDER">
        <Row
          icon="spark"
          title="Google Gemini"
          subtitle={
            config.key
              ? "API key saved securely on this device"
              : "Connect your own API key"
          }
          onPress={() => setProviderOpen(true)}
          right={
            <View style={s.inline}>
              <Text style={[s.tiny, { color: config.key ? C.green : C.muted }]}>
                {config.key ? "Configured" : "Set up"}
              </Text>
              <Icon name="chevron" size={16} />
            </View>
          }
        />
        <Row
          icon="settings"
          title="Default model"
          subtitle={config.model}
          onPress={() => setProviderOpen(true)}
        />
      </Section>
      <Section title="APPEARANCE">
        <Row icon="eye" title="Theme" subtitle="Dark" />
        <Row
          icon="spark"
          title="Animations"
          subtitle="Use motion for interface transitions"
          right={
            <Switch
              value={config.animations}
              onValueChange={(v) =>
                persist({ ...config, animations: v }).catch(report)
              }
              trackColor={{ false: C.line, true: C.accentBg }}
              thumbColor={config.animations ? C.accent : C.muted}
            />
          }
        />
      </Section>
      <Section title="WORKSPACE">
        <Row
          icon="computer"
          title="Computer"
          subtitle="Shared by your agents · Files stay between tasks"
          onPress={() => setScreen("computer")}
        />
        <Row
          icon="clock"
          title="Automations"
          subtitle="Scheduled runs are not available on this server"
        />
      </Section>
      <Section title="ADVANCED">
        <Row
          icon="settings"
          title="Server connection"
          subtitle="AetherVM Cloud"
          onPress={() => {
            setUrlDraft(config.url);
            setAdvanced(true);
          }}
        />
        <Row
          icon="logout"
          title="Sign out"
          onPress={logout}
          right={
            busy === "logout" ? (
              <ActivityIndicator color={C.muted} />
            ) : (
              <Icon name="chevron" size={16} />
            )
          }
        />
      </Section>
      <Row
        icon="book"
        title="Getting started"
        subtitle="Replay the guided setup"
        onPress={() => setOnboarding(true)}
      />
      <Text style={s.settingsFooter}>aetherVM · Android preview 0.3</Text>
    </ScrollView>
  );
  if (!ready)
    return (
      <SafeAreaView style={[s.root, s.loading]}>
        <Brand size={35} />
        <ActivityIndicator color={C.muted} style={{ marginTop: 24 }} />
        <Text style={[s.caption, { marginTop: 16 }]}>
          Restoring your workspace…
        </Text>
      </SafeAreaView>
    );
  return (
    <MotionContext.Provider value={config.animations && !reduceMotion}>
      <SafeAreaView style={s.root} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        {!token ? (
          <View style={s.login}>
            <View style={s.loginBrand}>
              <Brand />
              <Text style={s.brandName}>aetherVM</Text>
            </View>
            <View style={s.loginBody}>
              <View style={s.loginAvatars}>
                <Avatar size={52} variant={1} />
                <View style={{ marginTop: -18 }}>
                  <Avatar size={72} variant={0} />
                </View>
                <Avatar size={52} variant={2} />
              </View>
              <Text style={s.loginTitle}>
                Your AI workers{"\n"}have computers.
              </Text>
              <Text style={s.loginDescription}>
                Delegate work. Come back{"\n"}when it’s finished.
              </Text>
              <Button
                label="Continue with Google"
                onPress={login}
                loading={busy === "login"}
              />
              <Text style={s.loginHint}>
                {busy === "login"
                  ? "Connecting to your workspace…"
                  : "Use your own Gemini API key."}
              </Text>
            </View>
            <View style={s.loginLegal}>
              <Pressable onPress={() => setPolicy("Terms")}>
                <Text style={s.tiny}>Terms</Text>
              </Pressable>
              <Text style={s.tiny}>·</Text>
              <Pressable onPress={() => setPolicy("Privacy")}>
                <Text style={s.tiny}>Privacy</Text>
              </Pressable>
            </View>
          </View>
        ) : onboarding ? (
          <Onboarding
            api={api}
            initialKey={config.key}
            initialModel={config.model}
            onComplete={finishOnboarding}
          />
        ) : (
          <KeyboardAvoidingView
            style={s.app}
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            {desktop && roster}
            <View style={s.main}>
              <View style={s.header}>
                {!desktop && (
                  <IconButton
                    name={screen === "chat" ? "menu" : "back"}
                    label={
                      screen === "chat" ? "Open agents" : "Back to conversation"
                    }
                    onPress={() =>
                      screen === "chat" ? setDrawer(true) : setScreen("chat")
                    }
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={openProfile}
                  disabled={!agent || screen === "settings"}
                  style={s.headerIdentity}
                >
                  {screen !== "settings" && agent && (
                    <Avatar
                      variant={agent.avatar}
                      size={32}
                      mood={moodFor(job?.status)}
                    />
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={s.headerTitle}>
                      {screen === "settings"
                        ? "aetherVM"
                        : screen === "computer" &&
                            (!desktop || computerExpanded)
                          ? agent?.name + "’s computer"
                          : agent?.name || "Your workspace"}
                    </Text>
                    {screen !== "settings" && (
                      <Text numberOfLines={1} style={s.headerSubtitle}>
                        {screen === "computer"
                          ? "Computer workspace"
                          : job?.status === "running"
                            ? offline
                              ? "Reconnecting…"
                              : currentAction
                            : job?.status === "waiting"
                              ? "Needs your help"
                              : agent?.role}
                      </Text>
                    )}
                  </View>
                  {screen === "chat" && (
                    <Icon name="down" size={12} color={C.subtle} />
                  )}
                </Pressable>
                <IconButton
                  name={screen === "settings" ? "close" : "computer"}
                  label={
                    screen === "settings"
                      ? "Close settings"
                      : screen === "computer"
                        ? "Open conversation"
                        : "Open computer"
                  }
                  active={screen === "computer" || job?.status === "running"}
                  onPress={() => {
                    setComputerExpanded(false);
                    setScreen(screen === "chat" ? "computer" : "chat");
                  }}
                />
                {screen === "chat" && (
                  <IconButton
                    name="clock"
                    label="Task history"
                    onPress={() => {
                      setHistoryOpen(true);
                      api("/agents/" + selected + "/tasks")
                        .then(setHistory)
                        .catch(report);
                    }}
                  />
                )}
              </View>
              <SlideSurface key={screen} style={{ flex: 1 }} from="right">
                {screen === "settings" ? (
                  settings
                ) : screen === "computer" ? (
                  desktop && !computerExpanded ? (
                    <View style={{ flex: 1, flexDirection: "row" }}>
                      <View style={{ flex: 1, minWidth: 0 }}>{chat}</View>
                      <View
                        style={{
                          width: 420,
                          borderLeftWidth: 1,
                          borderColor: C.line,
                        }}
                      >
                        <View
                          style={[
                            s.inline,
                            { paddingLeft: 20, paddingRight: 6, height: 54 },
                          ]}
                        >
                          <Text style={[s.smallText, { flex: 1 }]}>
                            {agent?.name}’s computer
                          </Text>
                          <IconButton
                            name="expand"
                            label="Expand computer"
                            onPress={() => setComputerExpanded(true)}
                          />
                          <IconButton
                            name="close"
                            label="Close computer preview"
                            onPress={() => setScreen("chat")}
                          />
                        </View>
                        <Computer
                          agent={agent}
                          api={api}
                          initialState={computerState}
                          setComputerState={setComputerState}
                          report={report}
                          onFile={previewFile}
                          animations={config.animations}
                          activity={
                            job?.status === "running"
                              ? currentAction
                              : undefined
                          }
                        />
                      </View>
                    </View>
                  ) : (
                    <Computer
                      agent={agent}
                      api={api}
                      initialState={computerState}
                      setComputerState={setComputerState}
                      report={report}
                      onFile={previewFile}
                      animations={config.animations}
                      activity={
                        job?.status === "running" ? currentAction : undefined
                      }
                    />
                  )
                ) : (
                  chat
                )}
              </SlideSurface>
            </View>
          </KeyboardAvoidingView>
        )}
        {drawer && !desktop && (
          <Modal
            transparent
            animationType="none"
            onRequestClose={() => setDrawer(false)}
          >
            <View style={s.drawerScrim}>
              <Pressable
                accessibilityLabel="Close navigation"
                style={StyleSheet.absoluteFill}
                onPress={() => setDrawer(false)}
              />
              <SlideSurface
                from="left"
                style={[s.drawer, { width: Math.min(width - 48, 338) }]}
              >
                {roster}
              </SlideSurface>
            </View>
          </Modal>
        )}
        {editing && (
          <Sheet
            title={"id" in editing ? "Edit agent" : "Create agent"}
            fullScreen
            onClose={() => setEditing(null)}
          >
            <View
              style={{
                alignItems: "center",
                paddingTop: 22,
                paddingBottom: 32,
              }}
            >
              <Avatar variant={editing.avatar} size={142} />
            </View>
            <TextInput
              accessibilityLabel="Agent name"
              value={editing.name}
              onChangeText={(name) => setEditing({ ...editing, name })}
              placeholder="Name your agent"
              placeholderTextColor={C.subtle}
              autoCapitalize="words"
              maxLength={48}
              style={{
                backgroundColor: C.surface,
                color: C.text,
                fontSize: 22,
                fontWeight: "500",
                textAlign: "center",
                padding: 20,
                borderRadius: 20,
                marginBottom: 25,
              }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 9,
                marginBottom: 26,
              }}
            >
              {avatarColors.map((_, i) => (
                <Pressable
                  key={i}
                  accessibilityRole="button"
                  accessibilityLabel={"Face " + (i + 1)}
                  accessibilityState={{ selected: editing.avatar === i }}
                  onPress={() => setEditing({ ...editing, avatar: i })}
                  style={{
                    padding: 6,
                    borderWidth: 2,
                    borderRadius: 28,
                    borderColor: editing.avatar === i ? C.text : "transparent",
                  }}
                >
                  <Avatar variant={i} size={37} />
                </Pressable>
              ))}
            </View>
            <Text style={[s.sectionLabel, { marginBottom: 10 }]}>
              WHAT SHOULD IT HELP WITH?
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {["General", "Research", "Coding"].map((role) => (
                <Pressable
                  key={role}
                  onPress={() =>
                    setEditing({
                      ...editing,
                      role: role === "General" ? "General assistant" : role,
                      instructions:
                        role === "Coding"
                          ? "Build software, inspect errors, test changes and verify results."
                          : role === "Research"
                            ? "Research using the visible browser, check primary sources, and summarize findings clearly."
                            : "Complete useful work and verify results.",
                    })
                  }
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingVertical: 13,
                    borderRadius: 20,
                    backgroundColor: editing.role.includes(role)
                      ? C.accentBg
                      : C.surface,
                  }}
                >
                  <Text style={s.smallText}>{role}</Text>
                </Pressable>
              ))}
            </View>
            <Row
              icon="edit"
              title="More instructions"
              subtitle="Optional"
              onPress={() => setProfileAdvanced(!profileAdvanced)}
              right={<Icon name={profileAdvanced ? "up" : "down"} size={16} />}
            />
            {profileAdvanced && (
              <View style={{ marginTop: 15 }}>
                <Field
                  label="Role"
                  value={editing.role}
                  onChange={(role) => setEditing({ ...editing, role })}
                  placeholder="General assistant"
                />
                <Field
                  label="Instructions"
                  value={editing.instructions}
                  onChange={(instructions) =>
                    setEditing({ ...editing, instructions })
                  }
                  multiline
                  placeholder="How should your agent work?"
                />
                {"id" in editing && (
                  <Field
                    label="Memory"
                    value={editing.memory}
                    onChange={(memory) => setEditing({ ...editing, memory })}
                    multiline
                  />
                )}
              </View>
            )}
            <View style={{ height: 24 }} />
            <Button
              label={"id" in editing ? "Save changes" : "Create agent"}
              onPress={saveProfile}
              loading={busy === "agent"}
              disabled={!editing.name.trim()}
            />
          </Sheet>
        )}
        {profile && !editing && (
          <Sheet
            title={profile.name}
            subtitle={profile.role}
            onClose={() => setProfile(null)}
          >
            <View style={s.profileIntro}>
              <Avatar variant={profile.avatar} size={58} />
              <Text style={[s.bodyText, { flex: 1 }]}>
                {profile.instructions}
              </Text>
            </View>
            <Button
              label="Edit profile"
              icon="edit"
              secondary
              onPress={() => setEditing(profile)}
            />
            <Section title="MEMORY">
              <Text style={s.bodyText}>
                {profile.memory ||
                  "No saved memories yet. Ask your agent to remember a preference, or add it in the profile."}
              </Text>
            </Section>
            <Section title="SKILLS">
              {skills.map((k) => (
                <Row
                  key={k.id}
                  icon="book"
                  title={k.name}
                  subtitle={k.instructions}
                  onPress={() => {
                    setProfile(null);
                    setPrompt("Use the " + k.name + " skill to ");
                  }}
                />
              ))}
              <Row
                icon="plus"
                title="Save a skill"
                subtitle="A reusable set of instructions"
                onPress={() => setSkillDraft({ name: "", instructions: "" })}
              />
            </Section>
            <Section title="COMPUTER">
              <Row
                icon="computer"
                title={profile.name + "’s computer"}
                subtitle="Your agents share the same computer and files"
                onPress={() => {
                  setProfile(null);
                  setScreen("computer");
                }}
              />
            </Section>
            <Section title="AUTOMATIONS">
              <Text style={s.caption}>
                Scheduled runs are not available on this server.
              </Text>
            </Section>
          </Sheet>
        )}
        {skillDraft && (
          <Sheet
            title="Save a skill"
            subtitle="Your agent can reuse these instructions."
            onClose={() => setSkillDraft(null)}
          >
            <Field
              label="Skill name"
              value={skillDraft.name}
              onChange={(name) => setSkillDraft({ ...skillDraft, name })}
            />
            <Field
              label="Instructions"
              multiline
              value={skillDraft.instructions}
              onChange={(instructions) =>
                setSkillDraft({ ...skillDraft, instructions })
              }
            />
            <Button
              label="Save skill"
              onPress={saveSkill}
              loading={busy === "skill"}
              disabled={
                !skillDraft.name.trim() || !skillDraft.instructions.trim()
              }
            />
          </Sheet>
        )}
        {providerOpen && (
          <Sheet
            title="AI provider"
            subtitle="Power your agents with your own Gemini key."
            onClose={() => {
              setProviderOpen(false);
              setDraftKey("");
            }}
          >
            <View style={[s.inline, { marginBottom: 24 }]}>
              <View style={s.providerIcon}>
                <Icon name="spark" color={C.accent} size={24} />
              </View>
              <View>
                <Text style={s.rowTitle}>Google Gemini</Text>
                <Text style={s.caption}>
                  {config.key
                    ? "Your key is saved securely"
                    : "Bring your own API key"}
                </Text>
              </View>
            </View>
            <Field
              label={config.key ? "Replace API key" : "API key"}
              secret
              value={draftKey}
              onChange={setDraftKey}
              placeholder={
                config.key ? "••••••••••••••••" : "Enter your Gemini API key"
              }
            />
            <Text style={[s.caption, { marginBottom: 24 }]}>
              Stored in encrypted device storage. Sent to your AetherVM server
              only when connecting or running a task.
            </Text>
            <Text style={s.fieldLabel}>Default model</Text>
            {models.length ? (
              models.map((m) => (
                <Pressable
                  key={m.id}
                  accessibilityRole="button"
                  onPress={() =>
                    persist({ ...config, model: m.id }).catch(report)
                  }
                  style={s.modelRow}
                >
                  <Text style={[s.smallText, { flex: 1 }]}>{m.name}</Text>
                  {config.model === m.id && (
                    <Icon name="check" color={C.accent} size={18} />
                  )}
                </Pressable>
              ))
            ) : (
              <Field
                label="Model ID"
                value={config.model}
                onChange={(model) => setConfig((c) => ({ ...c, model }))}
                placeholder="gemini-2.5-flash"
              />
            )}
            <View style={{ height: 22 }} />
            <Button
              label={config.key ? "Test connection" : "Connect Gemini"}
              onPress={testConnection}
              loading={busy === "provider"}
            />
            {connection && (
              <View style={[s.inline, { marginTop: 18 }]}>
                <Icon
                  name={connection.startsWith("Connected") ? "check" : "alert"}
                  size={17}
                  color={connection.startsWith("Connected") ? C.green : C.amber}
                />
                <Text style={s.caption}>{connection}</Text>
              </View>
            )}
            <Button
              label="Done"
              secondary
              onPress={() => {
                persist(config).catch(report);
                setProviderOpen(false);
                setDraftKey("");
              }}
            />
          </Sheet>
        )}
        {advanced && (
          <Sheet
            title="Server connection"
            subtitle="Change this only when using your own server."
            onClose={() => setAdvanced(false)}
          >
            <Field
              label="Backend address"
              value={urlDraft}
              onChange={setUrlDraft}
            />
            <Button
              label="Save connection"
              onPress={async () => {
                if (!/^https:\/\/[^\s]+$/.test(urlDraft.trim())) {
                  report(
                    new Error("Enter a valid HTTPS address."),
                    "Invalid server address",
                  );
                  return;
                }
                try {
                  await persist({
                    ...config,
                    url: urlDraft.trim().replace(/\/+$/, ""),
                  });
                  setAdvanced(false);
                } catch (e) {
                  report(e);
                }
              }}
            />
          </Sheet>
        )}
        {activity && (
          <Sheet
            title="Task activity"
            subtitle={
              inspectedJob?.status === "running"
                ? currentAction
                : inspectedJob?.status === "done"
                  ? "Completed"
                  : "Execution history"
            }
            onClose={() => {
              setActivity(false);
              setActivityJob(null);
            }}
          >
            {inspectedJob?.events
              ?.filter((e) => e.kind !== "text" && e.kind !== "result")
              .map((e, i) => (
                <View key={i} style={s.eventRow}>
                  <Icon
                    name={e.kind === "attention" ? "help" : "check"}
                    size={16}
                    color={e.kind === "attention" ? C.amber : C.subtle}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={s.smallText}>
                      {e.kind === "attention" ? e.text : eventLabel(e)}
                    </Text>
                    {activityDetails && e.args && (
                      <Text selectable style={s.codeText}>
                        {JSON.stringify(e.args, null, 2)}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            <Row
              icon="terminal"
              title="Technical details"
              onPress={() => setActivityDetails(!activityDetails)}
              right={<Icon name={activityDetails ? "up" : "down"} size={16} />}
            />
            {activityDetails &&
              inspectedJob?.events
                ?.filter((e) => e.kind === "result")
                .map((e, i) => (
                  <Text key={i} selectable style={s.codeText}>
                    {e.text}
                  </Text>
                ))}
          </Sheet>
        )}
        {historyOpen && (
          <Sheet
            title="Task history"
            subtitle={agent?.name + "’s recent work"}
            onClose={() => setHistoryOpen(false)}
          >
            {history.length ? (
              history.map((j) => (
                <Row
                  key={j.id}
                  icon={
                    j.status === "done"
                      ? "check"
                      : j.status === "running"
                        ? "clock"
                        : "alert"
                  }
                  title={
                    j.status === "done"
                      ? "Task completed"
                      : j.status === "waiting"
                        ? "Needs your help"
                        : j.status === "running"
                          ? "In progress"
                          : j.status === "cancelled"
                            ? "Task stopped"
                            : "Task interrupted"
                  }
                  subtitle={
                    j.created
                      ? new Date(j.created * 1000).toLocaleString()
                      : "Earlier task"
                  }
                  onPress={async () => {
                    try {
                      setActivityJob(await api("/tasks/" + j.id));
                      setHistoryOpen(false);
                      setActivity(true);
                    } catch (e) {
                      report(e);
                    }
                  }}
                />
              ))
            ) : (
              <Text style={s.bodyText}>Finished work will appear here.</Text>
            )}
          </Sheet>
        )}
        {filePreview && (
          <Sheet
            title={filePreview.name}
            subtitle={fileSize(filePreview.size)}
            onClose={() => setFilePreview(null)}
            wide
          >
            {/\.(png|jpg|jpeg|webp|gif)$/i.test(filePreview.name) ? (
              <Image
                source={{
                  uri:
                    "data:image/" +
                    (filePreview.name.split(".").pop() === "jpg"
                      ? "jpeg"
                      : filePreview.name.split(".").pop()) +
                    ";base64," +
                    filePreview.data,
                }}
                style={{ width: "100%", height: 260 }}
                resizeMode="contain"
              />
            ) : /\.(txt|md|py|js|ts|tsx|jsx|json|html|css|csv|sh|yaml|yml|xml|log)$/i.test(
                filePreview.name,
              ) ? (
              <Text selectable style={s.codeText}>
                {decodeText(filePreview.data).slice(0, 40000)}
              </Text>
            ) : (
              <View style={s.filePreviewEmpty}>
                <Icon name="file" size={38} />
                <Text style={s.bodyText}>
                  Export this file to open it in another app.
                </Text>
              </View>
            )}
            <Button
              label="Export file"
              icon="download"
              onPress={downloadFile}
              loading={busy === "download"}
            />
          </Sheet>
        )}
        {error && (
          <Sheet title={error.title} onClose={() => setError(null)}>
            <Text style={s.bodyText}>{error.details}</Text>
            <View style={{ height: 20 }} />
            <Button label="Dismiss" onPress={() => setError(null)} />
            <Button
              label="Retry workspace connection"
              secondary
              onPress={() => {
                setError(null);
                if (token) {
                  restore();
                  refreshAgents().catch((e) => report(e));
                } else login();
              }}
            />
          </Sheet>
        )}
        {policy && (
          <Sheet title={policy} onClose={() => setPolicy("")}>
            <Text style={s.bodyText}>
              {policy === "Privacy"
                ? "AetherVM verifies your Google identity. Your agents, conversations, task records and profiles are stored on your configured server and its database. Files and browser sessions stay in your Daytona computer. Your Gemini API key is stored securely on this device and used by the server transiently for model requests; it is not saved in the database. Gemini receives the prompts and tool results needed to perform your tasks."
                : "AetherVM is a personal Android preview. Agents can execute commands and modify files inside your computer. Review important results and control actions through your instructions. Model and computer use are subject to the terms and usage limits of Google Gemini and your sandbox provider."}
            </Text>
          </Sheet>
        )}
      </SafeAreaView>
    </MotionContext.Provider>
  );
}
function decodeText(data: string) {
  try {
    const binary = atob(data);
    return decodeURIComponent(
      Array.from(
        binary,
        (c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"),
      ).join(""),
    );
  } catch {
    return "Text preview unavailable. Export to view this file.";
  }
}

function Computer({
  agent,
  api,
  initialState,
  setComputerState,
  report,
  onFile,
  animations,
  activity,
}: {
  agent?: Agent;
  api: Api;
  initialState: string;
  setComputerState: (s: string) => void;
  report: (e: any, title?: string) => void;
  onFile: (path: string) => void;
  animations: boolean;
  activity?: string;
}) {
  const { width, height } = useWindowDimensions();
  const [tab, setTab] = useState("screen"),
    [connected, setConnected] = useState(false),
    [loading, setLoading] = useState(false),
    [owner, setOwner] = useState("agent"),
    [shot, setShot] = useState<{
      image: string;
      width: number;
      height: number;
    } | null>(null),
    [screenError, setScreenError] = useState(""),
    [keyboard, setKeyboard] = useState(""),
    [inputBusy, setInputBusy] = useState(false),
    [files, setFiles] = useState<WorkspaceFile[]>([]),
    [folder, setFolder] = useState(""),
    [fileBusy, setFileBusy] = useState(false),
    [fileError, setFileError] = useState(""),
    [command, setCommand] = useState(""),
    [terminalBusy, setTerminalBusy] = useState(false),
    [outputs, setOutputs] = useState<
      { command: string; output: string; exit_code: number }[]
    >([]),
    [visible, setVisible] = useState(true),
    [frameWidth, setFrameWidth] = useState(1);
  const screenRef = useRef<View>(null),
    terminalScroll = useRef<ScrollView>(null);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) =>
      setVisible(state === "active"),
    );
    return () => sub.remove();
  }, []);
  useEffect(
    () => () => {
      api("/workspace/control", "POST", { owner: "agent" }).catch(() => {});
    },
    [api],
  );
  useEffect(() => {
    if (!connected || tab !== "screen" || !visible) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const image = await api("/workspace/screen");
        if (!alive) return;
        setShot(image);
        setOwner(image.control);
        setScreenError("");
      } catch (e: any) {
        if (alive) {
          setScreenError(e.message);
          // Keep the last frame visible during a transient polling failure.
        }
      }
      if (alive) timer = setTimeout(poll, 1800);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [connected, tab, api, visible]);
  const connect = async () => {
    setLoading(true);
    setScreenError("");
    try {
      const result = await api("/workspace/start", "POST");
      setComputerState(result.state);
      setOwner(result.control);
      setConnected(true);
    } catch (e: any) {
      setScreenError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    connect();
  }, [api]);
  const control = async () => {
    setInputBusy(true);
    try {
      const result = await api("/workspace/control", "POST", {
        owner: owner === "user" ? "agent" : "user",
      });
      setOwner(result.control);
    } catch (e) {
      report(e, "Control could not change yet");
    } finally {
      setInputBusy(false);
    }
  };
  const input = async (action: string, args: any = {}) => {
    if (owner !== "user" || inputBusy) return;
    setInputBusy(true);
    try {
      await api("/workspace/input", "POST", { action, ...args });
      if (action === "type") setKeyboard("");
    } catch (e) {
      report(e, "Could not send computer input");
    } finally {
      setInputBusy(false);
    }
  };
  const loadFiles = async (path = folder) => {
    setFileBusy(true);
    setFileError("");
    try {
      setFiles(await api("/workspace/list?path=" + encodeURIComponent(path)));
      setFolder(path);
    } catch (e: any) {
      setFileError(e.message);
    } finally {
      setFileBusy(false);
    }
  };
  const terminal = async () => {
    if (!command.trim() || terminalBusy) return;
    setTerminalBusy(true);
    const text = command;
    try {
      if (owner !== "user") {
        await api("/workspace/control", "POST", { owner: "user" });
        setOwner("user");
      }
      const result = await api("/workspace/terminal", "POST", {
        command: text,
      });
      setOutputs((items) => [
        ...items.slice(-39),
        { command: text, ...result },
      ]);
      setCommand("");
      terminalScroll.current?.scrollToEnd({ animated: animations });
    } catch (e) {
      report(e, "Could not run this command");
    } finally {
      setTerminalBusy(false);
    }
  };
  const switchTab = (next: string) => {
    if (owner === "user" && !terminalBusy)
      api("/workspace/control", "POST", { owner: "agent" })
        .then(() => setOwner("agent"))
        .catch(() => {});
    setTab(next);
    if (next === "files") loadFiles();
  };
  const viewportHeight = shot
    ? Math.min((frameWidth * shot.height) / shot.width, height * 0.52)
    : 220;
  const fitted = shot
    ? Math.min(frameWidth / shot.width, viewportHeight / shot.height)
    : 1;
  return (
    <View style={s.computer}>
      <View style={s.computerTabs}>
        {[
          { id: "screen", name: "Screen", icon: "computer" },
          { id: "files", name: "Files", icon: "folder" },
          { id: "terminal", name: "Terminal", icon: "terminal" },
        ].map((t) => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
            onPress={() => switchTab(t.id)}
            style={[s.computerTab, tab === t.id && s.computerTabSelected]}
          >
            <Icon
              name={t.icon}
              size={17}
              color={tab === t.id ? C.text : C.muted}
            />
            <Text
              style={[s.smallText, { color: tab === t.id ? C.text : C.muted }]}
            >
              {t.name}
            </Text>
          </Pressable>
        ))}
      </View>
      {tab === "screen" ? (
        <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
          <View style={s.computerStatus}>
            <View
              style={[
                s.statusDot,
                {
                  backgroundColor:
                    connected && !screenError ? C.green : C.subtle,
                },
              ]}
            />
            <Text style={[s.caption, { flex: 1 }]}>
              {connected && !screenError
                ? activity
                  ? "Agent working · live"
                  : "Live computer"
                : loading
                  ? "Starting computer…"
                  : initialState === "started"
                    ? "Computer running"
                    : initialState === "stopped"
                      ? "Computer sleeping"
                      : initialState === "not_created"
                        ? "Computer not started"
                        : "Desktop not connected"}
            </Text>
            {connected && (
              <>
                <IconButton
                  name="pause"
                  label="Put computer to sleep"
                  onPress={async () => {
                    try {
                      await api("/workspace/stop", "POST");
                      setConnected(false);
                      setShot(null);
                      setOwner("agent");
                      setComputerState("stopped");
                    } catch (e) {
                      report(e, "Could not put the computer to sleep");
                    }
                  }}
                />
                <IconButton
                  name="refresh"
                  label="Reconnect screen"
                  onPress={connect}
                />
              </>
            )}
          </View>
          {!shot ? (
            <View style={s.computerEmpty}>
              <View style={s.computerIllustration}>
                <Icon name="computer" size={44} color={C.muted} />
              </View>
              {loading && (
                <ActivityIndicator
                  size="small"
                  color={C.muted}
                  style={{ marginBottom: 18 }}
                />
              )}
              <Text style={s.computerTitle}>
                {loading
                  ? "Connecting to the live screen…"
                  : screenError
                    ? "Could not connect to the desktop"
                    : agent?.name + "’s computer"}
              </Text>
              <Text style={s.computerDescription}>
                {screenError ||
                  "A real Linux workspace for browsing, building, and working with your files."}
              </Text>
              <Button
                label={screenError ? "Reconnect" : "Open desktop"}
                onPress={connect}
                loading={loading}
              />
              <Text style={[s.tiny, { textAlign: "center", marginTop: 15 }]}>
                Viewing leaves your agent in control.
              </Text>
            </View>
          ) : (
            <View style={s.desktopView}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  owner === "user"
                    ? "Computer screen. Tap to click."
                    : "Live desktop preview"
                }
                disabled={owner !== "user" || inputBusy}
                onLayout={(e) => setFrameWidth(e.nativeEvent.layout.width)}
                style={[s.screenFrame, { height: viewportHeight }]}
                onPress={(e) => {
                  if (!shot) return;
                  const x =
                    (e.nativeEvent.locationX -
                      (frameWidth - shot.width * fitted) / 2) /
                    fitted;
                  const y =
                    (e.nativeEvent.locationY -
                      (viewportHeight - shot.height * fitted) / 2) /
                    fitted;
                  if (x >= 0 && y >= 0 && x < shot.width && y < shot.height)
                    input("click", { x: Math.round(x), y: Math.round(y) });
                }}
              >
                <Image
                  source={{ uri: "data:image/png;base64," + shot.image }}
                  resizeMode="contain"
                  style={{ width: "100%", height: "100%" }}
                />
              </Pressable>
              <View style={s.controlOwnership}>
                <Icon
                  name={owner === "user" ? "shield" : "eye"}
                  size={17}
                  color={owner === "user" ? C.accent : C.muted}
                />
                <Text style={[s.smallText, { flex: 1 }]}>
                  {owner === "user"
                    ? "You have control"
                    : agent?.name + " has control"}
                </Text>
                <Text style={s.tiny}>Live</Text>
              </View>
              <Button
                label={owner === "user" ? "Hand back to agent" : "Take control"}
                icon={owner === "user" ? "arrow" : "shield"}
                onPress={control}
                loading={inputBusy}
              />
              {owner === "user" ? (
                <>
                  <Text
                    style={[s.caption, { marginTop: 12, marginBottom: 16 }]}
                  >
                    Tap to click. Use the field below to type. Your agent waits
                    while you have control.
                  </Text>
                  <View style={s.keyboardRow}>
                    <TextInput
                      accessibilityLabel="Type on computer"
                      style={[s.input, { flex: 1, minHeight: 46 }]}
                      value={keyboard}
                      onChangeText={setKeyboard}
                      placeholder="Type on the computer…"
                      placeholderTextColor={C.subtle}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <IconButton
                      name="send"
                      label="Type text"
                      onPress={() => input("type", { text: keyboard })}
                      disabled={!keyboard || inputBusy}
                    />
                  </View>
                  <View style={s.keyRow}>
                    {["Return", "Tab", "Escape"].map((key) => (
                      <Pressable
                        key={key}
                        accessibilityRole="button"
                        style={s.keyboardKey}
                        onPress={() => input("key", { text: key })}
                      >
                        <Text style={s.smallText}>
                          {key === "Return"
                            ? "Enter"
                            : key === "Escape"
                              ? "Esc"
                              : key}
                        </Text>
                      </Pressable>
                    ))}
                    <IconButton
                      name="up"
                      label="Scroll up"
                      onPress={() =>
                        input("scroll", {
                          x: Math.round(shot.width / 2),
                          y: Math.round(shot.height / 2),
                          direction: "up",
                        })
                      }
                    />
                    <IconButton
                      name="down"
                      label="Scroll down"
                      onPress={() =>
                        input("scroll", {
                          x: Math.round(shot.width / 2),
                          y: Math.round(shot.height / 2),
                          direction: "down",
                        })
                      }
                    />
                  </View>
                </>
              ) : (
                <Text style={[s.caption, { marginTop: 14 }]}>
                  Watching only. Take control when a website needs your login or
                  input.
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      ) : tab === "files" ? (
        <View style={{ flex: 1 }}>
          <View style={s.fileToolbar}>
            {folder && (
              <IconButton
                name="back"
                label="Parent folder"
                onPress={() =>
                  loadFiles(folder.split("/").slice(0, -1).join("/"))
                }
              />
            )}
            <Text numberOfLines={1} style={[s.caption, { flex: 1 }]}>
              {folder || "Workspace"}
            </Text>
            <IconButton
              name="refresh"
              label="Refresh files"
              onPress={() => loadFiles()}
            />
          </View>
          {fileBusy ? (
            <View style={s.loading}>
              <ActivityIndicator color={C.accent} />
              <Text style={[s.caption, { marginTop: 12 }]}>
                Opening your files…
              </Text>
            </View>
          ) : fileError ? (
            <View style={s.computerEmpty}>
              <Icon name="folder" size={32} />
              <Text style={s.bodyText}>{fileError}</Text>
              <Button label="Retry" onPress={() => loadFiles()} />
            </View>
          ) : (
            <FlatList
              data={files}
              keyExtractor={(f) => f.name}
              contentContainerStyle={{ paddingHorizontal: 14 }}
              renderItem={({ item }) => (
                <Row
                  icon={item.directory ? "folder" : "file"}
                  title={item.name}
                  subtitle={item.directory ? "Folder" : fileSize(item.size)}
                  onPress={() => {
                    const p = (folder ? folder + "/" : "") + item.name;
                    item.directory ? loadFiles(p) : onFile(p);
                  }}
                />
              )}
              ListEmptyComponent={
                <View style={s.computerEmpty}>
                  <Icon name="folder" size={34} />
                  <Text style={s.computerTitle}>No files here yet</Text>
                  <Text style={s.computerDescription}>
                    Ask your agent to create something, or attach a file in the
                    conversation.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={s.terminalInfo}>
            <Icon name="terminal" size={16} />
            <Text style={[s.tiny, { flex: 1 }]}>
              Real Linux shell · Commands run for up to 60s
            </Text>
            <IconButton
              name="copy"
              label="Copy terminal output"
              onPress={() =>
                Clipboard.setStringAsync(
                  outputs
                    .map((o) => "$ " + o.command + "\n" + o.output)
                    .join("\n"),
                )
              }
            />
          </View>
          <ScrollView
            ref={terminalScroll}
            style={s.terminalOutput}
            contentContainerStyle={{ padding: 20 }}
          >
            {!outputs.length && (
              <Text style={s.terminalHint}>
                /workspace{"\n\n"}Run a command on your agent’s computer.{"\n"}
                Commands are bounded; interactive sessions are not supported.
              </Text>
            )}
            {outputs.map((o, i) => (
              <View key={i} style={{ marginBottom: 20 }}>
                <Text selectable style={[s.codeText, { color: C.accent }]}>
                  $ {o.command}
                </Text>
                <Text selectable style={s.codeText}>
                  {o.output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")}
                </Text>
                <Text style={s.tiny}>Exit code {o.exit_code}</Text>
              </View>
            ))}
            {terminalBusy && (
              <View style={s.inline}>
                <ActivityIndicator color={C.accent} size="small" />
                <Text style={s.caption}>Running your command…</Text>
              </View>
            )}
          </ScrollView>
          <View style={s.terminalComposer}>
            <Text style={s.terminalPrompt}>$</Text>
            <TextInput
              accessibilityLabel="Shell command"
              placeholder="Enter a command…"
              placeholderTextColor={C.subtle}
              autoCapitalize="none"
              autoCorrect={false}
              value={command}
              onChangeText={setCommand}
              style={[s.composerInput, { flex: 1, minHeight: 48 }]}
              onSubmitEditing={terminal}
            />
            <IconButton
              name="send"
              label="Run command"
              disabled={terminalBusy || !command.trim()}
              onPress={terminal}
            />
          </View>
          {owner === "user" && (
            <View style={{ padding: 14 }}>
              <Button
                secondary
                label="Hand control back"
                onPress={control}
                loading={inputBusy}
              />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <WorkspaceApp />
    </SafeAreaProvider>
  );
}
export { WorkspaceApp };

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  app: { flex: 1, flexDirection: "row" },
  main: { flex: 1, minWidth: 0 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  presence: {
    position: "absolute",
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: C.bg,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  button: {
    minHeight: 48,
    backgroundColor: C.text,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 18,
    marginTop: 8,
  },
  secondary: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
  },
  buttonText: { color: C.bg, fontWeight: "600", fontSize: 14 },
  smallText: { color: C.text, fontSize: 14, lineHeight: 21 },
  bodyText: { color: C.text, fontSize: 15, lineHeight: 24 },
  caption: { color: C.muted, fontSize: 12, lineHeight: 19 },
  tiny: { color: C.subtle, fontSize: 11, lineHeight: 17 },
  brandName: {
    color: C.text,
    fontSize: 21,
    fontWeight: "600",
    letterSpacing: -0.7,
    flex: 1,
  },
  header: {
    height: 68,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  headerIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 6,
    minWidth: 0,
  },
  headerTitle: {
    color: C.text,
    fontWeight: "600",
    fontSize: 15,
    letterSpacing: -0.2,
  },
  headerSubtitle: { color: C.muted, fontSize: 11, lineHeight: 18 },
  roster: { flex: 1, backgroundColor: C.rail },
  rosterHead: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    gap: 11,
  },
  newAgent: {
    marginHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    height: 44,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
  },
  agentRow: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 12,
    marginBottom: 5,
  },
  selectedAgent: { backgroundColor: C.raised },
  agentName: { color: C.text, fontSize: 14, fontWeight: "600" },
  rosterFoot: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    paddingHorizontal: 6,
    paddingBottom: 8,
  },
  accountAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.raised,
    alignItems: "center",
    justifyContent: "center",
  },
  drawerScrim: { flex: 1, backgroundColor: "#00000080", flexDirection: "row" },
  drawer: { height: "100%", maxWidth: 338 },
  transcript: {
    width: "100%",
    maxWidth: 780,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingBottom: 26,
  },
  dateDivider: {
    color: C.subtle,
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 25,
  },
  message: { paddingTop: 16, paddingBottom: 10 },
  userMessage: {
    backgroundColor: C.raised,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    alignSelf: "flex-end",
    maxWidth: "88%",
    padding: 15,
    marginTop: 18,
    marginBottom: 14,
  },
  messageText: { color: C.text, fontSize: 16, lineHeight: 24 },
  messageTime: { color: C.subtle, fontSize: 10, lineHeight: 18 },
  authorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 13,
  },
  authorName: { color: C.text, fontSize: 13, fontWeight: "600", flex: 1 },
  messageActions: {
    height: 30,
    marginLeft: -12,
    marginTop: -2,
    justifyContent: "center",
  },
  emptyChat: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 44,
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  emptyTitle: {
    alignSelf: "stretch",
    color: C.text,
    fontSize: 27,
    fontWeight: "500",
    letterSpacing: -0.8,
    textAlign: "center",
    marginTop: 24,
  },
  emptyRole: {
    color: C.muted,
    fontSize: 13,
    lineHeight: 21,
    textAlign: "center",
    marginTop: 6,
  },
  emptyDescription: {
    color: C.muted,
    fontSize: 15,
    lineHeight: 24,
    textAlign: "center",
    marginTop: 19,
    maxWidth: 310,
  },
  suggestions: { width: "100%", maxWidth: 336, marginTop: 30 },
  suggestion: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  suggestionText: { color: "#C5CBD0", fontSize: 14, flex: 1 },
  composerRegion: {
    width: "100%",
    maxWidth: 780,
    alignSelf: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
  },
  composer: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: "#343A41",
    borderRadius: 20,
  },
  composerInput: {
    color: C.text,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 58,
    maxHeight: 150,
    paddingHorizontal: 17,
    paddingTop: 16,
    paddingBottom: 9,
    textAlignVertical: "top",
  },
  composerTools: {
    height: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 4,
    paddingRight: 9,
    paddingBottom: 7,
    gap: 5,
  },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: C.text,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 5,
  },
  modelButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 8,
    maxWidth: 170,
  },
  composerNote: {
    textAlign: "center",
    color: C.subtle,
    fontSize: 10,
    lineHeight: 17,
    paddingTop: 9,
    paddingBottom: 5,
  },
  setupBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    marginBottom: 10,
    borderRadius: 10,
    backgroundColor: C.accentBg,
  },
  connectionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
  },
  activityStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 18,
  },
  completion: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 16,
  },
  taskError: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 15,
    marginVertical: 12,
    backgroundColor: C.surface,
    borderRadius: 12,
  },
  attention: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    padding: 16,
    backgroundColor: C.surface,
    borderRadius: 12,
    marginTop: 12,
  },
  attachments: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    padding: 10,
    paddingBottom: 0,
  },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 8,
    backgroundColor: C.raised,
    padding: 7,
    maxWidth: 220,
  },
  settingsContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    paddingHorizontal: 22,
    paddingBottom: 40,
    paddingTop: 24,
  },
  pageTitle: {
    color: C.text,
    fontSize: 27,
    fontWeight: "500",
    letterSpacing: -0.7,
    marginBottom: 14,
  },
  section: { marginTop: 26 },
  sectionLabel: {
    color: C.subtle,
    fontWeight: "600",
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  row: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  rowIcon: { width: 30, alignItems: "center" },
  rowTitle: { color: C.text, fontSize: 14, fontWeight: "500", lineHeight: 22 },
  settingsFooter: {
    color: C.subtle,
    fontSize: 11,
    marginTop: 30,
    textAlign: "center",
  },
  scrim: {
    flex: 1,
    backgroundColor: "#000000A0",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 28,
  },
  sheet: {
    backgroundColor: C.rail,
    width: "100%",
    maxWidth: 480,
    maxHeight: "95%",
    borderRadius: 24,
    overflow: "hidden",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 22,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: C.text,
    lineHeight: 29,
  },
  sheetContent: { padding: 24 },
  fieldWrap: { marginBottom: 20 },
  fieldLabel: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 9,
  },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    padding: 13,
    minHeight: 48,
    color: C.text,
    backgroundColor: C.bg,
    fontSize: 14,
    lineHeight: 22,
  },
  avatarPicker: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 25,
  },
  avatarOption: {
    padding: 4,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: 16,
  },
  avatarSelected: { borderColor: C.accent, backgroundColor: C.accentBg },
  profileIntro: {
    flexDirection: "row",
    gap: 18,
    alignItems: "flex-start",
    marginBottom: 19,
  },
  providerIcon: {
    width: 46,
    height: 46,
    backgroundColor: C.accentBg,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 12,
  },
  codeText: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    color: "#BEC7CF",
    lineHeight: 20,
    paddingVertical: 7,
  },
  filePreviewEmpty: { alignItems: "center", gap: 20, paddingVertical: 36 },
  login: {
    flex: 1,
    paddingHorizontal: 32,
    maxWidth: 500,
    width: "100%",
    alignSelf: "center",
  },
  loginBrand: {
    minHeight: 80,
    flexDirection: "row",
    gap: 11,
    alignItems: "center",
    paddingTop: 29,
  },
  loginBody: {
    minHeight: 470,
    flex: 1,
    justifyContent: "center",
    paddingBottom: 40,
  },
  loginAvatars: {
    flexDirection: "row",
    gap: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 34,
  },
  loginTitle: {
    color: C.text,
    fontSize: 33,
    lineHeight: 40,
    fontWeight: "500",
    letterSpacing: -1.1,
    textAlign: "center",
  },
  loginDescription: {
    color: C.muted,
    fontSize: 16,
    lineHeight: 25,
    textAlign: "center",
    marginTop: 19,
    marginBottom: 30,
  },
  loginHint: {
    color: C.subtle,
    fontSize: 12,
    textAlign: "center",
    marginTop: 17,
  },
  loginLegal: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 13,
    paddingBottom: 25,
  },
  computer: { flex: 1, backgroundColor: C.bg },
  computerTabs: {
    flexDirection: "row",
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  computerTab: {
    height: 54,
    flex: 1,
    maxWidth: 150,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  computerTabSelected: { borderBottomColor: C.accent },
  computerStatus: {
    height: 53,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 22,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  computerEmpty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 30,
    paddingVertical: 50,
    gap: 10,
    width: "100%",
    maxWidth: 470,
    alignSelf: "center",
  },
  computerIllustration: {
    width: 90,
    height: 90,
    borderRadius: 24,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  computerTitle: {
    fontSize: 21,
    color: C.text,
    fontWeight: "500",
    letterSpacing: -0.5,
    textAlign: "center",
    marginTop: 8,
  },
  computerDescription: {
    fontSize: 14,
    color: C.muted,
    lineHeight: 23,
    textAlign: "center",
    marginBottom: 18,
    maxWidth: 330,
  },
  desktopView: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    width: "100%",
    maxWidth: 1100,
    alignSelf: "center",
  },
  screenFrame: {
    backgroundColor: "#08090A",
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    overflow: "hidden",
    width: "100%",
    minHeight: 130,
  },
  controlOwnership: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 17,
  },
  keyboardRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  keyboardKey: {
    paddingHorizontal: 15,
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: C.surface,
    justifyContent: "center",
  },
  fileToolbar: {
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    gap: 8,
  },
  terminalInfo: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 18,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  terminalOutput: { flex: 1, backgroundColor: "#0D0F11" },
  terminalHint: {
    fontFamily: "monospace",
    fontSize: 12,
    color: C.subtle,
    lineHeight: 22,
  },
  terminalComposer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    borderTopWidth: 1,
    borderColor: C.line,
  },
  terminalPrompt: {
    fontFamily: "monospace",
    color: C.accent,
    fontSize: 15,
    paddingLeft: 8,
  },
});
