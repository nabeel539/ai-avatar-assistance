# Apex Cloud AI Interactive 3D Avatar — Technical Documentation

---

## 1. Project Overview
- **Project Name**: Apex Cloud Interactive 3D AI Voice Assistant & Guide ("Alex")
- **Problem It Solves**: Traditional e-commerce and SaaS landing pages are static and overwhelming. Text-only chatbots disconnect users from the page context, while expensive pre-rendered video avatar streams (e.g., Synthesia) suffer from high recurring stream costs, latency, and inflexible full-body page interaction.
- **What I Built**: A real-time, low-latency conversational 3D AI avatar integrated natively into a modern cloud SaaS website. The avatar speaks with voice, lip-syncs dynamically using Web Audio analysis, gestures towards referenced on-page content, and guides users by automatically scrolling to and highlighting relevant sections (services, pricing tiers, FAQs) based on intent.
- **Interview Pitch**: *"I engineered a real-time multimodal AI website guide combining a Python-based LiveKit voice pipeline with a browser-side Three.js 3D character. The avatar not only carries on natural voice and text conversations using Groq LLM and neural TTS, but also acts as an interactive concierge that navigates the website, highlights products, and gestures directly toward on-screen elements while explaining them."*

---

## 2. Tech Stack

| Layer | Technologies Actually Used |
|---|---|
| **Frontend** | Vanilla HTML5, Modern CSS (Glassmorphism, CSS Custom Properties), Vanilla JavaScript (ES Modules). No heavyweight frameworks (React/Vite). |
| **Backend** | Python 3.12, `aiohttp` web server (token generation & static hosting), `livekit-agents` worker runtime. |
| **AI / LLM** | Groq API (`openai/gpt-oss-120b` / `llama-3.3-70b-versatile`) with function calling tools; fallback to LiveKit Cloud Inference (`openai/gpt-4.1-mini`). |
| **Voice / Audio** | **VAD**: Silero VAD (voice activity detection).<br>**STT**: Cartesia `ink-2` / OpenAI Whisper-1.<br>**TTS**: Cartesia `sonic-3.6` (ultra-low latency voice) / OpenAI `alloy`.<br>**Web Audio API**: Browser-side RMS amplitude audio analyser. |
| **3D / Avatar** | Three.js (r160), GLTFLoader, Ready Player Me full-body avatar (`.glb`), Mixamo animation clips (`animations.glb`), procedural soft radial contact shadow disc, ARKit blendshapes (`jawOpen`, `mouthSmile`, `eyeBlinkLeft/Right`). |
| **Communication** | WebRTC via LiveKit Cloud, LiveKit Server SDK (Python), LiveKit Client SDK (Browser UMD), RTC Data Channel (`topic: 'ui'` & `topic: 'user_prompt'`). |
| **Testing & Tools** | Python `unittest` suite (`test_prototype.py`), custom Three.js headless test harnesses, ripgrep. |

---

## 3. Architecture / End-to-End Flow

### End-to-End Flow
1. **User Speaks / Clicks Chip**: User speaks into the microphone (or clicks a suggestion prompt chip on the page).
2. **Audio Transport & VAD**: WebRTC audio stream travels to LiveKit Cloud. Silero VAD detects end-of-speech.
3. **Speech-to-Text**: STT transcribes speech into text in real time.
4. **Agent & Tool Routing**: The prompt is processed by the Groq LLM inside the `SupportAgent` class. The LLM determines if user intent requires page navigation/highlighting:
   - *If intent maps to a product/service*: Agent invokes tools (`navigate_to`, `highlight_element`).
   - *If normal inquiry* (e.g., refund policy, company info): Agent answers directly without calling UI tools.
5. **UI Synchronization via Data Channel**: Tool actions publish JSON packets over LiveKit data channel `topic: 'ui'`. The browser receives the event, smoothly scrolls to the target anchor (e.g., `#pricing`), activates a luminous pulse highlight, and triggers the avatar’s directional pointing gesture.
6. **Text-to-Speech**: LLM response stream is piped into Cartesia/OpenAI TTS, emitting an Opus audio stream over WebRTC.
7. **Playback & Lip-sync Analysis**: Browser receives remote audio track, attaches it to an `<audio>` element for playback, and clones the `MediaStreamTrack` into a non-audible Web Audio `AnalyserNode`.
8. **Procedural Animation Update**: RMS amplitude drives `jawOpen` and mouth blendshapes in the Three.js render loop, while `Talking_0` drives skeletal upper-body movement and the right arm smoothly indicates the content cards.
9. **Return to Idle**: When audio ends and `lk.agent.state` returns to `listening` or `idle`, mouth morphs reset to 0, pointing arm eases down, and the skeleton crossfades smoothly back to `Idle`.

