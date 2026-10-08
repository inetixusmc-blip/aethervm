import {C,s} from './design';
import {Job,Agent,Message,TaskEvent,WorkspaceFile,Skill,Config,Api,Screen} from './types';
import {Brand,Icon,IconButton,Button,Field,Row,Section,Sheet} from './ui';
import Computer from './screens/ComputerScreen';
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
import AetherCharacter from './components/character/AetherCharacter';
import {MotionContext} from './components/MotionContext';
import {taskState, finishes} from './components/character/appearance';
import AppearancePicker from './components/character/AppearancePicker';
import HomeScreen from './screens/HomeScreen';
import ProfileImage from './components/ProfileImage';
import StartupScreen from './components/StartupScreen';
import Sidebar from './components/Sidebar';
import {agentModels,curateModels,GeminiModel} from './models';
import Onboarding from "./components/Onboarding";
import SlideSurface from "./components/SlideSurface";

const DEFAULT_URL = "https://16.16.124.235";
const defaults: Config = {
  url: process.env.EXPO_PUBLIC_API_URL?.includes("YOUR_")
    ? DEFAULT_URL
    : process.env.EXPO_PUBLIC_API_URL || DEFAULT_URL,
  key: "",
  model: "gemini-3.8-flash",
  animations: true,
};
const emptyProfile = {
  name: "",
  role: "",
  instructions: "",
  avatar: 0,
  shape: "blob",
  material: "pearl",
  memory: "",
};
const Avatar = AetherCharacter;
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
  if (!e || e.kind==='result' || e.kind==='text') return "Thinking…";
  if (e.kind==='attention') return 'Waiting for you';
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
function CopyAction({ text, code = false, label='Copy message' }: { text: string; code?: boolean; label?:string }) {
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
        copied ? "Copied" : code ? "Copy code" : label
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
    onEdit,
  }: {
    message: Message;
    agent: Agent;
    onFile: (p: string) => void;
    onEdit?:()=>void;
  }) => {
    const user = message.role === "user";
    const [actionsOpen,setActionsOpen]=useState(false);
    const fileLinks = [
      ...message.text.matchAll(
        /\[[^\]]+\]\((?:sandbox:)?(\/workspace\/[^)]+)\)/g,
      ),
    ];
    return (
      <View style={[s.messageGroup, user && {alignSelf:'flex-end'}]}>
      <Pressable style={[s.message, user && s.userMessage]} onLongPress={()=>setActionsOpen(true)} onPress={()=>setActionsOpen(v=>!v)} accessibilityRole="button" accessibilityLabel={user?'Your message options':'Response options'} accessibilityHint="Show copy and edit actions">
        {user ? (
          <>
            <Text selectable style={s.messageText}>
              {message.text}
            </Text>
          </>
        ) : (
          <>
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
          </>
        )}
      </Pressable>
        {actionsOpen&&message.id>0&&<View style={s.messageActions}>
          <CopyAction text={message.text} label={user?'Copy your message':'Copy response'}/>
          {onEdit&&<IconButton name="edit" label="Edit last message" onPress={onEdit}/>}
        </View>}
      </View>
    );
  },
);
const markdownStyles = StyleSheet.create({
  body: { color: C.text, fontSize: 16, lineHeight: 23 },
  heading1: { fontSize: 23, fontWeight: "600", marginTop: 16, marginBottom: 8 },
  heading2: { fontSize: 20, fontWeight: "600", marginTop: 14, marginBottom: 8 },
  heading3: { fontSize: 17, fontWeight: "600", marginTop: 12 },
  paragraph: { marginTop: 0, marginBottom: 0 },
  textgroup: { marginBottom: 6 },
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
  photo?: string;
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
    [photo, setPhoto] = useState(initial?.photo || ""),
    [config, setConfig] = useState(initial?.config || defaults);
  const [computerExpanded, setComputerExpanded] = useState(false),
    [accountMenu, setAccountMenu] = useState(false),
    [launchReady, setLaunchReady] = useState(initial?.ready || false),
    [screen, setScreen] = useState<Screen>(initial?.screen || "home"),
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
    [history, setHistory] = useState<Job[]>([]),
    [providerOpen, setProviderOpen] = useState(false),
    [modelPicker, setModelPicker] = useState(false),
    [removedOpen,setRemovedOpen]=useState(false),
    [removed,setRemoved]=useState<Agent[]>([]),
    [removeConfirm,setRemoveConfirm]=useState(false),
    [editMessage,setEditMessage]=useState<Message|null>(null),
    [draftKey, setDraftKey] = useState(""),
    [models, setModels] = useState<GeminiModel[]>(agentModels),
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
    followConversation=useRef(true),
    launchTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    selectedRef = useRef(selected),
    refreshVersion = useRef(0),
    sending = useRef(false);
  selectedRef.current = selected;
  const startupReady = useCallback(() => {
    if (!launchTimer.current) launchTimer.current = setTimeout(() => setLaunchReady(true),800);
  },[]);
  useEffect(()=>{
    const fallback=setTimeout(()=>setLaunchReady(true),5000);
    return()=>{clearTimeout(fallback);if(launchTimer.current)clearTimeout(launchTimer.current)};
  },[]);
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
  const workspaceApi: Api = useCallback((path,method,body,override) => api(
    path + (path.includes('?') ? '&' : '?') + 'agent_id=' + encodeURIComponent(selected), method, body, override
  ),[api,selected]);
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
    if (!token || !ready) return;
    let alive=true, timer: ReturnType<typeof setTimeout>;
    const poll=async()=>{if(AppState.currentState==='active')try{await refreshAgents()}catch{} if(alive)timer=setTimeout(poll,3000)};
    timer=setTimeout(poll,3000);
    return()=>{alive=false;clearTimeout(timer)};
  },[token,ready,refreshAgents]);
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
          if(saved.url==='https://aethervm-api.onrender.com')saved.url=DEFAULT_URL;
          setConfig(saved);
        }
        setName((await SecureStore.getItemAsync("name")) || "");
        const savedEmail=(await SecureStore.getItemAsync("email")) || "";
        setEmail(savedEmail);
        const savedPhoto=(await SecureStore.getItemAsync("google-photo")) || "";
        const googleUser=GoogleSignin.getCurrentUser();
        const restoredPhoto=savedPhoto || (googleUser?.user.email===savedEmail ? googleUser.user.photo || "" : "");
        setPhoto(restoredPhoto);
        if(restoredPhoto&&!savedPhoto)await SecureStore.setItemAsync("google-photo",restoredPhoto);
        setSelected((await SecureStore.getItemAsync("agent")) || "");
        setToken((await SecureStore.getItemAsync("session")) || "");
        setOnboarding(
          (await SecureStore.getItemAsync("onboarding-v4")) !== "done",
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
  useEffect(()=>{
    if(!ready||!token||!config.key)return;
    let alive=true;
    api('/provider/models','POST',{api_key:config.key}).then(r=>{
      const available=curateModels(r.models||[]);
      if(alive&&available.length)setModels(available);
    }).catch(()=>{}); // Cached built-in choices remain usable during provider outages.
    return()=>{alive=false};
  },[ready,token,config.key,config.url]);
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
      const restoredJob = tasks[0] ? await api("/tasks/" + tasks[0].id) : null;
      if (version !== refreshVersion.current || selected !== selectedRef.current) return;
      setMessages(msgs);
      setHistory(tasks);
      setJob(restoredJob);
      setOffline(false);
    } catch (e) {
      if (version === refreshVersion.current) {
        setOffline(true);
        report(e, "Could not restore this workspace");
      }
    }
  }, [selected, token, api, report]);
  useEffect(() => {
    followConversation.current=true;
    setMessages([]);
    setJob(null);
    setPrompt("");
    setEditMessage(null);
    setAttachments([]);
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
      workspaceApi("/workspace/status")
        .then((d) => setComputerState(d.state))
        .catch(() => setComputerState("unknown"));
  }, [screen, token, workspaceApi]);
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
      const accountPhoto=result.data.user.photo || "";
      await SecureStore.setItemAsync("google-photo",accountPhoto);
      setName(data.name);
      setEmail(result.data.user.email);
      setPhoto(accountPhoto);
      setToken(data.token);
    } catch (e) {
      report(e, "Could not sign in");
    } finally {
      setBusy("");
    }
  };
  const send = async (text = prompt, targetAgent = agent) => {
    if (!text.trim() || !targetAgent || targetAgent.job?.status === "running" || sending.current)
      return;
    if (!config.key) {
      setProviderOpen(true);
      return;
    }
    sending.current = true;
    setBusy("send");
    const aid = targetAgent.id;
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
        ...(editMessage?{edit_message_id:editMessage.id}:{}),
      });
      setSelected(aid);
      followConversation.current=true;
      setScreen("chat");
      refreshVersion.current++;
      setMessages((m) => [
        ...(editMessage?m.filter(x=>x.id<editMessage.id):m),
        {
          id: Date.now(),
          role: "user",
          text: full,
          created: Date.now() / 1000,
        },
      ]);
      setPrompt("");
      setEditMessage(null);
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
      if (screen !== "home") {
        setScreen(screen === "computer" ? "chat" : "home");
        return true;
      }
      return false;
    });
    return () => back.remove();
  }, [screen]);
  const finishOnboarding = async (key: string, model: string, first?: any) => {
    await persist({ ...config, key, model });
    if (first) {
      const existing=agents.find(a=>!a.job && !a.memory && a.name==='Atlas' && a.role==='General assistant' && a.instructions==='Help with research, files and software. Verify your work and report results clearly.');
      const saved = await api('/agents'+(existing?'/'+existing.id:''), existing?'PUT':'POST', first);
      await refreshAgents();
      setSelected(saved.id);
    }
    await SecureStore.setItemAsync('onboarding-v4', 'done');
    setOnboarding(false);
    setScreen('home');
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
      setScreen("chat");
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
  const manageAgent=async(id:string)=>{
    const a=agents.find(a=>a.id===id);if(!a)return;
    setSelected(id);setProfile(a);
    try{setSkills(await api('/agents/'+id+'/skills'))}catch(e){report(e)}
  };
  const removeAgent=async()=>{
    if(!profile)return;setBusy('remove');
    try{
      await api('/agents/'+profile.id,'DELETE');
      const items=await refreshAgents();
      if(selected===profile.id)setSelected(items[0]?.id||'');
      setProfile(null);setRemoveConfirm(false);setScreen('home');
    }catch(e){report(e,'Could not remove assistant')}finally{setBusy('')}
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
      setModels(curateModels(result.models));
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
          await workspaceApi("/workspace/file?path=" + encodeURIComponent(path)),
        );
      } catch (e) {
        report(e, "Could not open this file");
      } finally {
        setBusy("");
      }
    },
    [workspaceApi, report],
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
      const uploaded = await workspaceApi("/workspace/upload", "POST", {
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
      await SecureStore.deleteItemAsync("google-photo");
      setPhoto("");
      setToken("");
      setAgents([]);
      setMessages([]);
      setSelected("");
      setScreen("home");
    } catch (e) {
      report(e, "Could not sign out");
    } finally {
      setBusy("");
    }
  };
  const currentAction =
    job?.control === "user"
      ? "Waiting for you to hand control back"
      : eventLabel(
          job?.events
            ?.filter((e) => ['status','tool','result','text','attention'].includes(e.kind))
            .at(-1),
        );
  const messageIds=new Set(messages.map(m=>m.id));
  const liveMessages:Message[]=(job?.events||[]).flatMap((e,i)=>e.kind==='text'&&e.text&&(e.message_id?!messageIds.has(e.message_id):job?.status==='running'||job?.status==='waiting')?[{id:e.message_id||-i-1,role:'assistant',text:e.text}]:[]);
  const conversationMessages=[...messages,...liveMessages];
  const attention = job?.events?.find((e) => e.kind === "attention");
  const artifactPaths = [
    ...new Set(
      (job?.events || [])
        .filter((e) => e.kind === "tool" && e.name === "write_file")
        .map((e) => e.args?.path as string)
        .filter(Boolean),
    ),
  ];
  const chat = (
    <View style={{ flex: 1 }}>
      <FlatList
        ref={list}
        data={conversationMessages}
        keyExtractor={(m) => String(m.id)}
        keyboardShouldPersistTaps="handled"
        onScroll={({nativeEvent:{contentOffset,contentSize,layoutMeasurement}})=>{followConversation.current=contentSize.height-layoutMeasurement.height-contentOffset.y<80}}
        scrollEventThrottle={100}
        onContentSizeChange={()=>{if(followConversation.current)list.current?.scrollToEnd({animated:config.animations&&!reduceMotion})}}
        contentContainerStyle={[
          s.transcript,
          !conversationMessages.length && { flexGrow: 1 },
        ]}
        initialNumToRender={12}
        windowSize={7}
        renderItem={({ item }) =>
          agent ? (
            <MessageView message={item} agent={agent} onFile={previewFile} onEdit={item.role==='user'&&item.id===messages.filter(m=>m.role==='user').at(-1)?.id&&job?.status!=='running'?()=>{setEditMessage(item);setPrompt(item.text);setAttachments([])}:undefined} />
          ) : null
        }
        ListHeaderComponent={
          conversationMessages.length ? (
            <Text style={s.dateDivider}>
              Your conversation with {agent?.name}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.emptyChat}>
            {agent ? (
              <>
                <Avatar shape={agent.shape} material={agent.material} variant={agent.avatar} size={150} interactive />
                <Text style={s.emptyTitle}>What should I work on?</Text>
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
              {job?.status==='running'&&<View accessibilityLabel="Agent working" style={s.workerStatus}>
                <Avatar shape={agent.shape} material={agent.material} size={30} state={taskState(job)} interactive/>
                <Text accessibilityLiveRegion="polite" style={s.workerStatusText}>{offline?'Reconnecting…':currentAction}</Text>
              </View>}
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
        {editMessage&&<View style={[s.inline,{paddingHorizontal:8,paddingBottom:8}]}><Icon name="edit" size={17}/><Text style={[s.caption,{flex:1}]}>Editing your last message</Text><IconButton name="close" label="Cancel message edit" onPress={()=>{setEditMessage(null);setPrompt('')}}/></View>}
        <View style={{alignItems:'flex-end',paddingBottom:5}}><Pressable accessibilityRole="button" accessibilityLabel="Choose model" onPress={()=>setModelPicker(true)} style={s.modelButton}><Text style={s.tiny}>{models.find(m=>m.id===config.model)?.name||config.model.replace('gemini-','Gemini ')}</Text><Icon name="down" size={13}/></Pressable></View>
        <View style={{flexDirection:'row',alignItems:'flex-end',gap:10}}><View style={{paddingBottom:4}}><IconButton round name="plus" label="Attach a file" disabled={!!busy||job?.status==='running'} onPress={attachFile}/></View>
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
          right={<ProfileImage name={name} photo={photo} size={40}/>}
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
          subtitle="Each agent has its own computer · Files stay between tasks"
          onPress={() => setScreen("computer")}
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
      <Text style={s.settingsFooter}>AetherVM · Android preview 0.4.2</Text>
    </ScrollView>
  );
  if (!ready || !launchReady)
    return <StartupScreen motion={config.animations&&!reduceMotion} onReady={startupReady}/>;
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

            <View style={s.main}>
              {screen!=='home'&&<View style={s.header}>
                <IconButton round name="back" label={screen==='chat'||screen==='settings'?'Back Home':'Back to conversation'} onPress={()=>setScreen(screen==='computer'?'chat':'home')}/>
                {screen==='settings'?<Text style={[s.headerTitle,{flex:1,paddingLeft:10}]}>Settings</Text>:<View style={s.headerIdentity}>
                  {agent&&<Avatar shape={agent.shape} material={agent.material} size={30} interactive state={busy==='upload'?'uploading':busy==='send'?'sending':prompt?'listening':taskState(job)}/>}
                  <Pressable accessibilityRole="button" accessibilityLabel="Assistant profile" onPress={openProfile} style={{flexShrink:1,minWidth:0}}><Text numberOfLines={1} style={s.headerTitle}>{screen==='computer'?`${agent?.name||'Assistant'}’s computer`:agent?.name||'Your assistant'}</Text></Pressable>
                </View>}
                <IconButton round name={screen==='settings'?'menu':screen==='computer'?'back':'computer'} label={screen==='settings'?'Open sidebar':screen==='computer'?'Open conversation':'Open computer'} onPress={()=>{if(screen==='settings')setAccountMenu(true);else{setComputerExpanded(false);setScreen(screen==='computer'?'chat':'computer')}}}/>
              </View>}
              <SlideSurface key={screen} style={{ flex: 1 }} from="right">
                {screen==='home' ? (
                  <HomeScreen name={name} photo={photo} agents={agents} onAccount={()=>setAccountMenu(true)} onOpen={id=>{setSelected(id);setScreen('chat')}} onManage={manageAgent} onCreate={()=>{setProfileAdvanced(false);setEditing({...emptyProfile})}}/>
                ) : screen === "settings" ? (
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
                          api={workspaceApi}
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
                      api={workspaceApi}
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
        {accountMenu&&<Sidebar name={name} email={email} photo={photo} agents={agents} onClose={()=>setAccountMenu(false)} onHome={()=>{setAccountMenu(false);setScreen('home')}} onOpen={id=>{setAccountMenu(false);setSelected(id);setScreen('chat')}} onCreate={()=>{setAccountMenu(false);setEditing({...emptyProfile});setProfileAdvanced(false)}} onSettings={()=>{setAccountMenu(false);setScreen('settings')}} onRemoved={()=>{setAccountMenu(false);setRemovedOpen(true);api('/removed-agents').then(setRemoved).catch(report)}}/>}
        {removedOpen&&<Sheet title="Removed assistants" subtitle="Restore an assistant with its conversation and files." onClose={()=>setRemovedOpen(false)}>
          {removed.length?removed.map(a=><Row key={a.id} icon="refresh" title={a.name} subtitle="Restore assistant" onPress={async()=>{try{await api('/agents/'+a.id+'/restore','POST');await refreshAgents();setRemoved(items=>items.filter(i=>i.id!==a.id))}catch(e){report(e)}}}/>):<Text style={s.bodyText}>No removed assistants.</Text>}
        </Sheet>}
        {modelPicker&&<Sheet title="Choose a model" subtitle="Models for chatting, reasoning and computer tasks." onClose={()=>setModelPicker(false)}>
          {models.map(m=><Row key={m.id} icon="spark" title={m.name} subtitle={m.description} right={config.model===m.id?<Icon name="check" color={C.text}/>:undefined} onPress={()=>{persist({...config,model:m.id}).catch(report);setModelPicker(false)}}/>)}
          {!config.key&&<Button label="Add Gemini API key" onPress={()=>{setModelPicker(false);setProviderOpen(true)}}/>}
        </Sheet>}
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
              <Avatar shape={editing.shape} material={editing.material} variant={editing.avatar} size={180} interactive state="curious" />
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
                width: "100%",
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
            <AppearancePicker value={editing} onChange={(value)=>setEditing({...editing,...value})} />
            <Text style={[s.sectionLabel, { marginBottom: 10 }]}>
              WHAT SHOULD IT HELP WITH?
            </Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
              {["General", "Research", "Coding", "Creative"].map((role) => (
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
            onClose={() => {setProfile(null);setRemoveConfirm(false)}}
          >
            <View style={s.profileIntro}>
              <Avatar shape={profile.shape} material={profile.material} variant={profile.avatar} size={58} />
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
                subtitle="This agent’s own computer and files"
                onPress={() => {
                  setProfile(null);
                  setScreen("computer");
                }}
              />
            </Section>
            <Row icon="trash" title="Remove assistant" subtitle="You can restore it later, including its files." onPress={()=>setRemoveConfirm(true)}/>
            {removeConfirm&&<View style={{paddingTop:12,gap:8}}><Text style={s.caption}>Remove {profile.name} from your assistants? Its computer will stop and its files will stay available for restore.</Text><Button label="Remove assistant" icon="trash" onPress={removeAgent} loading={busy==='remove'}/><Button label="Keep assistant" secondary onPress={()=>setRemoveConfirm(false)}/></View>}
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
                const key=draftKey.trim()||config.key;
                persist({...config,key}).catch(report);
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

export default function App() {
  return (
    <SafeAreaProvider>
      <WorkspaceApp />
    </SafeAreaProvider>
  );
}
export { WorkspaceApp };
