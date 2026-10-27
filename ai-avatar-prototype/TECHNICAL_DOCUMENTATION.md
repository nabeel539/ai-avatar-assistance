# Technical Documentation & Interview Preparation Guide
## AI Customer Support Avatar Prototype (Apex Cloud Solutions)

---

## 1. Project Overview

### What the Application Does
This prototype is an **embeddable, real-time AI customer support avatar** for a mock B2B cloud infrastructure company called **Apex Cloud Solutions**. When a visitor visits the website, an interactive conversational video avatar (named "Alex") automatically connects, greets the user, listens to spoken user queries (in English, Hindi, or Hinglish), queries a structured knowledge base, answers conversationally, and simultaneously controls the browser UI (navigating sections, highlighting cards, or escalating to human support).

### Why the Core Technologies Were Chosen

| Technology | Role | Why It Is Used |
| :--- | :--- | :--- |
| **LiveKit Cloud / WebRTC** | Real-time Transport | WebRTC provides ultra-low latency audio/video transport (<300ms round-trip). LiveKit manages SFU infrastructure, agent orchestration, participant state synchronization, and reliable data channels between Python and the browser. |
| **Synthesia Interactive Avatar** | Visual Embodiment | Bridges low-latency neural video generation with LiveKit. It joins the LiveKit room as an egress/ingress participant and generates real-time photorealistic lip-sync video driven directly by the agent's TTS audio output. |
| **Groq (`openai/gpt-oss-120b`)** | Reasoning & Orchestration | Groq's LPU (Language Processing Unit) architecture delivers ultra-fast time-to-first-token (~100–150ms). Combined with a large 120B parameter model, it provides both rapid conversational responsiveness and precise function calling. |
| **Silero VAD** | Voice Activity Detection | Runs locally in Python on CPU with negligible latency (<15ms). It detects speech onset and pauses to demarcate user turns without sending continuous silence to the STT model. |
| **Cartesia / Whisper STT** | Speech-to-Text | Converts streaming microphone audio into text. LiveKit Cloud hosted Cartesia Ink-2 / Whisper provides fast acoustic transcription across accents and multilingual phonetic patterns. |
| **Cartesia / OpenAI TTS** | Text-to-Speech | Synthesizes streaming audio chunks from LLM text tokens, streaming directly into the LiveKit audio track and Synthesia lip-sync pipeline before the entire sentence has finished generating. |

---

## 2. Complete Architecture

### ASCII Architecture Diagram

```
+----------------------------------------------------------------------------------------------------+
|                                          CLIENT BROWSER                                            |
|                                                                                                    |
|  [ index.html / style.css ]                   [ site.js (LiveKit Web SDK Bridge) ]                 |
|  - Hero, Services, Plans, FAQ                 - Auto-connects to LiveKit Room                      |
|  - Floating Avatar Widget                     - Publishes Local Microphone Track                   |
|  - <video id="avatar-video">                  - Attaches Remote Avatar Video & Audio Tracks        |
|  - Strict window.SITE allowlists              - Listens on Data Channel (topic: "ui")              |
+------------------------------^----------------------------------|----------------------------------+
                               |                                  |
               HTTPS (Static)  |          WebSockets / WebRTC     |  1. GET /token (HTTP)
                               |          Tracks & Data Packets   |  2. Token & Room Credentials
                               v                                  v
+-----------------------------------------------------------------+----------------------------------+
|               AIOHTTP BACKEND SERVER (server.py - Port 8080)                                      |
|                                                                                                    |
|  - Serves static assets (HTML/CSS/JS)                                                              |
|  - Generates scoped LiveKit JWT AccessToken (TTL: 15 min, room-scoped)                              |
|  - Injects RoomAgentDispatch(agent_name="avatar-support-agent") & sync_streams=True                 |
+----------------------------------------------------------------------------------------------------+
                                               |
                                               | LiveKit Cloud Signaling & SFU
                                               v
+====================================================================================================+
|                                    LIVEKIT CLOUD WEBRTC SFU                                        |
|                                                                                                    |
|  - Manages Room: "apex-support-<uuid>"                                                             |
|  - Dispatches registered worker: "avatar-support-agent"                                            |
|  - Routes Mic Audio from Browser -> Agent                                                          |
|  - Routes Avatar Video & Synced Audio from Synthesia -> Browser                                    |
|  - Delivers Data Channel Messages (topic: "ui") Agent -> Browser                                   |
+====================================================================================================+
           |                                                      ^                       ^
           | Audio Stream (Browser Mic)                           | Lip-Sync Video &      | Ingests Agent
           v                                                      | Audio Tracks          | TTS Audio
+----------------------------------------------------+    +-------------------------------+----------+
|       PYTHON AGENT WORKER (agent.py - Port 8081)    |    |   SYNTHESIA AVATAR CLOUD (AvatarSession) |
|                                                    |    |                                          |
|  1. Silero VAD (Speech boundary detection)         |    |  - Joins LiveKit Room as participant     |
|  2. STT (Cartesia Ink-2 / Whisper-1)               |    |  - Configured with SYNTHESIA_AVATAR_ID   |
|  3. LLM (Groq openai/gpt-oss-120b)                 |    |  - Synthesizes real-time photorealistic  |
|     - Strict Apex Guardrails (EN/HI/Hinglish)      |    |    head movement & lip synchronization   |
|     - Function Calling Engine                      |    |    driven directly by Agent TTS audio.   |
|  4. Knowledge Retrieval (knowledge.json)           |    +------------------------------------------+
|     - Keyword scoring across products & services   |
|  5. UI Dispatcher                                  |
|     - room.local_participant.publish_data(topic="ui")
|  6. TTS (Cartesia Sonic-3.6 / OpenAI Alloy)        |
|     - Streams audio to Synthesia session           |
+----------------------------------------------------+
```

