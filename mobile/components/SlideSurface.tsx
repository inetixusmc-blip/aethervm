import React, { useContext, useEffect, useRef } from "react";
import { Animated, useWindowDimensions } from "react-native";
import { MotionContext } from "./AgentFace";
export default function SlideSurface({
  children,
  from = "right",
  style,
}: {
  children: React.ReactNode;
  from?: "left" | "right" | "bottom";
  style?: any;
}) {
  const motion = useContext(MotionContext),
    { width } = useWindowDimensions();
  const position = useRef(
    new Animated.Value(
      motion
        ? from === "left"
          ? -width * 0.8
          : from === "bottom"
            ? 240
            : width * 0.45
        : 0,
    ),
  ).current;
  useEffect(() => {
    if (!motion) {
      position.setValue(0);
      return;
    }
    Animated.spring(position, {
      toValue: 0,
      speed: 19,
      bounciness: 0,
      useNativeDriver: true,
    }).start();
    return () => position.stopAnimation();
  }, [motion]);
  return (
    <Animated.View
      style={[
        style,
        {
          transform:
            from === "bottom"
              ? [{ translateY: position }]
              : [{ translateX: position }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
