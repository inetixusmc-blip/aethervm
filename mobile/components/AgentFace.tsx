import React, {
  memo,
  useContext,
  useEffect,
  useRef,
  useState,
  createContext,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  View,
} from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Ellipse,
} from "react-native-svg";

export const MotionContext = createContext(true);
export type FaceMood = "idle" | "working" | "waiting" | "error" | "success";
export const faceColors = [
  "#DFE7FF",
  "#A6D7C1",
  "#F0BA8B",
  "#CDB5F2",
  "#9DCFDA",
  "#EBD583",
];
const silhouettes = [
  "M12 19C15 6 46 4 53 19C61 33 54 54 38 57C20 62 4 49 7 33Z",
  "M26 8Q32 1 39 10L58 43Q62 54 46 56L16 56Q3 54 8 42Z",
  "M32 6C46 6 59 15 59 30C59 46 46 58 30 58C15 58 5 46 5 31C5 17 17 6 32 6Z",
  "M18 8H46Q58 8 58 21V43Q58 57 44 57H19Q6 57 6 44V22Q6 8 18 8Z",
  "M31 4Q34 4 37 9L57 39Q65 55 48 58H17Q1 55 8 40L26 9Q29 4 31 4Z",
  "M13 22C8 9 24 3 32 11C43 0 59 14 52 25C66 34 57 54 44 51C35 64 16 60 15 49C1 49 0 30 13 22Z",
];

export default memo(function AgentFace({
  variant = 0,
  size = 36,
  active = false,
  mood: suppliedMood,
}: {
  variant?: number;
  size?: number;
  active?: boolean;
  mood?: FaceMood;
}) {
  const motion = useContext(MotionContext);
  const mood = suppliedMood || (active ? "working" : "idle");
  const [reduced, setReduced] = useState(false),
    [visible, setVisible] = useState(true),
    [wink, setWink] = useState(false);
  const blink = useRef(new Animated.Value(1)).current;
  const look = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const bob = useRef(new Animated.Value(0)).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const squash = useRef(new Animated.Value(1)).current;
  const scale = size / 64,
    color = faceColors[variant % 6],
    ink = "#151719";
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const access = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    const app = AppState.addEventListener("change", (s) =>
      setVisible(s === "active"),
    );
    return () => {
      access.remove();
      app.remove();
    };
  }, []);
  useEffect(() => {
    if (!motion || reduced || !visible || size < 32) {
      blink.setValue(1);
      look.setValue({ x: 0, y: 0 });
      bob.setValue(0);
      tilt.setValue(0);
      return;
    }
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        if (alive) fn();
      }, ms);
      timers.push(t);
    };
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: -1.5,
          duration: 1600,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    breathe.start();
    const doBlink = () => {
      setWink(mood === "success" || (mood === "idle" && Math.random() < 0.15));
      Animated.sequence([
        Animated.timing(blink, {
          toValue: 0.08,
          duration: 95,
          useNativeDriver: true,
        }),
        Animated.timing(blink, {
          toValue: 1,
          duration: 145,
          useNativeDriver: true,
        }),
      ]).start();
      later(doBlink, 2600 + Math.random() * 3300);
    };
    const glance = () => {
      const x =
        mood === "working"
          ? (Math.random() - 0.5) * 5
          : (Math.random() - 0.5) * 3;
      Animated.spring(look, {
        toValue: { x, y: mood === "waiting" ? -1 : (Math.random() - 0.5) * 2 },
        speed: 9,
        bounciness: 3,
        useNativeDriver: true,
      }).start();
      Animated.spring(tilt, {
        toValue: mood === "error" ? -5 : mood === "waiting" ? 5 : x * 0.8,
        speed: 5,
        bounciness: 6,
        useNativeDriver: true,
      }).start();
      later(glance, mood === "working" ? 1700 : 3700 + Math.random() * 2200);
    };
    later(doBlink, 900 + variant * 330);
    later(glance, 600);
    if (mood === "success")
      Animated.sequence([
        Animated.spring(squash, { toValue: 1.12, useNativeDriver: true }),
        Animated.spring(squash, { toValue: 1, useNativeDriver: true }),
      ]).start();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      breathe.stop();
      blink.stopAnimation();
      look.stopAnimation();
      tilt.stopAnimation();
      squash.stopAnimation();
    };
  }, [motion, reduced, visible, mood, variant]);
  const eyesY = mood === "error" ? 28 : 26;
  return (
    <View
      accessible
      accessibilityLabel={`${mood} agent`}
      style={{ width: size, height: size }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: (size - 64) / 2,
          top: (size - 64) / 2,
          width: 64,
          height: 64,
          transform: [
            { scale },
            { translateY: bob },
            {
              rotate: tilt.interpolate({
                inputRange: [-10, 10],
                outputRange: ["-10deg", "10deg"],
              }),
            },
            { scaleY: squash },
          ],
        }}
      >
        <Svg width={64} height={64} viewBox="0 0 64 64">
          <Defs>
            <LinearGradient id="face" x1="0" y1="0" x2=".8" y2="1">
              <Stop offset="0" stopColor={color} />
              <Stop offset="1" stopColor={color} stopOpacity=".85" />
            </LinearGradient>
          </Defs>
          <Path d={silhouettes[variant % 6]} fill="url(#face)" />
          <Path
            d={silhouettes[variant % 6]}
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity=".15"
            strokeWidth=".7"
          />
          <Ellipse
            cx="17"
            cy="42"
            rx="3"
            ry="1.6"
            fill="#D17978"
            opacity={mood === "success" ? 0.4 : 0.15}
          />
          <Ellipse
            cx="47"
            cy="42"
            rx="3"
            ry="1.6"
            fill="#D17978"
            opacity={mood === "success" ? 0.4 : 0.15}
          />
          {mood === "error" ? (
            <Path
              d="M25 45Q32 40 39 45"
              fill="none"
              stroke={ink}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          ) : mood === "waiting" ? (
            <Ellipse cx="33" cy="43" rx="2.6" ry="3" fill={ink} />
          ) : (
            <Path
              d={
                mood === "success" ? "M25 42Q32 51 40 42" : "M28 43Q33 46 37 42"
              }
              fill="none"
              stroke={ink}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
          {mood === "working" && (
            <Path
              d="M18 22l9 1M38 23l9-2"
              stroke={ink}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
          {mood === "error" && (
            <Path
              d="M18 23l9-3M38 20l9 3"
              stroke={ink}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          )}
          {mood === "waiting" && (
            <Path
              d="M18 21q5-4 10 0M38 21q5-4 10 0"
              fill="none"
              stroke={ink}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          )}
        </Svg>
        <Animated.View
          style={{
            position: "absolute",
            left: 19,
            top: eyesY,
            flexDirection: "row",
            gap: 12,
            transform: look.getTranslateTransform(),
          }}
        >
          {[0, 1].map((i) => (
            <Animated.View
              key={i}
              style={{
                width: 7.5,
                height: mood === "working" ? 11 : 13,
                borderRadius: 5,
                backgroundColor: ink,
                transform: [
                  { scaleY: i === 0 && wink ? 1 : blink },
                  { rotate: i === 0 ? "5deg" : "-5deg" },
                ],
              }}
            >
              <View
                style={{
                  width: 1.9,
                  height: 2.4,
                  borderRadius: 2,
                  backgroundColor: "#FFFFFF80",
                  marginLeft: 1.8,
                  marginTop: 2,
                }}
              />
            </Animated.View>
          ))}
        </Animated.View>
      </Animated.View>
    </View>
  );
});