### Major Components and Responsibilities

1. **`server.py` (HTTP & Token Service)**:
   - Hosts static web assets on `http://127.0.0.1:8080`.
   - Protects credentials; generates ephemeral LiveKit JWTs with strict `VideoGrants` (cannot create rooms or modify other sessions).
   - Injects `RoomAgentDispatch` ensuring LiveKit automatically spins up the agent upon client connection.
2. **`agent.py` (LiveKit Voice & Avatar Worker)**:
   - Registers as worker `avatar-support-agent` with LiveKit Cloud.
   - Manages the multimodal pipeline: `VAD -> STT -> LLM -> Tools -> TTS`.
   - Starts and manages `synthesia.AvatarSession`.
   - Enforces company guardrails and issues data messages over `topic="ui"`.
3. **`knowledge.json` (Structured Knowledge Base)**:
   - Static, deterministic repository of company profile, tier specifications, enterprise services, pricing, and human support contacts.
4. **`site.js` & `index.html` (Frontend Controller & Presentation)**:
   - Renders the ElevenLabs-style editorial design.
   - Embeds the LiveKit JavaScript SDK, connects to the room, publishes mic, renders incoming avatar tracks into `<video>`.
   - Validates incoming UI commands against hardcoded allowlists before touching the DOM.

---

## 3. Complete End-to-End Flow

```
User Action / Event                      System Pipeline Step
---------------------------------------------------------------------------------------------------
1. User loads website              --->  Browser fires DOMContentLoaded / window load.
2. Token Acquisition               --->  site.js calls GET /token on server.py.
3. LiveKit Dispatch                --->  server.py creates JWT with RoomAgentDispatch; returns URL & token.
4. WebRTC Connection               --->  site.js runs room.connect(url, token) and enables microphone.
5. Worker Room Join                --->  LiveKit Cloud matches dispatch and invokes entrypoint(ctx) in agent.py.
6. Synthesia Join                  --->  agent.py initializes synthesia.AvatarSession and joins room.
7. Agent Welcome Greeting          --->  agent.py calls session.generate_reply(); Synthesia speaks greeting.
8. User Speaks Query               --->  Microphone streams audio packets over WebRTC to LiveKit SFU.
9. Voice Activity Detection (VAD)  --->  Silero detects speech chunk boundaries.
10. Speech-to-Text (STT)           --->  Audio frames transcribed to text tokens in real time.
11. Reasoning & Tool Call (LLM)    --->  Groq LLM assesses prompt, applies guardrails, invokes tool if needed.
12. Knowledge Scoring              --->  Tool executes simple_search_knowledge() on knowledge.json.
13. Browser UI Dispatch            --->  Agent publishes JSON on WebRTC data channel (topic: 'ui').
14. DOM Execution                  --->  site.js parses JSON, checks allowlists, triggers smooth scroll/highlight.
15. Text-to-Speech (TTS)           --->  TTS converts answer text into audio frames.
16. Video Lip-Sync Rendering       --->  Synthesia receives TTS audio, generates matching facial frames.
17. Browser Playback               --->  Browser receives video/audio track and plays synced output in widget.
```

### Detailed Breakdown

1. **User Opens Website**: `index.html` loads along with styles and `site.js`. `site.js` registers a delayed auto-connect timer (`setTimeout(startSession, 500)`).
2. **`/token` Endpoint Execution**:
   - `server.py` reads `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`.
   - Creates a unique room name (`apex-support-<hex>`) and user identity (`customer-<hex>`).
   - Configures `RoomConfiguration(sync_streams=True, agents=[api.RoomAgentDispatch(agent_name="avatar-support-agent")])`.
   - Generates a signed JWT with 15-minute TTL.
3. **Session Creation & Agent Dispatch**:
   - The browser connects to the LiveKit Cloud SFU using the JWT.
   - The LiveKit SFU inspects the token's room configuration and issues a job reservation to the pool of registered workers with name `avatar-support-agent`.
   - The agent process (`agent.py`) receives the job and fires `entrypoint(ctx)`.
4. **Audio Ingress & Pipeline**:
   - The browser captures user mic input via `room.localParticipant.setMicrophoneEnabled(true)` and sends Opus audio frames over WebRTC.
   - In `agent.py`, the Silero VAD monitors audio chunks. When speech stops, the accumulated audio frames are sent to STT (`cartesia/ink-2` or `whisper-1`).
   - Transcribed text is appended to the conversation context and fed to the LLM (`openai/gpt-oss-120b` on Groq).
5. **Tool Execution & Knowledge Retrieval**:
   - If the user asks for plans, services, or navigation, the LLM produces a function call (`search_products`, `navigate_to`, etc.).
   - The agent executes the local Python method, queries `knowledge.json`, and returns string data back to the LLM.
   - Any UI mutation is immediately dispatched via `room.local_participant.publish_data(payload, topic="ui")`.