### ASCII Architecture Diagram
```text
┌────────────────────────────────────────────────────────────────────────┐
│                          BROWSER CLIENT                                │
│                                                                        │
│   [User Mic / Chips] ─────────────┐                                    │
│          ▲                        │ WebRTC Stream / Data Channel       │
│          │                        ▼                                    │
│   ┌──────────────┐         ┌───────────────┐     ┌──────────────────┐  │
│   │ Three.js 3D  │◄────────┤ Web Audio API │◄────┤  <audio> Element │  │
│   │ Avatar View  │ (RMS    │ AnalyserNode  │     │ (Speaker Output) │  │
│   │ (Mouth+Pose) │  Morphs)└───────────────┘     └────────▲─────────┘  │
│   └──────▲───────┘                                        │            │
│          │ (Scroll & Point)                               │ WebRTC     │
│   ┌──────┴───────┐   Data Channel ('ui')                  │ Audio      │
│   │ DOM Elements ├────────────────────────────────────────┘            │
│   │ (Cards/Sect) │                                                     │
└───┴──────▲───────┴─────────────────────────────────────────────────────┘
           │
           │ WebRTC Transport (LiveKit Cloud)
           ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        LIVEKIT AGENT BACKEND                           │
│                                                                        │
│  [LiveKit Room] ──► [Silero VAD] ──► [STT: Cartesia / Whisper]         │
│                                                   │                    │
│                                                   ▼ (User Text)        │
│  [TTS: Cartesia] ◄── [Groq LLM: gpt-oss-120b / SupportAgent]           │
│        ▲                     │                                         │
│        │ (Reply Audio)       ├──► Normal Answer (Direct Text)          │
│        └─────────────────────┴──► Function Calling Tools:              │
│                                   • navigate_to(section)               │
│                                   • highlight_element(card_id)         │
│                                   • search_services / search_products  │
│                                   • escalate_to_human                  │
│                                             │                          │
│                                             ▼ Data Channel ('ui')      │
│                                    Browser DOM Dispatch                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Agent Flow & Decision Logic

The agent (`SupportAgent` in `agent.py`) uses function calling with prompt instructions:
- **Decision Engine**:
  - **Tool Trigger**: If the user query expresses intent to view, check prices, compare tiers, or explore a service (e.g., *"Show me the Pro Plan"*, *"What services do you offer?"*, *"Talk to human support"*), the LLM executes function tools:
    - `navigate_to(section)`: Validated against whitelist: `hero`, `services`, `products`, `pricing`, `faq`, `contact`.
    - `highlight_element(element_id)`: Validated against whitelist: `starter-plan`, `pro-plan`, `enterprise-plan`, `cloud-migration`, `devops-pipelines`, `security-compliance`, `disaster-recovery`, `contact-card`, `refund-faq`.
    - `escalate_to_human()`: Navigates to `#contact` and highlights `contact-card`.
  - **Direct Conversation**: If the user asks a conceptual question, FAQ, or policy question (e.g., *"What is your refund policy?"*, *"How does automated CI/CD work?"*, greetings), the agent provides a concise spoken answer without navigating away, keeping the user in their current reading position.
- **Security Whitelist Pattern**: Every action sent over the LiveKit data channel is strictly validated against `Set` lookups on both Python backend and JavaScript frontend to prevent arbitrary DOM manipulation or XSS injection.

---

## 5. Avatar System

- **3D Asset Pipeline**: Full-body character (`avatar.glb`) modeled in Ready Player Me with ARKit standard blendshape targets. Animation pack (`animations.glb`) containing Mixamo mocap clips: `Idle`, `Talking_0`, `Talking_1`, `Talking_2`.
- **Rendering & Transparent Canvas**: Three.js `WebGLRenderer` configured with `alpha: true`, `premultipliedAlpha: false`, and `outputColorSpace = SRGBColorSpace`. The background is completely transparent, allowing the character to stand directly on top of the website without an opaque box or iframe.
- **Procedural Soft Ground Shadow**: Created via a dynamic canvas radial gradient projected on a ground plane at $y = 0.003$ beneath her boots ($0.84\text{m} \times 0.46\text{m}$), grounding the full-body character onto the webpage.
- **Skeletal State Machine**:
  - `Idle`: Subtle breathing and resting posture.
  - `Listening`: Tilts head slightly and faces user when active user audio is detected.
  - `Thinking`: Neutral engaged posture awaiting LLM tokens.
  - `Speaking`: Plays gentle conversational `Talking_0` animation with natural spine and arm motion. Exaggerated clips (`Talking_1` hand-on-hip) were removed to maintain professional presentation.
