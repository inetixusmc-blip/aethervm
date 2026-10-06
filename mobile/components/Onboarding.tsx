import React, { useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  TextInput,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import AgentFace, { MotionContext } from "./AgentFace";

export default function Onboarding({
  api,
  initialKey,
  initialModel,
  onComplete,
}: {
  api: (path: string, method?: string, body?: any) => Promise<any>;
  initialKey: string;
  initialModel: string;
  onComplete: (key: string, model: string) => Promise<void>;
}) {
  const [step, setStep] = useState(0),
    [key, setKey] = useState(initialKey),
    [model, setModel] = useState(initialModel),
    [models, setModels] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [verified, setVerified] = useState(false);
  const motion = React.useContext(MotionContext);
  const slide = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();
  const go = (next: number) => {
    if (!motion) {
      setStep(next);
      return;
    }
    Animated.timing(slide, {
      toValue: next > step ? -width * 0.15 : width * 0.15,
      duration: 130,
      useNativeDriver: true,
    }).start(() => {
      setStep(next);
      slide.setValue(next > step ? width * 0.35 : -width * 0.35);
      Animated.spring(slide, {
        toValue: 0,
        speed: 17,
        bounciness: 0,
        useNativeDriver: true,
      }).start();
    });
  };
  const check = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api("/provider/test", "POST", {
        api_key: key.trim(),
        model,
      });
      setModels(r.models);
      setVerified(true);
      setModel(r.model_checked || model);
    } catch (e: any) {
      setError(e.message);
      setVerified(false);
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    try {
      await onComplete(key.trim(), model);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: "#111315" }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 24 }}>
        <Text
          style={{ color: "#ECEFF1", fontSize: 19, fontWeight: "600", flex: 1 }}
        >
          aetherVM
        </Text>
        <Pressable onPress={finish} disabled={busy}>
          <Text style={{ color: "#949CA4", fontSize: 13 }}>Set up later</Text>
        </Pressable>
      </View>
      <Animated.View style={{ flex: 1, transform: [{ translateX: slide }] }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            flexGrow: 1,
            padding: 28,
            maxWidth: 500,
            width: "100%",
            alignSelf: "center",
          }}
        >
          <View
            style={{
              alignItems: "center",
              paddingTop: step === 1 ? 18 : 48,
              paddingBottom: 32,
            }}
          >
            <AgentFace
              variant={step}
              size={step === 1 ? 82 : 145}
              mood={step === 2 ? "success" : "idle"}
            />
          </View>
          <Text
            style={{
              color: "#ECEFF1",
              fontSize: 32,
              lineHeight: 38,
              fontWeight: "600",
              letterSpacing: -1,
              marginBottom: 14,
            }}
          >
            {
              [
                "Meet your new\ncomputer companion.",
                "Bring your Gemini.",
                "Watch. Help.\nHand it back.",
              ][step]
            }
          </Text>
          <Text
            style={{
              color: "#949CA4",
              fontSize: 16,
              lineHeight: 25,
              marginBottom: 28,
            }}
          >
            {
              [
                "Give an agent a task. It can browse, install tools and work with files on its own Linux computer.",
                "Your key stays securely on this phone. Choose a model you have access to; Gemini and Daytona usage follow your provider quotas.",
                "Tap the computer icon to watch while your agent works. Take control when it needs a login, then hand control back and tell it to continue.",
              ][step]
            }
          </Text>
          {step === 1 && (
            <>
              <TextInput
                accessibilityLabel="Gemini API key"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={key}
                onChangeText={(v) => {
                  setKey(v);
                  setVerified(false);
                }}
                placeholder="Paste your Gemini API key"
                placeholderTextColor="#69737D"
                style={{
                  borderWidth: 1,
                  borderColor: "#2A2E32",
                  borderRadius: 16,
                  color: "#ECEFF1",
                  padding: 18,
                  fontSize: 15,
                }}
              />
              <Pressable
                disabled={busy || key.trim().length < 10}
                onPress={check}
                style={{ paddingVertical: 18, flexDirection: "row", gap: 10 }}
              >
                {busy && <ActivityIndicator size="small" color="#B7C6FA" />}
                <Text style={{ color: verified ? "#8FC8A5" : "#B7C6FA" }}>
                  {verified ? "Connected ✓" : "Test connection"}
                </Text>
              </Pressable>
              {!!models.length && (
                <View style={{ marginBottom: 20 }}>
                  <Text
                    style={{ color: "#949CA4", fontSize: 12, marginBottom: 10 }}
                  >
                    YOUR MODEL
                  </Text>
                  {models.slice(0, 8).map((m) => (
                    <Pressable
                      key={m.id}
                      onPress={() => setModel(m.id)}
                      style={{
                        padding: 13,
                        borderRadius: 12,
                        marginBottom: 5,
                        backgroundColor: model === m.id ? "#252D40" : "#1B1E21",
                      }}
                    >
                      <Text style={{ color: "#ECEFF1", fontSize: 14 }}>
                        {m.name}
                        {model === m.id ? "  ✓" : ""}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
          {step === 2 && (
            <View style={{ gap: 18 }}>
              {[
                ["1", "Tell it what you need"],
                ["2", "Watch the computer live"],
                ["3", "Review the result"],
              ].map(([n, t]) => (
                <View
                  key={n}
                  style={{
                    flexDirection: "row",
                    gap: 15,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#B7C6FA", fontSize: 15 }}>
                    {n.padStart(2, "0")}
                  </Text>
                  <Text style={{ color: "#ECEFF1", fontSize: 15 }}>{t}</Text>
                </View>
              ))}
              <Text
                style={{
                  color: "#69737D",
                  fontSize: 12,
                  lineHeight: 19,
                  marginTop: 12,
                }}
              >
                Agents share your account’s computer. Purchases, messages and
                destructive actions need your approval. A task can use shell
                commands without changing the visible desktop.
              </Text>
            </View>
          )}
          {!!error && (
            <Text
              style={{
                color: "#E7A29E",
                fontSize: 13,
                lineHeight: 20,
                marginTop: 15,
              }}
            >
              {error}
            </Text>
          )}
        </ScrollView>
      </Animated.View>
      <View
        style={{
          padding: 24,
          maxWidth: 500,
          width: "100%",
          alignSelf: "center",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 7,
            justifyContent: "center",
            marginBottom: 24,
          }}
        >
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                width: i === step ? 24 : 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: i === step ? "#ECEFF1" : "#393F45",
              }}
            />
          ))}
        </View>
        <Pressable
          disabled={busy}
          onPress={() => (step < 2 ? go(step + 1) : finish())}
          style={{
            backgroundColor: "#ECEFF1",
            padding: 18,
            borderRadius: 30,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#111315", fontSize: 16, fontWeight: "600" }}>
            {step === 2
              ? "Open my workspace"
              : step === 1 && !verified
                ? "Continue without testing"
                : "Continue"}
          </Text>
        </Pressable>
        {step > 0 && (
          <Pressable
            onPress={() => go(step - 1)}
            style={{ paddingTop: 15, alignItems: "center" }}
          >
            <Text style={{ color: "#949CA4", fontSize: 13 }}>Back</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