6. **Avatar Lip-Sync & Video Delivery**:
   - The LLM streams the natural language response into TTS (`cartesia/sonic-3.6` or `openai/alloy`).
   - Synthesia's backend consumes the synthesized TTS audio stream, computes visual phonemes, generates lip-sync video frames, and publishes them as a WebRTC video track to the LiveKit room.
   - The browser's `RoomEvent.TrackSubscribed` event catches the track and attaches it to `<video id="avatar-video">`.
   - Because `sync_streams=True` was specified in the room configuration, LiveKit forces strict time-alignment between avatar video and audio packets.
7. **Browser UI Action Execution**:
   - The browser receives the data packet on topic `"ui"`.
   - `site.js` decodes the payload, validates the action and parameters against hardcoded allowlists, and triggers `target.scrollIntoView()` and CSS pulse animations.

---

## 4. LiveKit Integration

### Key Concepts

- **LiveKit Room**: A real-time WebRTC communication context containing multiple participants (the human user, the Python support agent, and the Synthesia avatar worker).
- **Participant & Identity**:
  - Browser Client: `customer-<uuid>` (Human participant, publishes microphone).
  - Python Agent: `avatar-support-agent` (Worker participant, orchestrates pipeline and sends UI data).
  - Synthesia Avatar: `synthesia-avatar-...` (Service participant, publishes lip-synced video and voice tracks).
- **Access Token & VideoGrants**:
  - Tokens are signed using HMAC-SHA256 with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`.
  - `api.VideoGrants(room_join=True, room=room_name)` restricts the browser participant strictly to that individual room.
- **Agent Dispatch**:
  - Rather than requiring a separate webhook server or explicit manual join request, LiveKit Cloud provides `RoomAgentDispatch`.
  - When the room is created with `agents=[api.RoomAgentDispatch(agent_name="avatar-support-agent")]`, the LiveKit server automatically finds an idle worker process advertising that name and assigns the room job to it.
- **WebRTC Data Messages / Topics**:
  - LiveKit allows publishing low-latency data packets (`publish_data`).
  - By using `topic="ui"`, UI control messages are isolated from transcription or state messages.

### Why LiveKit is Used in this Architecture
1. **Low-Latency SFU (Selective Forwarding Unit)**: Standard HTTP or WebSockets cannot stream synchronized 1080p/720p 30fps video alongside bidirectional audio under 300ms.
2. **Native Avatar Plugin Integration**: LiveKit provides the official `livekit-plugins-synthesia` bridge, eliminating custom WebRTC peer-connection negotiation code.
3. **Turn-Handling & Preemption Built-in**: LiveKit's `AgentSession` abstracts VAD interruption detection, STT/TTS streaming, and conversation history management.

---

## 5. Synthesia Integration

### Configuration & Credentials
- `SYNTHESIA_API_KEY`: Authenticates API requests to Synthesia's cloud.
- `SYNTHESIA_AVATAR_ID`: UUID representing the chosen avatar persona (e.g. `b6db8e17-6f6f-41c1-b624-d5cf2dbe8593`).

### Avatar Lifecycle & Critical Sequencing
In `agent.py`:
```python
avatar = synthesia.AvatarSession(
    synthesia.AvatarConfig(avatar_ids=[avatar_id]),
    join_timeout=45.0,
)
# 1. Avatar MUST be started BEFORE session.start()
await avatar.start(session, room=ctx.room)

# 2. Start agent session
await session.start(agent=agent, room=ctx.room)
```

> **CRITICAL ARCHITECTURAL REQUIREMENT**: `avatar.start(session, room)` must be invoked **before** `session.start(agent, room)`. This ensures that when the agent begins generating its first audio frames (e.g. the initial greeting), the avatar's audio/video ingestion hooks are already active in the pipeline.

### Connection Architecture
```
[Agent TTS] ---> (Audio Frames) ---> [Synthesia AvatarSession]
                                            |
                                            v (HTTPS / WebRTC Cloud Stream)
                                     [Synthesia Cloud Neural Engine]
                                            |
                                            v (Lip-synced Video Track)