- **Directional Pointing Gesture (Presenter Pose)**:
  - When explaining content, `pointToContent()` applies calibrated Mixamo bone rotations to `RightArm` (`Euler(0.50, 0.05, -0.28)`), `RightForeArm` (`Euler(0.02, 0.05, -0.42)` with natural 25° elbow bend), and `RightHand` (`Euler(-0.15, 0.20, -0.05)` with open presenter palm).
  - Rotates gracefully towards the left (-X, where content cards reside) without dislocating or stretching the shoulder joint.
  - Head simultaneously glances toward the content (`rotation.y = -0.16`), holds for ~3.5 seconds, and eases back down.
- **Mouth / Lip-sync Animation**:
  - Uses browser Web Audio `AnalyserNode` connected to the remote incoming WebRTC audio track (isolated from output destination to prevent echo).
  - Calculates Root Mean Square (RMS) amplitude in real time: $\text{RMS} = \sqrt{\frac{1}{N} \sum (x_i - 128)^2 / 128^2}$.
  - Dynamically drives the Ready Player Me `jawOpen` morph target with smooth linear interpolation and non-linear speech curve, complemented by persistent micro-smiling (`mouthSmile = 0.14`) and automatic natural eye blinking every 2–4.5s.
- **Facing Orientation**: Avatar is stationed at the bottom-right corner and yaw-rotated by `-0.32` rad (~18°) toward the center of the viewport, naturally welcoming the viewer.

---

## 6. Key Engineering Decisions & Rationale

1. **Why LiveKit over Raw WebRTC / WebSockets**:
   - Out-of-the-box infrastructure handling audio track publication, dynamic reconnection, sub-100ms latency, and synchronization between data channel events and audio streams.
2. **Why Replace Synthesia with Browser Three.js**:
   - Synthesia produces pre-rendered 2D MP4 video streams that cost significant credits per minute, introduce high round-trip latency, cannot interact with DOM elements, and cannot dynamically point to on-page items. Browser Three.js runs client-side at 60 FPS, with 0 stream bandwidth cost and full programmatic control over bones and cameras.
3. **Why Plain Three.js over React Three Fiber (R3F)**:
   - The host application was an existing vanilla JavaScript/HTML site. Injecting React, Vite, and JSX would require rebuilding the build toolchain and bundling overhead. Plain Three.js ES modules allowed clean drop-in architecture with no compile step.
4. **Why Web Audio RMS Analyser for Lip-sync**:
   - For an interactive MVP/demo, real-time Web Audio RMS amplitude gives immediate, zero-latency mouth movement that tracks speech cadence perfectly without the computational overhead or server payload of phoneme/viseme timestamps.
5. **Why LiveKit Data Channel for DOM Control**:
   - Synchronizes page scrolling and card highlighting directly with audio playback. Decouples the backend AI brain from frontend presentation logic while maintaining strict security allowlists.
6. **Why Groq (`gpt-oss-120b` / `llama-3.3-70b`)**:
   - Extremely high inference speed (sub-300ms Time-To-First-Token), critical for real-time conversational voice agents to avoid awkward pauses.

---

## 7. User Experience: Concrete Walkthrough

### Scenario: User asks "Show me the Pro Plan"
1. **User Input**: User clicks the `"Show me the Pro Plan"` chip (or speaks into the microphone).
2. **Agent Processing**:
   - Frontend sets status indicator to `THINKING...`.
   - The prompt is routed over the data channel to `agent.py`.
   - LLM recognizes intent and calls tool `highlight_element(element_id="pro-plan")`.
3. **Smooth Page Navigation**:
   - Browser receives the UI action, smoothly scrolls the viewport to the `#pricing` table, and highlights the **Pro Business** card with an active border pulse.
