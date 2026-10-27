/**
 * Apex Cloud Solutions - Frontend Site Controller & LiveKit Bridge
 *
 * Responsibilities:
 * 1. Loosely coupled DOM interaction (SITE adapter with strict validation).
 * 2. LiveKit WebRTC client management for real-time video/audio avatar.
 * 3. Security: Validates every action against strict allowlists before DOM execution.
 */

// ------------------------------------------------------------------------------
// 1. SITE Adapter (Exposes strictly allowed UI actions)
// ------------------------------------------------------------------------------

const ALLOWED_SECTIONS = new Set(['hero', 'services', 'products', 'pricing', 'faq', 'contact']);
const ALLOWED_ELEMENTS = new Set([
  // Services
  'cloud-migration',
  'devops-pipelines',
  'security-compliance',
  'disaster-recovery',
  // Plans
  'starter-plan',
  'pro-plan',
  'enterprise-plan',
  // Support & FAQ
  'contact-card',
  'refund-faq'
]);

window.SITE = {
  /**
   * Scroll smoothly to an approved page section and highlight the entire section.
   * All cards/items within the section are highlighted together while discussing.
   * @param {Object} args - Payload containing { section }
   */
  navigate_to({ section } = {}) {
    if (!section || !ALLOWED_SECTIONS.has(section)) {
      console.warn(`[SITE Security] Rejected unapproved navigation target: ${section}`);
      return;
    }
    // Clear previous section and card highlights
    document.querySelectorAll('.section-active-highlight').forEach((el) => {
      el.classList.remove('section-active-highlight');
    });
    document.querySelectorAll('.target-highlighted').forEach((el) => {
      el.classList.remove('target-highlighted');
    });

    const target = document.getElementById(section);
    if (target) {
      // Highlight the whole section (all cards within it are highlighted)
      target.classList.add('section-active-highlight');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      console.log(`[SITE] Scrolled to and highlighted entire section: #${section}`);
    }
  },

  /**
   * Highlight an approved card or element and sustain the highlight while discussing.
   * @param {Object} args - Payload containing { element_id }
   */
  highlight_element({ element_id } = {}) {
    if (!element_id || !ALLOWED_ELEMENTS.has(element_id)) {
      console.warn(`[SITE Security] Rejected unapproved element ID: ${element_id}`);
      return;
    }
    // Remove previous single element highlights
    document.querySelectorAll('.target-highlighted').forEach((el) => {
      el.classList.remove('target-highlighted');
    });

    const target = document.getElementById(element_id);
    if (target) {
      target.classList.add('target-highlighted');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log(`[SITE] Sustained highlight on element: #${element_id}`);
    }
  },

  /**
   * Toggle widget minimization state.
   */
  toggleAvatarWidget() {
    const widget = document.getElementById('avatar-widget');
    if (widget) {
      widget.classList.toggle('minimized');
      const btn = document.getElementById('btn-minimize-widget');
      if (btn) btn.textContent = widget.classList.contains('minimized') ? '▢' : '_';
    }
  },

  /**
   * Open the avatar widget if minimized.
   */
  openAvatarWidget() {
    const widget = document.getElementById('avatar-widget');
    if (widget && widget.classList.contains('minimized')) {
      widget.classList.remove('minimized');
      const btn = document.getElementById('btn-minimize-widget');
      if (btn) btn.textContent = '_';
    }
  },

  /**
   * Helper for prompt chip clicks to guide the user.
   */
  suggestPrompt(promptText) {
    this.openAvatarWidget();
    console.log(`[SITE Prompt] User clicked prompt: "${promptText}". Ready to speak to Alex.`);
    const subtitle = document.getElementById('agent-state-label');
    if (subtitle && !window.currentLiveKitRoom) {
      subtitle.textContent = `Click "Call" & ask: "${promptText}"`;
    }
  }
};


// ------------------------------------------------------------------------------
// 2. LiveKit Client & Avatar Session Bridge
// ------------------------------------------------------------------------------