[Browser <video>] <--- (WebRTC Video Track) <--- [LiveKit Room SFU]
```

### What Synthesia Handles vs. What Our Application Handles

| Feature | Handled By Synthesia | Handled By Our Application |
| :--- | :--- | :--- |
| **Video Generation** | Neural rendering of facial expressions, blinking, head motion, and lip synchronization. | None (only renders incoming WebRTC stream into HTML `<video>`). |
| **Speech Generation** | None (Synthesia is visual-only for interactive avatar; it accepts our agent's audio). | Cartesia / OpenAI TTS generates the spoken voice audio frames. |
| **Logic & Tool Calling** | None. | Python agent runs LLM, VAD, STT, tools, and UI triggers. |
| **Knowledge Base** | None. | Stored in `knowledge.json` and searched via local Python code. |

---

## 6. AI Agent Flow

### System Prompt Design (`agent.py`)
The system prompt establishes:
1. **Persona**: "Alex, an AI customer support specialist for Apex Cloud Solutions."
2. **Spoken Format Constraints**: 1 to 3 concise, conversational sentences. No markdown, asterisks, bullet points, or raw URLs (which would sound awkward when spoken by TTS).
3. **Strict Guardrails**: Disallow all off-topic topics (trivia, recipes, general coding, weather, competitors). Refusal templates provided for English, Hindi, and Hinglish.
4. **Multilingual Mirroring**: Detect user's language and respond in the exact same language (English, Hindi, or Hinglish).
5. **Tool Usage Rules**: Instructs LLM to proactively invoke tools when referring to sections or plans.

### Conversation State & Turn Handling
- Managed inside `AgentSession`.
- `turn_handling={"turn_detection": "stt", "preemptive_generation": {"enabled": False}}`. Preemptive generation is disabled because tools mutate UI state; speculative execution of tools before the user finishes speaking could cause spurious UI scrolling.

### Decision Making: Answering vs. Tool Calling
1. If the user asks a conversational question ("Who are you?"): LLM answers directly from system prompt context.
2. If the user asks for factual product/service details ("What does the Pro plan include?"): LLM generates a tool call to `search_products(query="pro plan")`.
3. If the user asks to see something on the page ("Show me pricing"): LLM calls `navigate_to(section="pricing")`.
4. If the user asks an off-topic question ("How do I bake bread?"): System guardrails trigger an immediate refusal in the matching language without invoking tools.

---

## 7. Knowledge Retrieval

### How `knowledge.json` is Searched
Instead of an external vector database or heavy embedding pipeline, the prototype implements transparent token-based keyword scoring in `simple_search_knowledge(query)`:

1. **Tokenization**:
   ```python
   query_tokens = set(re.findall(r"\w+", query.lower()))
   ```
2. **Field Extraction & Scoring**:
   - For each entity (service, FAQ, product), concatenate `name`, `description`, `features/benefits`, and manual `keywords` into a lowercase string.
   - Count matches: `sum(1 for token in query_tokens if token in searchable_text)`.
3. **Ranking & Slicing**:
   - Entities with match score > 0 are sorted in descending order.
   - Top 2 matching items per category are returned.

### Concrete Example Query Flow

**Query**: `"Refund kitne din mein milega?"` (Hinglish: "In how many days will I get a refund?")

1. `query_tokens` = `{'refund', 'kitne', 'din', 'mein', 'milega'}`.
2. Search loops over `faqs`:
   - FAQ `refund-policy`:
     - Text includes: `keywords: ["refund", "return", "money-back", "cancel", "guarantee", "paise wapas", "refund policy"]`.
     - Matches `'refund'` (score = 1).
   - FAQ `deployment-time`:
     - Text includes: `keywords: ["kitna time", "time"]`.
     - Score = 0.
3. Scoring returns `refund-policy` (`id: "refund-policy"`, answer: "We offer a 30-day money-back guarantee...").
4. The tool returns this answer string to the LLM.
5. The LLM translates and speaks the answer in Hinglish: *"Hamare sabhi plans par 30-day money-back guarantee hai, agar aap satisfied nahi hain toh full refund mil jayega."*

---

## 8. Agent Tools

Every tool is decorated with `@function_tool` on `SupportAgent`:

### 1. `navigate_to(section: str)`
- **Purpose**: Smoothly scroll the browser to a designated section and highlight the entire section (including all services or plan cards within it) while the topic is being explained.
- **Input**: `section: str` (e.g. `"services"`, `"products"`, `"pricing"`, `"faq"`, `"contact"`).
- **Validation**:
  ```python
  clean_section = section.strip().lower()
  if clean_section not in ALLOWED_SECTIONS:
      return f"Invalid section '{section}'."
  ```
- **Internal Action**: Sends `{"action": "navigate_to", "section": clean_section}` over LiveKit data channel (`topic="ui"`).
- **Browser Effect**: Calls `target.scrollIntoView({ behavior: 'smooth', block: 'start' })` and applies `.section-active-highlight`, keeping the whole section and all its cards luminous and elevated until the topic concludes.

### 2. `highlight_element(element_id: str)`
- **Purpose**: Draw user attention to a specific card or item with a sustained glowing focus.
- **Input**: `element_id: str` (e.g. `"starter-plan"`, `"pro-plan"`, `"enterprise-plan"`, `"cloud-migration"`, `"contact-card"`).
- **Validation**: Validated against `ALLOWED_ELEMENTS`.
- **Internal Action**: Sends `{"action": "highlight_element", "element_id": clean_id}` over `topic="ui"`.
- **Browser Effect**: Triggers CSS class `.target-highlighted` and scrolls element into view, sustaining the highlight while that card is discussed.

### 3. `search_services(query: str)`
- **Purpose**: Retrieve details on enterprise services (cloud migration, DevOps pipelines, SOC-2 audits, disaster recovery) and navigate to the Services section.
- **Input**: Free-text inquiry string.
- **Validation**: Handled via internal token extraction.
- **Internal Action**: Automatically calls `navigate_to("services")` so the entire services section is highlighted, and queries `simple_search_knowledge()` for matching services in `knowledge.json`.
- **Browser Effect**: Highlights all service cards on screen and returns text summaries to LLM for conversational synthesis.

### 4. `search_products(query: str)`
- **Purpose**: Retrieve accurate product specifications, compute resources, and pricing.
- **Input**: Product inquiry string (e.g. `"pro business"`, `"starter"`).
- **Validation**: Handled via internal token extraction.
- **Internal Action**: Queries `simple_search_knowledge()` for matching products in `knowledge.json`.
- **Browser Effect**: None directly; feeds factual pricing into LLM context.

### 5. `escalate_to_human()`
- **Purpose**: Handle customer requests for human assistance.
- **Input**: None.
- **Internal Action**: Reads support email and phone from `KNOWLEDGE["support"]`, issues dual UI dispatches (`navigate_to("contact")` and `highlight_element("contact-card")`).
- **Browser Effect**: Scrolls user to human escalation card and pulses it.

---

## 9. Frontend ↔ Agent Communication

### Wire Protocol
Messages travel across the WebRTC Data Channel opened by LiveKit.

```
+----------------------------------------------------------------+
|                         PYTHON AGENT                           |
|                                                                |
|  payload = json.dumps({"action": "navigate_to", "section": "pricing"})
|  await self.room.local_participant.publish_data(               |
|      payload, topic="ui"                                       |
|  )                                                             |
+-------------------------------|--------------------------------+
                                |
                                | WebRTC Data Packet (topic="ui")
                                v
