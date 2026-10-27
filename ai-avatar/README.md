# Apex Cloud Solutions: Embeddable AI Customer-Support Avatar Prototype

A functional, interview-ready prototype of an AI-powered customer support avatar embedded into a modern cloud services website. The avatar speaks with customers in **English, Hindi, or Hinglish**, answers product and policy questions using a transparent, editable knowledge base (`knowledge.json`), and interacts directly with the website by scrolling to sections and highlighting elements.

![AI Customer Support Avatar Live Interface](../assets/demo-interface.png)

---

## Architecture Diagram & Flow

```
                      +---------------------------------------+
                      |             User Browser              |
                      |  • Microphone audio input             |
                      |  • Synthesia Avatar video playback    |
                      |  • Website DOM (Navigation/Highlight) |
                      +-------------------+-------------------+
                                          ^
                     WebRTC Audio/Video   | LiveKit Data Channel (topic="ui")
                                          v
                      +---------------------------------------+
                      |          LiveKit Cloud Room           |
                      +-------------------+-------------------+
                                          |
                      +-------------------+-------------------+
                      |      Python Agent (agent.py)          |
                      |                                       |
                      |  1. Silero VAD (Speech detection)     |
                      |  2. OpenAI Whisper (STT)              |
                      |  3. OpenAI gpt-4o-mini (LLM)          |
                      |     ├── Language Detection            |
                      |     ├── simple_search_knowledge()     |
                      |     └── Function Tools:               |
                      |         • navigate_to                 |
                      |         • highlight_element           |
                      |         • search_services             |
                      |         • escalate_to_human           |
                      |  4. OpenAI TTS (Audio generation)     |
                      |  5. Synthesia AvatarSession           |
                      |     (Hosted video rendering worker)   |
                      +-------------------+-------------------+
                                          |
                                    knowledge.json
```

### End-to-End Request Flow:
1. **Customer Speaks**: Browser captures microphone audio and streams it into the LiveKit Room.
2. **VAD & STT**: Silero VAD identifies speech boundaries, and OpenAI Whisper converts voice to text.
3. **LLM & Language Mirroring**: `gpt-4o-mini` detects whether the query is in English, Hindi, or Hinglish and mirrors that language.
4. **Knowledge Retrieval / Tool Calling**:
   - The agent consults `knowledge.json` via transparent keyword scoring (`simple_search_knowledge`) to avoid hallucination.
   - If UI actions are called (`navigate_to` or `highlight_element`), the agent publishes a structured JSON payload to LiveKit's data channel (`topic="ui"`).
5. **Browser Execution**: `site.js` receives the data payload, validates the target against a strict allowlist, and executes smooth scrolling or CSS pulse animations.
6. **Avatar Video & Audio**: Synthesia's hosted worker lip-syncs the avatar video to the agent's speech and streams synchronized video back to the browser's `<video>` element.

---

## File Structure & Responsibilities