(function initAvatarBridge() {
  const videoElem = document.getElementById('avatar-video');
  const videoPlaceholder = document.getElementById('video-placeholder');
  const sessionBtn = document.getElementById('btn-session-toggle');
  const statusDot = document.getElementById('connection-status-dot');
  const statusText = document.getElementById('connection-status-text');
  const stateLabel = document.getElementById('agent-state-label');
  const micIndicator = document.getElementById('mic-indicator');
  const errorBanner = document.getElementById('widget-error');

  let room = null;
  window.currentLiveKitRoom = null;

  function updateButton(state) {
    if (!sessionBtn) return;
    if (state === 'connecting') {
      sessionBtn.textContent = '...';
      sessionBtn.disabled = true;
    } else if (state === 'connected') {
      sessionBtn.textContent = 'Stop';
      sessionBtn.disabled = false;
      sessionBtn.className = 'btn-minimal-toggle active';
    } else {
      sessionBtn.textContent = 'Start';
      sessionBtn.disabled = false;
      sessionBtn.className = 'btn-minimal-toggle';
    }
  }

  function updateStatus(state, message) {
    if (state === 'connected') {
      if (statusDot) statusDot.className = 'status-marker listening';
      if (stateLabel) stateLabel.textContent = 'LISTENING';
    } else if (state === 'connecting') {
      if (statusDot) statusDot.className = 'status-marker';
      if (stateLabel) stateLabel.textContent = 'CONNECTING';
    } else {
      if (statusDot) statusDot.className = 'status-marker';
      if (stateLabel) stateLabel.textContent = 'READY';
    }
    updateButton(state);
  }

  function showError(msg) {
    if (errorBanner) {
      errorBanner.textContent = msg;
      errorBanner.classList.remove('hidden');
    }
    updateStatus('error', 'Connection Error');
  }

  function clearError() {
    if (errorBanner) {
      errorBanner.textContent = '';
      errorBanner.classList.add('hidden');
    }
  }

  async function startSession() {
    clearError();
    updateStatus('connecting', 'Connecting…');

    try {
      // 1. Check for LiveKit browser client library
      if (!window.LivekitClient) {
        throw new Error('LiveKit Web SDK failed to load. Please check internet connection.');
      }
      const { Room, RoomEvent } = window.LivekitClient;

      // 2. Fetch connection credentials and JWT token from backend
      const response = await fetch('/token');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned ${response.status}: Failed to acquire token.`);
      }
      const { url, token } = await response.json();

      // 3. Instantiate LiveKit room
      room = new Room({
        adaptiveStream: false, // Maintain full resolution for avatar video stream
        dynacast: true,
      });
      window.currentLiveKitRoom = room;

      // 4. Attach remote avatar audio & video tracks
      room.on(RoomEvent.TrackSubscribed, (track) => {
        console.log(`[LiveKit] Subscribed to ${track.kind} track from avatar.`);
        if (track.kind === 'video' || track.kind === 'audio') {
          track.attach(videoElem);
          if (videoPlaceholder) videoPlaceholder.classList.add('hidden');
        }
      });

      // 5. Track agent state (listening, thinking, speaking)
      room.on(RoomEvent.ParticipantAttributesChanged, (attributes, participant) => {
        const state = attributes['lk.agent.state'];
        if (state) {
          console.log(`[LiveKit Agent State] ${state}`);
          if (stateLabel && statusDot) {
            if (state === 'speaking') {
              stateLabel.textContent = 'SPEAKING';
              statusDot.className = 'status-marker speaking';
            } else if (state === 'thinking') {
              stateLabel.textContent = 'THINKING';
              statusDot.className = 'status-marker';
            } else if (state === 'listening') {
              stateLabel.textContent = 'LISTENING';
              statusDot.className = 'status-marker listening';
            } else {
              stateLabel.textContent = state.toUpperCase();
              statusDot.className = 'status-marker';
            }
          }
        }
      });

      // 6. Security-hardened tool action handler
      room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        if (topic !== 'ui') return; // Ignore non-UI topics
        try {
          const rawText = new TextDecoder().decode(payload);
          const data = JSON.parse(rawText);
          const { action, ...args } = data;

          console.log(`[LiveKit UI Dispatch] Received action: ${action}`, args);
          if (typeof window.SITE[action] === 'function') {
            window.SITE[action](args);
          } else {
            console.warn(`[LiveKit UI Dispatch] Unknown action '${action}' rejected.`);
          }
        } catch (err) {
          console.error('[LiveKit UI Dispatch] Malformed data payload received:', err);
        }
      });

      // 7. Local mic activity indicator
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const isLocalSpeaking = speakers.some((s) => s.isLocal);
        if (micIndicator) micIndicator.classList.toggle('on', isLocalSpeaking);
      });

      // 8. Handle disconnection
      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] Room disconnected.');
        endSession();
      });

      // 9. Connect to LiveKit Cloud Room and enable user microphone
      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);

      updateStatus('connected', 'Connected');

    } catch (err) {
      console.error('[LiveKit Error]', err);
      showError(err.message || 'Failed to connect to avatar.');
      endSession();
    }
  }

  function endSession() {
    if (room) {
      try {
        room.disconnect();
      } catch (e) {
        // ignore disconnect errors
      }
      room = null;
      window.currentLiveKitRoom = null;
    }

    if (videoElem) {
      videoElem.srcObject = null;
    }
    if (videoPlaceholder) {
      videoPlaceholder.classList.remove('hidden');
    }
    if (micIndicator) {
      micIndicator.classList.remove('on');
    }

    // Clear all highlighted sections and elements when call ends
    document.querySelectorAll('.section-active-highlight').forEach((el) => {
      el.classList.remove('section-active-highlight');
    });
    document.querySelectorAll('.target-highlighted').forEach((el) => {
      el.classList.remove('target-highlighted');
    });

    updateStatus('disconnected', 'Disconnected');
  }

  // Bind session toggle button
  if (sessionBtn) {
    sessionBtn.onclick = () => {
      if (room) {
        endSession();
      } else {
        startSession();
      }
    };
  }

  // Ensure audio playback if browser autoplay policy requires user interaction
  window.addEventListener('click', () => {
    if (room && typeof room.startAudio === 'function') {
      room.startAudio();
    }
  });

  // Automatically connect and load avatar when website loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(startSession, 500);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(startSession, 500);
    });
  }
})();