+----------------------------------------------------------------+
|                       BROWSER CLIENT                           |
|                                                                |
|  room.on(RoomEvent.DataReceived, (payload, participant,        |
|                                   kind, topic) => {            |
|    if (topic !== 'ui') return;                                 |
|    const { action, ...args } = JSON.parse(decode(payload));    |
|    window.SITE[action](args);                                  |
|  });                                                           |
+----------------------------------------------------------------+
```

### Example JSON Payloads

**Navigate Section:**
```json
{
  "action": "navigate_to",
  "section": "pricing"
}
```

**Highlight Card:**
```json
{
  "action": "highlight_element",
  "element_id": "pro-plan"
}
```

---

## 10. Security

### 1. Server-Side Secret Isolation
- LiveKit API Secret, Synthesia API Key, and Groq API Key are stored in `.env` and loaded **only** on the backend.
- The browser client **never** receives or has access to these keys.

### 2. Ephemeral Scoped Tokens
- Browser clients call `GET /token` and receive an ephemeral LiveKit JWT.
- The token is restricted to a single generated room (`apex-support-<hex>`) and has a strict 15-minute expiration (`with_ttl(timedelta(minutes=15))`).
- It has no admin permissions (`room_create=False`, `room_admin=False`).

### 3. Dual-Layer Allowlisting Against Arbitrary DOM/JS Execution
A common vulnerability in LLM-driven web agents is **Prompt Injection leading to XSS** (e.g. a user tricks the LLM into calling `eval()` or injecting arbitrary CSS/HTML).

This prototype implements strict defense-in-depth:
- **Layer 1 (Python Agent)**: Every tool validates the argument against `ALLOWED_SECTIONS` and `ALLOWED_ELEMENTS`. If invalid, the agent aborts and does not broadcast a data message.
- **Layer 2 (Browser Controller `site.js`)**:
  - The browser validates incoming actions against `ALLOWED_SECTIONS` and `ALLOWED_ELEMENTS` Sets.
  - No `eval()`, no `innerHTML`, and no dynamic element query selectors are allowed.
  - Only predefined methods on `window.SITE` can be called.

---

## 11. Hindi / English / Hinglish Implementation

### How Language Detection and Mirroring Work
1. **Acoustic Transcription**: The STT model (`cartesia/ink-2` or Whisper) transcribes Devanagari or Romanized Indic phonetic sounds.
2. **Prompt-Guided Mirroring**: The LLM system prompt defines explicit instructions:
   - *English query* -> Respond in natural English.
   - *Hindi query* (Devanagari or Roman script) -> Respond in clear, polite Hindi.
   - *Hinglish query* (e.g., *"Refund kitne din mein milega?"*) -> Respond in conversational Hinglish.
3. **Keyword Matching in `knowledge.json`**:
   - `knowledge.json` includes Hinglish keywords: `["paise wapas", "chota plan", "kitna time", "madad"]`.

### Real Limitations Present in the Implementation
- **Cartesia TTS Phonetics**: While Cartesia TTS handles English exceptionally well, complex pure Hindi (formal Devanagari vocabulary) can sound slightly accented or anglicized compared to a native Hindi TTS model (such as ElevenLabs Multilingual v2 or Google Cloud Neural2).
- **Phonetic STT Ambiguity**: In pure Hinglish, words with identical Roman spellings but different meanings can occasionally be misinterpreted by English-tuned acoustic models.

---

## 12. Error Handling

| Failure Scenario | How the Implementation Handles It |
| :--- | :--- |
| **Missing API Keys in `.env`** | `server.py` checks variables on `/token` and returns HTTP 500 JSON with an explicit descriptive error. `site.js` displays a clean red banner in the widget rather than crashing. |
| **Synthesia Unavailable / Invalid Avatar ID** | In `agent.py`, `avatar.start()` is wrapped in `try...except synthesia.SynthesiaError`. If Synthesia fails, the error is logged and the agent **gracefully falls back to voice-only mode**, allowing the session to continue. |
| **LLM Rate Limit / 404 Model Error** | `agent.py` automatically checks for Groq vs. OpenAI keys, falling back to LiveKit Cloud hosted inference (`inference.LLM`, `inference.STT`, `inference.TTS`) if external providers are unavailable. |
| **Browser Autoplay Audio Policy** | Modern browsers block unprompted audio until user interaction. `site.js` binds a global `click` listener to call `room.startAudio()`, immediately unmuting the avatar upon any user click. |
| **Malformed Data Messages** | `site.js` wraps `JSON.parse()` in a `try...catch` block. Unknown actions or corrupted payloads are rejected with console warnings without impacting the video call. |

---

## 13. File-by-File Code Map

```
ai-avatar-prototype/
├── .env                  # Private API keys (LiveKit, Synthesia, Groq)
├── server.py             # HTTP server & LiveKit JWT token generator (aiohttp)
├── agent.py              # LiveKit Agent worker with Synthesia, Groq LLM, & tools
├── knowledge.json        # Structured knowledge base for Apex Cloud Solutions
├── index.html            # Web page with ElevenLabs-style layout & avatar widget
├── site.js               # Frontend LiveKit SDK integration & DOM action adapter
├── style.css             # Vanilla CSS design system (warm monochrome aesthetic)
├── test_prototype.py     # Automated unit test suite (13 test cases)
└── README.md             # Quickstart & architectural documentation
```

### Key Responsibilities & Code Connections

- **[`server.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/server.py)**:
  - Imports `livekit.api`. Connects to LiveKit Cloud.
  - Shares `AGENT_NAME = "avatar-support-agent"` with `agent.py`.