4. **Synchronized Presenter Gesture**:
   - As TTS begins streaming, the avatar's status indicator changes to `SPEAKING`.
   - The avatar rotates her head slightly toward the pricing cards on the left, raises her right arm with an open palm pointing across the screen to the Pro Business card.
5. **Spoken Explanation & Lip-sync**:
   - Alex speaks: *"Here is our Pro Business plan at $99 per month, featuring 8 vCPUs, 16 GB RAM, 24/7 priority support, and 99.9% uptime SLA..."*
   - Her mouth dynamically opens and syncs to voice volume; eyes blink naturally.
6. **Return to Resting State**:
   - After ~3.5 seconds, her pointing arm smoothly eases down to her side.
   - Once speech ends, the highlight fades after a short grace period, and the avatar transitions back to calm `Idle`.

---

## 8. Technical Challenges & How They Were Solved

1. **Full-Body Camera Framing Inside Floating Widget**:
   - *Problem*: Initial camera zoomed in tightly on the avatar’s face, cropping the lower body and boots.
   - *Solution*: Implemented dynamic trigonometric bounding box calculation in `updateCameraFraming()`. Centered camera on $y = \text{height} \times 0.50$ and computed required distance $d = \max(H, W / \text{aspect}) / (2 \cdot \tan(\text{FOV} / 2)) \times 1.30$, framing her complete silhouette from head to boots.
2. **Shoulder Dislocation & Awkward Arm Angles**:
   - *Problem*: Initial procedural pointing used hardcoded Euler angles that fought against the parent Mixamo `RightShoulder` bone, causing the shoulder joint to dislocate and the arm to poke backwards like a robotic stick.
   - *Solution*: Calibrated local rotation vectors against the Mixamo rest skeleton: `Euler(0.50, 0.05, -0.28)` on `RightArm`, with a soft 25° elbow bend on `RightForeArm` (`-0.42` rad) and open wrist angle. This kept the ball joint seated inside the coat socket while extending forward-left toward the content.
3. **Audio-Echo / Double Playback Bug**:
   - *Problem*: Connecting the remote audio track to both the Web Audio API context and the HTML `<audio>` tag resulted in phasing and dual-playback echo.
   - *Solution*: Connected `MediaStreamSource` exclusively to `AnalyserNode` without bridging to `audioContext.destination`. The physical audio plays solely through the browser `<audio>` element, leaving the analyser as a silent observer.
4. **Unnatural Body Gestures During Regular Speech**:
   - *Problem*: The original loop rotated through Mixamo's `Talking_1` clip, which put the character's hand on her hip with sassy attitude, clashing with professional tech support demeanor.
   - *Solution*: Restricted the speaking loop to gentle, professional `Talking_0` only, and reserved dedicated arm movements exclusively for active on-page content explanations.
5. **Browser Autoplay & AudioContext Suspension**:
   - *Problem*: Modern browsers block Web Audio and WebRTC audio autoplay until the user interacts with the document.
   - *Solution*: Added transparent resume hooks on user click and chip click (`audioContext.resume()` + `room.startAudio()`), ensuring speech begins immediately without missing initial syllables.
6. **Chip Click Explanatory Disconnection**:
   - *Problem*: Originally, clicking a prompt chip only updated a label telling the user to click Start, without answering.
   - *Solution*: Implemented automatic data-channel publishing over topic `user_prompt` with backend `@ctx.room.on("data_received")` listener. If disconnected, it auto-connects the room and immediately executes `session.generate_reply(user_input=text)` with `session.interrupt()`.

---

## 9. What I Personally Implemented

> *"I architected and implemented the end-to-end integration between the LiveKit voice agent backend and the 3D client avatar. On the frontend, I built the Three.js rendering engine from scratch without heavy frameworks, loading the full-body Ready Player Me GLTF model with transparent canvas integration, custom camera auto-framing, procedural contact shadows, and skeletal blendshape controllers. I wrote the Web Audio API amplitude analyser to drive real-time RMS mouth lip-sync and engineered the presenter pointing gesture using Mixamo bone kinematics.*
>
> *On the backend, I implemented the Python LiveKit agent using Groq's high-speed LLM, Silero VAD, and Cartesia neural TTS. I built custom function calling tools (`navigate_to`, `highlight_element`, `escalate_to_human`) that dispatch secure UI events over WebRTC data channels to orchestrate smooth page scrolling and card highlighting. Finally, I connected the prompt chips so that clicking any suggested topic interrupts prior speech and immediately commands the avatar to navigate, point, and explain the feature in real time."*

