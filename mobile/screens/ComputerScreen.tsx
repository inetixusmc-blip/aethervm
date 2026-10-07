import React,{useEffect,useRef,useState} from 'react';
import {View,Text,TextInput,Pressable,ActivityIndicator,FlatList,ScrollView,Image,AppState,StyleSheet,useWindowDimensions} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import {C,s} from '../design';
import {Agent,Api,WorkspaceFile} from '../types';
import {Icon,IconButton,Button,Row} from '../ui';
function fileSize(n:number){return n>1048576?(n/1048576).toFixed(1)+' MB':n>1024?Math.ceil(n/1024)+' KB':n+' B'}
export default function Computer({
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
    connectionVersion=useRef(0),
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
    let nextRecovery = 0;
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
          // Auto-stop may have slept the machine while the app was in the background.
          if(Date.now()>=nextRecovery){
            nextRecovery=Date.now()+30000;
            try{await api('/workspace/start','POST')}catch{}
          }
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
    const version=++connectionVersion.current;
    setLoading(true);
    setScreenError("");
    try {
      const result = await api("/workspace/start", "POST");
      if(version!==connectionVersion.current)return;
      setComputerState(result.state);
      setOwner(result.control);
      setConnected(true);
    } catch (e: any) {
      if(version===connectionVersion.current)setScreenError(e.message);
    } finally {
      if(version===connectionVersion.current)setLoading(false);
    }
  };
  useEffect(() => {
    setConnected(false);setShot(null);setFiles([]);setOutputs([]);setFolder('');setOwner('agent');
    connect();
    return()=>{connectionVersion.current++};
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
                  "Your Ubuntu 24.04 computer for browsing, building, and working with files."}
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
              {(screenError || activity) && (
                <Text style={[s.caption, { marginTop: 12 }]}>
                  {screenError
                    ? "Connection interrupted. Reconnecting to the live screen…"
                    : activity}
                </Text>
              )}
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
                <Text style={s.tiny}>
                  {screenError ? "Last frame" : "Live"}
                </Text>
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