- **[`agent.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/agent.py)**:
  - Imports `livekit.agents`, `livekit.plugins.synthesia`, `livekit.plugins.openai`, `livekit.plugins.silero`.
  - Reads `knowledge.json` on startup.
  - Uses `SupportAgent(Agent)` with `@function_tool` methods.
- **[`knowledge.json`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/knowledge.json)**:
  - Loaded by `load_knowledge_base()` in `agent.py`. Contains products, services, FAQs, and support contacts.
- **[`index.html`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/index.html)**:
  - Contains semantic sections `#hero`, `#services`, `#products`, `#pricing`, `#faq`, `#contact` matching `ALLOWED_SECTIONS`.
  - Contains elements `#starter-plan`, `#pro-plan`, `#enterprise-plan`, `#contact-card` matching `ALLOWED_ELEMENTS`.
  - Embeds `<video id="avatar-video">`.
- **[`site.js`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/site.js)**:
  - Exposes `window.SITE` methods matching agent tool actions.
  - Connects to LiveKit room using token from `server.py`.
- **[`style.css`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/style.css)**:
  - Implements editorial aesthetic: warm near-black ink `#0c0a09`, off-white canvas `#f5f5f5`, EB Garamond and Inter typography.
  - Avatar widget styled with `aspect-ratio: 16 / 9` and `object-fit: contain` to prevent video cropping.
- **[`test_prototype.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/test_prototype.py)**:
  - Unit tests verifying knowledge loading, multilingual search scoring, allowlists, and server routing.

---

## 14. One Complete Example Trace

**User Query**: *"Show me the Pro Cloud plan."*

```
Step 1: Audio Capture & Ingress
- User speaks into microphone.
- Browser captures Opus audio frames via WebRTC and sends them to LiveKit Cloud SFU.
- LiveKit forwards audio frames to agent.py worker.

Step 2: Voice Activity Detection (VAD)
- Silero VAD analyzes audio in 30ms chunks.
- When user finishes saying "...plan", Silero detects silence and fires speech_end event.

Step 3: Speech-to-Text (STT)
- Audio buffer is sent to Cartesia Ink-2 / Whisper STT.
- STT outputs text transcript: "Show me the Pro Cloud plan."

Step 4: LLM Reasoning & Function Calling
- Text transcript enters Groq LLM (openai/gpt-oss-120b) with conversation history.
- LLM recognizes intent to inspect the Pro plan.
- LLM executes two parallel actions:
  1. Calls tool: highlight_element(element_id="pro-plan")
  2. Calls tool: navigate_to(section="products")
  3. Prepares conversational spoken answer based on knowledge base.

Step 5: Browser Action Dispatch
- agent.py executes highlight_element("pro-plan").
- Checks "pro-plan" in ALLOWED_ELEMENTS (Valid).
- Agent calls self.room.local_participant.publish_data(
    payload='{"action": "highlight_element", "element_id": "pro-plan"}',
    topic="ui"
  ).
- Browser receives data packet on topic "ui".
- site.js verifies "pro-plan" in ALLOWED_ELEMENTS Set.
- Browser executes:
  document.getElementById("pro-plan").classList.add("target-highlighted");
  document.getElementById("pro-plan").scrollIntoView({ behavior: 'smooth', block: 'center' });

Step 6: Text-to-Speech (TTS)
- LLM outputs text: "Here is our Pro Business plan. It features 8 vCPU, 16 gigabytes of RAM, auto-scaling compute, and 24/7 priority support for ninety-nine dollars per month."
- TTS (Cartesia Sonic-3.6) synthesizes audio stream.

Step 7: Synthesia Avatar Lip-Sync
- TTS audio frames are piped into Synthesia AvatarSession.
- Synthesia Cloud renders 30fps video stream with synchronized lip phonemes.
- WebRTC video track is delivered to LiveKit room.

Step 8: Browser Playback
- Browser <video id="avatar-video"> receives synced video & audio.
- The avatar speaks the response while the Pro Business card pulses on the screen.
```

---

## 15. 20 Interview Follow-Up Questions & Model Answers

### Architecture

#### Q1: Why use an SFU (LiveKit) instead of direct Peer-to-Peer (P2P) WebRTC?
- **What is tested**: Understanding of WebRTC scaling and multimodal media routing.
- **Model Answer**: "In pure P2P (mesh), every participant must stream their media directly to every other participant. With 3 participants (user browser, Python agent, and Synthesia avatar), each node would have to encode and upload multiple streams, consuming excessive client bandwidth. An SFU (Selective Forwarding Unit) like LiveKit acts as an intelligent media switch: each participant sends their stream once, and LiveKit selectively routes audio and video tracks with minimal CPU overhead and centralized synchronization."

#### Q2: What is the benefit of keeping the HTTP server (`server.py`) and agent worker (`agent.py`) separate?
- **What is tested**: Separation of concerns and cloud deployment patterns.
- **Model Answer**: "Stateless HTTP servers (like `server.py`) need to scale horizontally based on web traffic and token requests, often deployed on lightweight serverless containers. In contrast, voice agent workers (`agent.py`) are long-running stateful daemon processes that maintain persistent WebRTC connections, VAD models, and audio pipelines for the duration of a session. Decoupling them allows independent autoscaling and prevents web spikes from starving agent CPU."

---

### LiveKit

#### Q3: What does `sync_streams=True` do in the LiveKit room configuration?
- **What is tested**: Media synchronization in avatar streaming.
- **Model Answer**: "In WebRTC, audio and video packets can travel through different network buffers, often causing audio to lead video. `sync_streams=True` tells the LiveKit SFU and client SDK to enforce tight RTP timestamp synchronization across the avatar's separate audio and video tracks, preventing the lip-sync from drifting out of phase in the browser."

#### Q4: How does LiveKit Agent Dispatch work under the hood?
- **What is tested**: LiveKit Cloud worker orchestration.
- **Model Answer**: "When the agent worker starts up, it registers with the LiveKit server using a worker name (`avatar-support-agent`). When the backend issues an access token with `RoomAgentDispatch(agent_name="avatar-support-agent")`, LiveKit detects room creation and assigns the room job to an available registered worker in that pool, invoking the worker's `entrypoint` function without requiring custom polling or webhooks."

---

### Synthesia

#### Q5: Why is `await avatar.start(session, room)` called before `await session.start(agent, room)`?
- **What is tested**: SDK lifecycle constraints and pipeline initialization order.
- **Model Answer**: "`avatar.start()` attaches the Synthesia session listener to the `AgentSession`'s internal audio output pipeline. If `session.start()` were called first, the agent might immediately generate audio frames (such as the initial greeting) before Synthesia has finished negotiating its WebRTC connection and audio hooks, resulting in a dropped greeting or a frozen avatar."

#### Q6: What happens if Synthesia experiences an outage or an invalid avatar ID is supplied?
- **What is tested**: Fault tolerance and graceful degradation.
- **Model Answer**: "The call to `avatar.start()` is wrapped in a `try...except synthesia.SynthesiaError` block. If Synthesia fails, the error is caught, and the agent logs the failure but continues executing `session.start()`. The agent degrades gracefully to voice-only customer support, ensuring the user can still talk to the AI without the application crashing."

---

### LLM & Agents

#### Q7: Why use Groq instead of standard OpenAI API endpoints for this voice agent?
- **What is tested**: Voice conversational latency factors.
- **Model Answer**: "For interactive voice conversations, latency is critical. Humans perceive delays greater than 500ms as unnatural pauses. Groq's custom LPU hardware delivers time-to-first-token in ~100–150ms for large models (`openai/gpt-oss-120b`), cutting conversational response latency in half compared to conventional cloud GPU inference."

#### Q8: Why is preemptive generation disabled (`"preemptive_generation": {"enabled": False}`) in this agent?
- **What is tested**: Understanding speculative execution trade-offs with side effects.
- **Model Answer**: "Preemptive generation predicts what the user might say and begins speculative LLM token generation before the user finishes speaking. However, because our agent has tool calling capabilities that trigger real-world side effects (such as scrolling and highlighting UI elements), speculative generation could fire unintended UI animations if the user pauses or changes their thought mid-sentence."

---

### RAG & Knowledge Retrieval

#### Q9: Why did you use token-based keyword search rather than a vector database (e.g. Pinecone/Chroma)?
- **What is tested**: Pragmatic engineering decisions vs. over-engineering.
- **Model Answer**: "For a targeted customer support demo with tens or hundreds of structured FAQs, services, and product tiers, a vector database adds network round-trips, infrastructure costs, and embedding latency (~100ms). In-memory keyword and keyword-array scoring runs in under 1 millisecond, requires zero external dependencies, is completely deterministic, and avoids vector embedding drift for exact product names."

#### Q10: How would you scale this retrieval system if the knowledge base grew to 50,000 enterprise documents?
- **What is tested**: Knowledge of enterprise RAG architectures.
- **Model Answer**: "I would migrate to a hybrid search architecture: BM25/keyword indexing for exact part numbers and pricing, combined with dense vector embeddings (e.g., using `text-embedding-3-small`) stored in an indexed vector store (such as Qdrant or pgvector). I would also add a cross-encoder reranker to pick the top 3 chunks to stay within voice latency budgets."

---

### Frontend & Browser Communication

#### Q11: Why send UI actions over a LiveKit Data Channel instead of WebSockets or HTTP SSE?
- **What is tested**: Transport layer optimization in real-time apps.
- **Model Answer**: "The browser already has an active WebRTC peer connection with LiveKit for audio and video. Reusing LiveKit's WebRTC data channel (`publish_data` with `topic="ui"`) avoids opening a second TCP connection, bypasses HTTP connection overhead, guarantees zero port conflicts, and delivers sub-50ms message latency directly synchronized with the media session."

#### Q12: How does the frontend handle browser autoplay policies for audio?
- **What is tested**: Web audio API constraints in modern browsers.
- **Model Answer**: "Modern browsers block automatic audio playback without prior user interaction. `site.js` addresses this by binding a window-level click listener that calls `room.startAudio()`. If the browser blocked the initial auto-connected avatar audio, the very first user click anywhere on the page unblocks and resumes WebRTC audio output seamlessly."

---

### Security

#### Q13: How does the architecture protect against Prompt Injection leading to Cross-Site Scripting (XSS)?
- **What is tested**: LLM security and defense-in-depth on the web.
- **Model Answer**: "We implement dual-layer allowlisting. On the Python side, tool functions validate arguments against strict whitelist sets (`ALLOWED_SECTIONS`, `ALLOWED_ELEMENTS`). On the frontend, `site.js` validates every incoming message before executing predefined actions on `window.SITE`. The browser never uses `eval()`, `innerHTML`, or raw selector queries; it only invokes predefined functions on approved element IDs."

#### Q14: Why is generating tokens on the client side unsafe, and how is it solved here?
- **What is tested**: Token generation security.
- **Model Answer**: "Generating tokens on the client requires embedding the `LIVEKIT_API_SECRET` in the browser bundle, exposing it to any visitor who opens DevTools. In our implementation, `server.py` creates short-lived, cryptographically signed JWTs server-side, granting only `room_join` permission for a single room with a 15-minute TTL."

---

### Scalability

#### Q15: If 1,000 customers open the website simultaneously, where is the primary bottleneck?
- **What is tested**: System capacity analysis.
- **Model Answer**: "The bottleneck would be the concurrent session limits on Synthesia Cloud and LiveKit SFU bandwidth. While `server.py` can easily serve tokens and static files to thousands of users, each interactive avatar session requires a dedicated WebRTC video egress stream and GPU rendering slot on Synthesia. In production, we would implement concurrency pooling, a queue mechanism, or fall back to voice-only mode once avatar capacity is reached."

#### Q16: How do LiveKit agent workers scale horizontally across multiple instances?
- **What is tested**: Distributed worker systems.
- **Model Answer**: "LiveKit workers are designed to scale horizontally across multiple VMs or Kubernetes pods. Each worker connects to the central LiveKit Cloud SFU and registers under `avatar-support-agent`. When a new room requests an agent dispatch, LiveKit's scheduler dispatches the job to the worker instance with the lowest active load."

---

### Production Improvements

#### Q17: What observability and metrics would you add before deploying to production?
- **What is tested**: Production readiness and telemetry.
- **Model Answer**: "I would add OpenTelemetry tracing across the pipeline to measure key milestones: VAD silence detection time, STT latency, LLM Time-to-First-Token (TTFT), tool execution duration, TTS generation time, and WebRTC round-trip time. I would also log user turn transcripts and guardrail trigger rates to Prometheus and Grafana."

#### Q18: How would you improve language detection for rapid mid-sentence code-switching?
- **What is tested**: Advanced multilingual voice UX.
- **Model Answer**: "Currently, language detection relies on the LLM interpreting the STT transcript. For faster and more reliable code-switching between Hindi and English, I would deploy a dedicated lightweight language identification model (like FastText LID) on the STT output, and configure TTS to dynamically swap voice models or phoneme sets based on the detected language tag."

#### Q19: How can we reduce latency even further in this architecture?
- **What is tested**: Low-latency voice optimization techniques.
- **Model Answer**: "1) Switch to streaming STT rather than turn-based batch STT, passing partial transcripts to the LLM. 2) Enable sentence chunking in TTS, sending the first clause to Synthesia as soon as the first punctuation mark appears. 3) Deploy agent workers in edge regions geographically close to the user's LiveKit SFU node (e.g. AWS Mumbai region for Indian users)."

#### Q20: What automated testing strategy would you implement in CI/CD for this system?
- **What is tested**: Quality assurance and testing pipelines for voice/AI agents.
- **Model Answer**: "We already have unit tests verifying knowledge base parsing, multilingual keyword scoring, allowlists, and HTTP routing (`test_prototype.py`). For CI/CD, I would add: 1) Mocked audio stream integration tests that feed pre-recorded WAV files into the agent and assert expected tool calls, 2) Guardrail evaluation datasets (golden sets of off-topic prompts) to verify zero tolerance for jailbreaks, and 3) Playwright E2E browser tests with fake media streams to verify DOM scroll and highlight behavior."