---

## 10. Interview Quick Answers (Cheat Sheet)

#### Q: What did you build?
**A**: I built a real-time, interactive 3D AI assistant for a cloud SaaS platform. It combines a Python LiveKit voice agent running on Groq with a client-side Three.js full-body avatar that lip-syncs, navigates website sections, and points to on-screen products while explaining them.

#### Q: Explain the architecture.
**A**: Audio flows over WebRTC to LiveKit Cloud, where Silero VAD and STT transcribe it. A Python agent on Groq decides whether to answer directly or trigger navigation tools, emitting TTS audio and data channel UI events back to the browser. The frontend plays the audio, uses Web Audio RMS to drive mouth blendshapes, and triggers Three.js skeletal gestures alongside smooth DOM scrolling.

#### Q: Why did you use LiveKit?
**A**: LiveKit provides a battle-tested WebRTC infrastructure with sub-100ms latency, native Python agent runtimes, and synchronized data channels. It enabled bidirectional voice streaming with voice interruption support without having to maintain custom WebSocket or WebRTC signaling servers.

#### Q: How does the avatar know when to speak?
**A**: The Python LiveKit worker updates participant attributes with `lk.agent.state` (`listening`, `thinking`, `speaking`). The Three.js controller listens to these attribute changes, transitioning the character smoothly between `Idle`, `Listening`, and `Talking_0` animations.

#### Q: How does lip/mouth movement work?
**A**: I connected the incoming WebRTC audio track to a Web Audio `AnalyserNode`. In the 60 FPS render loop, I calculate the Root Mean Square (RMS) volume of the audio buffer and lerp that value onto the Ready Player Me `jawOpen` blendshape target, creating instantaneous speech-synced mouth movement with zero extra network overhead.

#### Q: How does navigation work?
**A**: When the LLM decides to show a section, it invokes function tools like `navigate_to("pricing")` or `highlight_element("pro-plan")`. The Python agent publishes this action over the LiveKit data channel, and the browser executes smooth scrolling, applies a luminous pulse highlight to the target card, and commands the 3D avatar to gesture towards it.

#### Q: How did you handle audio synchronization?
**A**: By keeping the WebRTC audio track as the single source of truth. The same audio track that plays through the browser's audio element is analyzed in real time by the Web Audio analyser. Because the mouth movement and pointing gestures are driven directly from the incoming audio buffer in the local render loop, visual speech and sound are perfectly aligned.

#### Q: How did you make the avatar movement natural?
**A**: I used smooth crossfades between Mixamo mocap animations, added natural procedural eye blinking every 2 to 4.5 seconds, subtle conversational head glances, and a soft micro-smile blendshape. For pointing, I calibrated upper arm, elbow, and wrist angles to match natural human presenter body language without joint clipping.

#### Q: What happens if the user asks a normal question?
**A**: If the user asks a general question like *"What is your refund policy?"*, the LLM provides a concise spoken answer without calling navigation tools. The avatar explains it naturally using voice and lip-sync while remaining in place, avoiding disorienting page jumps.

#### Q: What was the hardest part?
**A**: Getting the skeletal bone rotations for the pointing gesture right without dislocating the shoulder. Mixamo rigs have distinct rest-pose coordinate orientations across parent and child bones; hardcoded world angles twisted the mesh. I had to inspect the bone hierarchy and calculate joint rotations in parent space to ensure a smooth, human presenter pose.

#### Q: What would you improve in production?
**A**: In production, I would upgrade from amplitude-based RMS mouth movement to phoneme-aligned visemes using audio-to-viseme models (e.g. Oculus OVR lipsync or wav2vec). I would also add user voice interruption cancellation in the frontend analyser and implement responsive camera framing for mobile viewports.

---

## 30-Second Interview Explanation (Memorize This)

> *"In this project, I replaced static chatbot widgets and expensive video stream avatars with a real-time, interactive 3D AI assistant built with Three.js and LiveKit. When a user speaks or clicks a topic, our Python agent—powered by Groq's high-speed LLM, Silero VAD, and neural TTS—understands their intent. If they ask about services or pricing, the agent doesn't just talk; it navigates the site, highlights the specific plan, and has the 3D avatar naturally point towards the card while explaining it with real-time lip-sync. It runs entirely client-side in WebGL with zero video streaming costs and under 500ms voice response latency."*