| File | Responsibility |
|---|---|
| [`agent.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/agent.py) | LiveKit agent worker: voice pipeline (VAD/STT/LLM/TTS), Synthesia avatar lifecycle, keyword retrieval search, and UI tools. |
| [`server.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/server.py) | Lightweight `aiohttp` server: serves the website frontend and mints scoped LiveKit room tokens (`/token`). |
| [`index.html`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/index.html) | Fictional SaaS marketing page (Apex Cloud Solutions) with an embedded floating avatar widget and prompt chips. |
| [`site.js`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/site.js) | Frontend adapter: handles LiveKit WebRTC client, status UI, and securely executes validated UI actions. |
| [`style.css`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/style.css) | Modern, responsive dark-mode styling, glassmorphism widget, status indicators, and `@keyframes pulse-highlight`. |
| [`knowledge.json`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/knowledge.json) | Central customer-support knowledge base (company details, FAQs, product tiers, and human support contacts). |
| [`test_prototype.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/test_prototype.py) | Automated test suite verifying knowledge parsing, search across EN/HI/Hinglish, allowlists, and server routes. |
| [`.env.example`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/.env.example) | Configuration template documenting all required environment variables and where to obtain them. |
| [`requirements.txt`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/requirements.txt) | Verified, pinned Python dependencies. |

---

## Prerequisites & Account Setup

To run the live conversational avatar, you need accounts and credentials from three services:

1. **LiveKit Cloud** (Free Tier):
   - Create an account at [https://cloud.livekit.io](https://cloud.livekit.io).
   - Create a project and obtain `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` under **Project Settings → Keys**.
2. **Synthesia Developer Workspace**:
   - Requires a Synthesia workspace with **Interactive Avatars enabled** ([Synthesia Developer Portal](https://docs.synthesia.io/reference/synthesia-api-quickstart)).
   - Obtain your `SYNTHESIA_API_KEY`.
   - Obtain a valid `SYNTHESIA_AVATAR_ID` from your workspace's available avatar gallery.
3. **OpenAI Platform**:
   - Obtain an `OPENAI_API_KEY` with access to `whisper-1`, `gpt-4o-mini`, and TTS.

---

## Installation & Setup

### 1. Create Environment & Install Dependencies
Open a terminal in `ai-avatar-prototype`:

```bash
# Using uv (fastest)
uv venv
.\.venv\Scripts\activate      # On Windows (or source .venv/bin/activate on Linux/macOS)
uv pip install -r requirements.txt

# Or using standard pip
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy the template and fill in your keys:

```bash
cp .env.example .env
```

Edit `.env`:
```env
LIVEKIT_URL=wss://<your-project>.livekit.cloud
LIVEKIT_API_KEY=your_key
LIVEKIT_API_SECRET=your_secret
SYNTHESIA_API_KEY=your_synthesia_key
SYNTHESIA_AVATAR_ID=your_gallery_avatar_id
OPENAI_API_KEY=your_openai_key
```

---

## Running the Prototype

You will run two terminal processes:

### Terminal 1: Run the LiveKit Agent Worker
```bash
.\.venv\Scripts\activate
python agent.py dev
```
*(Note: Use `dev` mode. Do not use terminal `console` mode, as the avatar video will not appear in local console mock rooms).*

### Terminal 2: Run the Web Server
```bash
.\.venv\Scripts\activate
python server.py
```

### Open the Demo Website
Open your browser to:
👉 **[http://localhost:8080](http://localhost:8080)**

1. The avatar automatically connects on load (or toggle via the minimalist **"Start"** / **"Stop"** button in the bottom-right frame).
2. Grant microphone permissions when prompted by your browser.
3. Speak with Alex!

---

## Testing & Verification

Run the offline automated test suite:
```bash
.\.venv\Scripts\python test_prototype.py
```
This tests:
- `knowledge.json` JSON integrity and schema conformance.
- Keyword retrieval for English, Hindi, and Hinglish queries.
- Tool allowlist validation and rejection of unapproved selectors.
- Web server initialization and route configuration.

---

## Multilingual Support & Provider Verification

### Supported Modes:
- **English**: *"What is your return policy?"* → Responds in English and scrolls to FAQ.
- **Hindi**: *"आपकी रिफंड पॉलिसी क्या है?"* → Responds in natural Hindi.
- **Hinglish**: *"Refund kitne din mein milega?"* → Responds in natural Hinglish.
- **Explicit Switching**: *"Explain this in Hindi"* or *"English mein batao"*.

### STT & TTS Capabilities & Current Limitations:
- **STT (OpenAI Whisper)**: Fully supports multilingual audio transcription including English and Hindi with high accuracy.
- **LLM (gpt-4o-mini)**: Highly fluent in understanding and generating English, Hindi (Devanagari), and conversational Hinglish.
- **TTS (OpenAI `tts-1` / `alloy`)**:
  - *Verified*: Generates English speech with native cadence and natural inflection.
  - *Limitation*: When synthesizing Hindi or Hinglish text, OpenAI's default voices use an Americanized phoneme set. While intelligible, it lacks native Indian accents. For production-grade native Hindi speech, dedicated multilingual TTS engines (such as Cartesia Indian English/Hindi models or ElevenLabs Multilingual v2) can be swapped in without changing any avatar code.

---

## Security Model

The prototype enforces strict security boundaries between the model and the DOM:
1. **No Client-Side Secrets**: `SYNTHESIA_API_KEY`, `LIVEKIT_API_SECRET`, and `OPENAI_API_KEY` reside exclusively on the backend.
2. **Short-Lived Room Tokens**: The browser receives a scoped LiveKit JWT valid for only 15 minutes, restricted to a single generated room.
3. **Strict UI Action Allowlists**:
   - Allowed Sections: `hero`, `products`, `pricing`, `faq`, `contact`.
   - Allowed Element IDs: `starter-plan`, `pro-plan`, `enterprise-plan`, `contact-card`, `refund-faq`.
   - The frontend drops any unapproved action, preventing the LLM from executing arbitrary JavaScript, DOM selectors, or HTML injection.

---

## Code Review Guide (Where to Inspect)

For interview code evaluation, review these files in order:

1. **Session & Token Generation**:
   - [`server.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/server.py#L20-L40): Look at `token_handler()` where unique room IDs and `RoomAgentDispatch` are configured.
2. **Synthesia Avatar Lifecycle & Startup Order**:
   - [`agent.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/agent.py#L190-L225): Look at `entrypoint()` to verify `await avatar.start(session, room=ctx.room)` occurs **before** `await session.start(...)`.
3. **Knowledge Retrieval Engine**:
   - [`agent.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/agent.py#L60-L90): Inspect `simple_search_knowledge()` for the transparent scoring function.
4. **Tool Definitions**:
   - [`agent.py`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/agent.py#L125-L180): Inspect `@function_tool` methods (`navigate_to`, `highlight_element`, `search_products`, `escalate_to_human`).
5. **Browser Handling & Action Validation**:
   - [`site.js`](file:///c:/Users/yusat/Desktop/AI%20Projects/ai-avatar/ai-avatar-prototype/site.js#L10-L70): Review the `SITE` adapter and `ALLOWED_SECTIONS` / `ALLOWED_ELEMENTS` security sets.
