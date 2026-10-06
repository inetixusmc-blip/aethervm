# Character runtime provenance

Original: https://github.com/iduu/grokbot-animation
Source commit: 6c27d9640c37e02e1eab0c4f7d98fa01196c66b8
Vendored from `component/`; its geometry, state data, eye poses, material system,
physics, morphs, behaviors, renderer and particles remain byte-identical.
`runtime-entry.js` uses the source SVG template and state defaults, with a small
native bridge. `scripts/bundle-character.cjs` creates a network-free document for
React Native WebView and the web preview. It does not replace the renderer.

The public component's optional dialogue/audio editor is outside AetherVM's
scope. All 39 character states, 18 shapes, 25 eye poses and source materials are
retained. Size-dependent particles follow the source component's thumbnail
policy. Hidden thumbnail engines and background views pause without changing
geometry. Reduce Motion uses the source reduced-motion physics path.

`compare-character.mjs` takes `GROKBOT_SOURCE` pointing to an upstream component
checkout. It checks byte identity and deterministically compares actual shipped
HTML output against the upstream engine across 702 shape/state transitions.
Source geometry, eye transforms, body transforms, task morphs and state snapshots
match. This is a runtime/geometry comparison; Android GPU/WebView rendering and
performance still require a real-device check.
