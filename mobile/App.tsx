import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import { Ionicons } from "@expo/vector-icons";
type Event = {
  kind: string;
  text?: string;
  name?: string;
  args?: Record<string, string>;
};
type Message = { role: string; text: string };
const C = {
  bg: "#181818",
  panel: "#242424",
  line: "#363636",
  muted: "#999999",
  text: "#f5f5f5",
  accent: "#ffffff",
};
const defaults = {
  url: process.env.EXPO_PUBLIC_API_URL || "",
  model: "gemini-2.5-flash",
  key: "",
};
function Button({
  label,
  onPress,
  secondary = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[s.button, secondary && s.secondary]}
    >
      <Text style={{ color: secondary ? C.text : C.bg, fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}
function AppContent() {
  const [token, setToken] = useState(""),
    [name, setName] = useState(""),
    [ready, setReady] = useState(false),
    [config, setConfig] = useState(defaults),
    [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState<Message[]>([]),
    [events, setEvents] = useState<Event[]>([]),
    [prompt, setPrompt] = useState(""),
    [job, setJob] = useState(""),
    [busy, setBusy] = useState(false),
    [files, setFiles] = useState<any[]>([]),
    [expanded, setExpanded] = useState(false),
    [status, setStatus] = useState("Ready when you are");
  const [menu, setMenu] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const api = async (
    path: string,
    method = "GET",
    body?: any,
    authToken = token,
  ) => {
    if (!/^https:\/\//.test(config.url))
      throw new Error("Set an HTTPS backend address in Settings.");
    const response = await fetch(config.url.replace(/\/$/, "") + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: "Bearer " + authToken } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string" ? data.detail : "Request failed",
      );
    return data;
  };
  const report = (err: any) =>
    Alert.alert("AetherVM", err.message || String(err));
  useEffect(() => {
    (async () => {
      try {
        const raw = await SecureStore.getItemAsync("settings");
        if (raw) setConfig({ ...defaults, ...JSON.parse(raw) });
        setToken((await SecureStore.getItemAsync("session")) || "");
        setName((await SecureStore.getItemAsync("name")) || "");
        setJob((await SecureStore.getItemAsync("activeJob")) || "");
      } finally {
        setReady(true);
      }
    })();
    GoogleSignin.configure({
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
    });
  }, []);
  useEffect(() => {
    if (token && ready) api("/messages").then(setMessages).catch(report);
  }, [token, ready]);
  useEffect(() => {
    if (!job || !token) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await api("/tasks/" + job);
        if (!alive) return;
        setEvents(data.events);
        setStatus(
          data.events.filter((e: Event) => e.kind === "status").at(-1)?.text ||
            "Working…",
        );
        if (data.status !== "running") {
          setJob("");
          await SecureStore.deleteItemAsync("activeJob");
          setStatus(data.status === "done" ? "Task complete" : data.status);
          await api("/messages").then(setMessages);
          if (data.error) Alert.alert("Task stopped", data.error);
        } else timer = setTimeout(poll, 1200);
      } catch (err) {
        if (alive) {
          report(err);
          timer = setTimeout(poll, 5000);
        }
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [job, token]);
  const login = async () => {
    setBusy(true);
    try {
      if (!process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)
        throw new Error(
          "Configure the Google OAuth client ID and rebuild the Android app first.",
        );
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();
      if (!isSuccessResponse(result)) return;
      if (!result.data.idToken) throw new Error("Google returned no ID token");
      const data = await api("/auth/google", "POST", {
        id_token: result.data.idToken,
      });
      await SecureStore.setItemAsync("session", data.token);
      await SecureStore.setItemAsync("name", data.name);
      setName(data.name);
      setToken(data.token);
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };
  const send = async () => {
    if (!prompt.trim() || job) return;
    setBusy(true);
    try {
      if (!config.key)
        throw new Error("Add your Gemini API key in Settings first.");
      const text = prompt.trim();
      const result = await api("/tasks", "POST", {
        prompt: text,
        api_key: config.key,
        model: config.model,
      });
      setMessages([...messages, { role: "user", text }]);
      setPrompt("");
      setEvents([]);
      setJob(result.id);
      await SecureStore.setItemAsync("activeJob", result.id);
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    try {
      if (!/^https:\/\//.test(config.url))
        throw new Error("Use an HTTPS API address.");
      await SecureStore.setItemAsync("settings", JSON.stringify(config));
      Alert.alert("Saved", "Your key is stored securely on this device.");
      setTab("chat");
    } catch (err) {
      report(err);
    }
  };
  const loadFiles = async () => {
    setBusy(true);
    try {
      const data = await api("/workspace/files");
      if (data.exit_code !== 0) throw new Error(data.output);
      setFiles(JSON.parse(data.output));
      setTab("files");
    } catch (err) {
      report(err);
    } finally {
      setBusy(false);
    }
  };
  if (!ready)
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  return (
    <SafeAreaView style={s.root}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={s.header}>
          <Pressable
            accessibilityLabel="Open navigation"
            hitSlop={12}
            onPress={() => setMenu(true)}
            style={s.icon}
          >
            <Ionicons name="menu-outline" size={25} color={C.text} />
          </Pressable>
          <View style={s.heading}>
            <Text style={s.brand}>aetherVM</Text>
            {token && tab === "chat" && (
              <Text numberOfLines={1} style={s.model}>
                {config.model}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityLabel={tab === "chat" ? "Settings" : "Back to chat"}
            hitSlop={12}
            onPress={() => setTab(tab === "chat" ? "settings" : "chat")}
            style={s.icon}
          >
            <Ionicons
              name={tab === "chat" ? "options-outline" : "close-outline"}
              size={24}
              color={C.text}
            />
          </Pressable>
        </View>
        <Modal
          visible={menu}
          transparent
          animationType="fade"
          onRequestClose={() => setMenu(false)}
        >
          <View style={s.overlay}>
            <Pressable
              accessibilityLabel="Close navigation"
              style={StyleSheet.absoluteFill}
              onPress={() => setMenu(false)}
            />
            <SafeAreaView style={s.drawer}>
              <View style={s.drawerHeader}>
                <Text style={s.brand}>aetherVM</Text>
                <Pressable
                  accessibilityLabel="Close navigation"
                  onPress={() => setMenu(false)}
                >
                  <Ionicons name="close" size={23} color={C.muted} />
                </Pressable>
              </View>
              {["chat", "activity", "files", "settings"].map((t, i) => (
                <Pressable
                  key={t}
                  style={[s.navRow, tab === t && s.navSelected]}
                  onPress={() => {
                    setMenu(false);
                    t === "files" && token ? loadFiles() : setTab(t);
                  }}
                >
                  <Ionicons
                    name={
                      [
                        "chatbubble-outline",
                        "terminal-outline",
                        "folder-outline",
                        "settings-outline",
                      ][i] as any
                    }
                    size={21}
                    color={C.text}
                  />
                  <Text style={s.navLabel}>
                    {
                      ["Chat", "Task activity", "Workspace files", "Settings"][
                        i
                      ]
                    }
                  </Text>
                </Pressable>
              ))}
              <View style={{ flex: 1 }} />
              <View style={s.accountRow}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {(name || "A").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text numberOfLines={1} style={s.navLabel}>
                  {name || "Your workspace"}
                </Text>
              </View>
            </SafeAreaView>
          </View>
        </Modal>
        {tab === "settings" ? (
          <ScrollView contentContainerStyle={s.content}>
            <Text style={s.pageTitle}>Settings</Text>
            <Text style={s.sub}>Model and connection</Text>
            {[
              ["url", "Backend address", "https://api.example.com"],
              ["key", "Gemini API key", "Enter your API key"],
              ["model", "Model ID", "gemini-2.5-flash"],
            ].map(([field, label, placeholder]) => (
              <View key={field} style={s.field}>
                <Text style={s.label}>{label}</Text>
                <TextInput
                  accessibilityLabel={label}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={field === "key"}
                  value={(config as any)[field]}
                  placeholder={placeholder}
                  placeholderTextColor={C.muted}
                  onChangeText={(value) =>
                    setConfig({ ...config, [field]: value })
                  }
                  style={s.input}
                />
              </View>
            ))}
            <Text style={s.help}>
              Your key is stored securely on this device and sent to your
              backend when you run a task.
            </Text>
            <Button label="Save changes" onPress={save} />
            {token && (
              <>
                <View style={s.divider} />
                <Text style={s.label}>{name}</Text>
                <Text style={s.sub}>Google account</Text>
                <Button
                  secondary
                  label="Stop workspace"
                  onPress={() =>
                    api("/workspace/stop", "POST")
                      .then(() => setStatus("Workspace stopped"))
                      .catch(report)
                  }
                />
                <Button
                  secondary
                  label="Sign out"
                  onPress={async () => {
                    try {
                      await api("/auth/logout", "POST");
                      await GoogleSignin.signOut();
                      await SecureStore.deleteItemAsync("session");
                      await SecureStore.deleteItemAsync("name");
                      setToken("");
                      setMessages([]);
                      setTab("chat");
                    } catch (err) {
                      report(err);
                    }
                  }}
                />
              </>
            )}
          </ScrollView>
        ) : !token ? (
          <View style={s.welcome}>
            <View style={{ flex: 1 }} />
            <Ionicons name="terminal-outline" size={38} color={C.text} />
            <Text style={s.welcomeTitle}>Your AI. Its own computer.</Text>
            <Text style={s.welcomeCopy}>
              Ask, build, and automate in your private Linux workspace.
            </Text>
            <View style={{ flex: 1 }} />
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={login}
              style={s.googleButton}
            >
              {busy ? (
                <ActivityIndicator color={C.bg} />
              ) : (
                <>
                  <Text style={s.googleG}>G</Text>
                  <Text style={s.googleText}>Continue with Google</Text>
                </>
              )}
            </Pressable>
            <Pressable
              onPress={() => setTab("settings")}
              style={s.connectionLink}
            >
              <Text style={s.sub}>Set up connection</Text>
              <Ionicons name="chevron-forward" size={14} color={C.muted} />
            </Pressable>
          </View>
        ) : (
          <>
            <ScrollView
              ref={scroll}
              style={{ flex: 1 }}
              contentContainerStyle={[
                s.content,
                tab === "chat" && messages.length === 0 && !job && s.emptyChat,
              ]}
              onContentSizeChange={() =>
                tab === "chat" &&
                messages.length > 0 &&
                scroll.current?.scrollToEnd({ animated: true })
              }
              keyboardShouldPersistTaps="handled"
            >
              {tab === "chat" && (
                <>
                  {messages.length === 0 && !job ? (
                    <View style={s.emptyInner}>
                      <Text style={s.emptyTitle}>What can I help you do?</Text>
                      <Text style={s.emptySubtitle}>
                        A computer for whatever comes next.
                      </Text>
                      <View style={s.chips}>
                        {[
                          [
                            "code-slash-outline",
                            "Build an app",
                            "Create a Python expense tracker and test it.",
                          ],
                          [
                            "globe-outline",
                            "Browse the web",
                            "Browse python.org and summarize the latest release.",
                          ],
                          [
                            "folder-outline",
                            "Organize files",
                            "Create a CSV sample dataset and analyze it with Python.",
                          ],
                        ].map(([icon, title, text]) => (
                          <Pressable
                            key={title}
                            style={s.chip}
                            onPress={() => setPrompt(text)}
                          >
                            <Ionicons
                              name={icon as any}
                              size={17}
                              color={C.muted}
                            />
                            <Text style={s.chipText}>{title}</Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ) : (
                    messages.map((m, i) => (
                      <View
                        key={i}
                        style={[s.message, m.role === "user" && s.userMessage]}
                      >
                        {m.role !== "user" && (
                          <Text style={s.author}>aetherVM</Text>
                        )}
                        <Text selectable style={s.messageText}>
                          {m.text}
                        </Text>
                      </View>
                    ))
                  )}
                  {job && (
                    <View style={s.message}>
                      <Text style={s.author}>aetherVM</Text>
                      {events
                        .filter((e) => e.kind === "text")
                        .map((e, i) => (
                          <Text key={i} selectable style={s.messageText}>
                            {e.text}
                          </Text>
                        ))}
                      <Pressable
                        style={s.workingRow}
                        onPress={() => setTab("activity")}
                      >
                        <ActivityIndicator size="small" color={C.muted} />
                        <Text numberOfLines={1} style={[s.sub, { flex: 1 }]}>
                          {status}
                        </Text>
                        <Ionicons
                          name="chevron-forward"
                          size={15}
                          color={C.muted}
                        />
                      </Pressable>
                    </View>
                  )}
                  {!job && messages.length > 0 && (
                    <Pressable
                      style={s.newChat}
                      onPress={() =>
                        Alert.alert(
                          "New conversation",
                          "Clear chat history? Your workspace files will stay.",
                          [
                            { text: "Cancel" },
                            {
                              text: "Clear",
                              onPress: () =>
                                api("/messages", "DELETE")
                                  .then(() => {
                                    setMessages([]);
                                    setEvents([]);
                                  })
                                  .catch(report),
                            },
                          ],
                        )
                      }
                    >
                      <Ionicons
                        name="create-outline"
                        size={16}
                        color={C.muted}
                      />
                      <Text style={s.sub}>New conversation</Text>
                    </Pressable>
                  )}
                </>
              )}
              {tab === "activity" && (
                <>
                  <Text style={s.pageTitle}>Task activity</Text>
                  <Text style={s.sub}>
                    Commands and results from the latest task.
                  </Text>
                  <Pressable
                    style={s.outputToggle}
                    onPress={() => setExpanded(!expanded)}
                  >
                    <Text style={s.sub}>
                      {expanded ? "Hide" : "Show"} command output
                    </Text>
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={C.muted}
                    />
                  </Pressable>
                  {events.length === 0 && (
                    <View style={s.blank}>
                      <Ionicons
                        name="terminal-outline"
                        size={28}
                        color={C.muted}
                      />
                      <Text style={s.sub}>
                        Run a task to see its activity here.
                      </Text>
                    </View>
                  )}
                  {events.map((e, i) => (
                    <View key={i} style={s.event}>
                      <View style={s.eventHeading}>
                        <Ionicons
                          name={
                            e.kind === "tool"
                              ? "terminal-outline"
                              : "ellipse-outline"
                          }
                          size={15}
                          color={C.muted}
                        />
                        <Text style={s.label}>
                          {e.kind === "tool" ? e.name : e.kind}
                        </Text>
                      </View>
                      {e.kind === "tool" ? (
                        <Text selectable style={s.code}>
                          {JSON.stringify(e.args, null, 2)}
                        </Text>
                      ) : e.kind !== "result" || expanded ? (
                        <Text
                          selectable
                          style={e.kind === "result" ? s.code : s.messageText}
                        >
                          {e.text}
                        </Text>
                      ) : (
                        <Text style={s.sub}>Output captured</Text>
                      )}
                    </View>
                  ))}
                </>
              )}
              {tab === "files" && (
                <>
                  <Text style={s.pageTitle}>Workspace</Text>
                  <Text style={s.sub}>/workspace</Text>
                  <View style={s.divider} />
                  {files.length === 0 && (
                    <View style={s.blank}>
                      <Ionicons
                        name="folder-outline"
                        size={28}
                        color={C.muted}
                      />
                      <Text style={s.sub}>
                        Files you create will appear here.
                      </Text>
                    </View>
                  )}
                  {files.map((f, i) => (
                    <Pressable
                      key={i}
                      style={s.fileRow}
                      onPress={() => {
                        setPrompt(
                          "Read and explain " +
                            JSON.stringify("/workspace/" + f.name),
                        );
                        setTab("chat");
                      }}
                    >
                      <Ionicons
                        name={
                          f.directory
                            ? "folder-outline"
                            : "document-text-outline"
                        }
                        color={C.muted}
                        size={22}
                      />
                      <Text numberOfLines={1} style={[s.navLabel, { flex: 1 }]}>
                        {f.name}
                      </Text>
                      <Ionicons
                        name="chevron-forward"
                        size={15}
                        color={C.muted}
                      />
                    </Pressable>
                  ))}
                  <Button secondary label="Refresh files" onPress={loadFiles} />
                </>
              )}
            </ScrollView>
            {tab === "chat" && (
              <View style={s.composerWrap}>
                <View style={s.composer}>
                  <TextInput
                    accessibilityLabel="Message Aether"
                    multiline
                    value={prompt}
                    onChangeText={setPrompt}
                    placeholder="Message aetherVM"
                    placeholderTextColor={C.muted}
                    style={s.composeInput}
                  />
                  <View style={s.composerTools}>
                    <Pressable
                      accessibilityLabel="Workspace files"
                      onPress={loadFiles}
                      style={s.icon}
                    >
                      <Ionicons
                        name="folder-outline"
                        color={C.muted}
                        size={21}
                      />
                    </Pressable>
                    <Text style={s.composerHint}>
                      {job ? "Working in Linux" : "Linux workspace"}
                    </Text>
                    <Pressable
                      accessibilityLabel={job ? "Stop task" : "Send message"}
                      disabled={busy || (!job && !prompt.trim())}
                      onPress={() =>
                        job
                          ? api("/tasks/" + job + "/cancel", "POST").catch(
                              report,
                            )
                          : send()
                      }
                      style={[
                        s.send,
                        {
                          opacity: busy || (!job && !prompt.trim()) ? 0.35 : 1,
                        },
                      ]}
                    >
                      {busy ? (
                        <ActivityIndicator color={C.bg} />
                      ) : (
                        <Ionicons
                          name={job ? "stop" : "arrow-up"}
                          color={C.bg}
                          size={21}
                        />
                      )}
                    </Pressable>
                  </View>
                </View>
                <Text style={s.footer}>
                  Review important results. Aether can make mistakes.
                </Text>
              </View>
            )}
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, backgroundColor: C.bg, justifyContent: "center" },
  header: {
    height: 64,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heading: { flex: 1, alignItems: "center" },
  brand: {
    fontSize: 20,
    color: C.text,
    fontWeight: "600",
    letterSpacing: -0.5,
  },
  model: { fontSize: 11, color: C.muted, marginTop: 3 },
  icon: { padding: 7 },
  content: { padding: 24, paddingBottom: 32 },
  pageTitle: {
    fontSize: 27,
    fontWeight: "600",
    letterSpacing: -0.7,
    color: C.text,
    marginBottom: 8,
  },
  sub: { fontSize: 14, color: C.muted, lineHeight: 21 },
  label: { color: C.text, fontSize: 14, fontWeight: "500", marginBottom: 9 },
  field: { marginTop: 28 },
  input: {
    backgroundColor: C.panel,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    padding: 16,
    color: C.text,
    fontSize: 15,
  },
  help: { fontSize: 13, lineHeight: 20, color: C.muted, marginVertical: 22 },
  button: {
    backgroundColor: C.accent,
    padding: 16,
    alignItems: "center",
    borderRadius: 26,
    marginTop: 12,
  },
  secondary: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 27 },
  welcome: {
    flex: 1,
    paddingHorizontal: 30,
    paddingBottom: 22,
    alignItems: "center",
  },
  welcomeTitle: {
    fontSize: 39,
    lineHeight: 46,
    fontWeight: "600",
    letterSpacing: -1.3,
    color: C.text,
    textAlign: "center",
    marginTop: 28,
  },
  welcomeCopy: {
    fontSize: 16,
    lineHeight: 24,
    color: C.muted,
    textAlign: "center",
    marginTop: 19,
  },
  googleButton: {
    width: "100%",
    height: 54,
    borderRadius: 28,
    backgroundColor: "#fafafa",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  googleG: { fontSize: 21, fontWeight: "700", color: "#242424" },
  googleText: { fontSize: 16, fontWeight: "600", color: "#181818" },
  connectionLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    padding: 20,
  },
  emptyChat: { flexGrow: 1, justifyContent: "center", paddingBottom: 60 },
  emptyInner: { alignItems: "center" },
  emptyTitle: {
    fontSize: 27,
    lineHeight: 35,
    color: C.text,
    fontWeight: "500",
    letterSpacing: -0.8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: C.muted,
    marginTop: 12,
    textAlign: "center",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 9,
    marginTop: 29,
  },
  chip: {
    flexDirection: "row",
    gap: 7,
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 24,
  },
  chipText: { fontSize: 13, color: "#c6c6c6" },
  message: { marginBottom: 32 },
  userMessage: {
    backgroundColor: "#303030",
    borderRadius: 23,
    paddingHorizontal: 18,
    paddingVertical: 13,
    marginLeft: 35,
    alignSelf: "flex-end",
    maxWidth: "90%",
  },
  messageText: { color: C.text, fontSize: 16, lineHeight: 26 },
  author: { fontSize: 13, fontWeight: "600", color: C.text, marginBottom: 12 },
  workingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 20,
    paddingVertical: 12,
  },
  newChat: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    padding: 12,
  },
  composerWrap: { paddingHorizontal: 14, paddingBottom: 8, paddingTop: 10 },
  composer: {
    backgroundColor: C.panel,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "#3c3c3c",
    padding: 8,
  },
  composeInput: {
    color: C.text,
    fontSize: 16,
    minHeight: 53,
    maxHeight: 160,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 10,
  },
  composerTools: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 5,
    paddingBottom: 4,
    gap: 5,
  },
  composerHint: { fontSize: 12, color: C.muted, flex: 1 },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    fontSize: 10,
    color: "#777777",
    textAlign: "center",
    marginTop: 10,
    lineHeight: 16,
  },
  event: { borderBottomWidth: 1, borderColor: C.line, paddingVertical: 20 },
  eventHeading: { flexDirection: "row", gap: 8, alignItems: "baseline" },
  code: {
    fontFamily: "monospace",
    fontSize: 12,
    lineHeight: 19,
    color: "#bfbfbf",
    marginTop: 8,
  },
  outputToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 22,
  },
  blank: { alignItems: "center", paddingVertical: 70, gap: 16 },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 19,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  overlay: { flex: 1, backgroundColor: "#00000080" },
  drawer: {
    width: "82%",
    height: "100%",
    backgroundColor: "#111111",
    paddingHorizontal: 16,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 23,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginBottom: 4,
  },
  navSelected: { backgroundColor: "#282828" },
  navLabel: { fontSize: 15, color: C.text },
  accountRow: {
    borderTopWidth: 1,
    borderColor: C.line,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#343434",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: C.text, fontSize: 14, fontWeight: "600" },
});
