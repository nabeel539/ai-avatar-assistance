/**
 * Apex Cloud Solutions - Frontend Site Controller & LiveKit Bridge
 *
 * Responsibilities:
 * 1. Loosely coupled DOM interaction (SITE adapter with strict validation and temporary highlights).
 * 2. LiveKit WebRTC client management for real-time 3D interactive avatar.
 * 3. Bridges audio track and agent states to window.avatar3d without duplicate playback.
 * 4. Security: Validates every action against strict allowlists before DOM execution.
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

let highlightClearTimeout = null;

function scheduleHighlightClear(delayMs = 6000) {
  if (highlightClearTimeout) {
    clearTimeout(highlightClearTimeout);
  }
  highlightClearTimeout = setTimeout(() => {
    document.querySelectorAll('.section-active-highlight').forEach((el) => {
      el.classList.remove('section-active-highlight');
    });
    document.querySelectorAll('.target-highlighted').forEach((el) => {
      el.classList.remove('target-highlighted');
    });
  }, delayMs);
}

function clearAllHighlightsImmediate() {
  if (highlightClearTimeout) {
    clearTimeout(highlightClearTimeout);
    highlightClearTimeout = null;
  }
  document.querySelectorAll('.section-active-highlight').forEach((el) => {
    el.classList.remove('section-active-highlight');
  });
  document.querySelectorAll('.target-highlighted').forEach((el) => {
    el.classList.remove('target-highlighted');
  });
}

window.SITE = {
  scheduleHighlightClear,
  clearAllHighlightsImmediate,

  /**
   * Scroll smoothly to an approved page section and temporarily highlight the entire section.
   * @param {Object} args - Payload containing { section }
   */
  navigate_to({ section } = {}) {
    if (!section || !ALLOWED_SECTIONS.has(section)) {
      console.warn(`[SITE Security] Rejected unapproved navigation target: ${section}`);
      return;
    }
    clearAllHighlightsImmediate();

    const target = document.getElementById(section);
    if (target) {
      target.classList.add('section-active-highlight');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      console.log(`[SITE] Scrolled to and temporarily highlighted section: #${section}`);
      scheduleHighlightClear(12000);

      // Trigger avatar hand pointing towards the referenced section
      if (window.avatar3d && typeof window.avatar3d.pointToContent === 'function') {
        window.avatar3d.pointToContent(3.8);
      }
    }
  },

  /**
   * Highlight an approved card or element temporarily while explaining.
   * @param {Object} args - Payload containing { element_id }
   */
  highlight_element({ element_id } = {}) {
    if (!element_id || !ALLOWED_ELEMENTS.has(element_id)) {
      console.warn(`[SITE Security] Rejected unapproved element ID: ${element_id}`);
      return;
    }
    clearAllHighlightsImmediate();

    const target = document.getElementById(element_id);
    if (target) {
      target.classList.add('target-highlighted');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      console.log(`[SITE] Temporarily highlighted element: #${element_id}`);
      scheduleHighlightClear(12000);

      // Trigger avatar hand pointing towards the referenced element
      if (window.avatar3d && typeof window.avatar3d.pointToContent === 'function') {
        window.avatar3d.pointToContent(3.8);
      }
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
   * Submit a chip prompt question directly to Alex for an immediate spoken answer.
   */
  suggestPrompt(promptText) {
    this.openAvatarWidget();
    console.log(`[SITE Prompt] User clicked chip: "${promptText}". Requesting answer from Alex...`);

    const stateLabel = document.getElementById('agent-state-label');
    if (stateLabel && (!window.currentLiveKitRoom || window.currentLiveKitRoom.state !== 'connected')) {
      stateLabel.textContent = 'CONNECTING...';
    }

    if (window.sendUserPrompt) {
      window.sendUserPrompt(promptText);
    }
  }
};


// ------------------------------------------------------------------------------
// 2. LiveKit Client & 3D Avatar Session Bridge
// ------------------------------------------------------------------------------

(function initAvatarBridge() {
  const canvasElem = document.getElementById('avatar-canvas');
  const audioElem = document.getElementById('agent-audio');
  const videoPlaceholder = document.getElementById('video-placeholder');
  const sessionBtn = document.getElementById('btn-session-toggle');
  const statusDot = document.getElementById('connection-status-dot');
  const stateLabel = document.getElementById('agent-state-label');
  const micIndicator = document.getElementById('mic-indicator');
  const errorBanner = document.getElementById('widget-error');

  let room = null;
  window.currentLiveKitRoom = null;

  // Listen for 3D Avatar ready event
  window.addEventListener('avatar3d:ready', () => {
    if (videoPlaceholder) {
      videoPlaceholder.classList.add('hidden');
    }
    console.log('[LiveKit Bridge] 3D Avatar is ready.');
  });

  // Clicking avatar preview triggers explanatory gesture to content
  if (canvasElem) {
    canvasElem.style.cursor = 'pointer';
    canvasElem.title = 'Click avatar to preview content gesture';
    canvasElem.addEventListener('click', () => {
      if (window.avatar3d && typeof window.avatar3d.pointToContent === 'function') {
        window.avatar3d.pointToContent(4.0);
      }
    });
  }

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
      if (window.avatar3d) window.avatar3d.setAgentState('listening');
    } else if (state === 'connecting') {
      if (statusDot) statusDot.className = 'status-marker';
      if (stateLabel) stateLabel.textContent = 'CONNECTING';
    } else {
      if (statusDot) statusDot.className = 'status-marker';
      if (stateLabel) stateLabel.textContent = 'READY';
      if (window.avatar3d) window.avatar3d.setAgentState('idle');
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

  let queuedPrompt = null;

  // Send a prompt to the AI agent over LiveKit data channel
  window.sendUserPrompt = async function(promptText) {
    if (!promptText) return;

    // Unblock browser Web Audio context on user gesture
    if (room && typeof room.startAudio === 'function') {
      room.startAudio().catch(() => {});
    }
    if (window.avatar3d && typeof window.avatar3d.resumeAudio === 'function') {
      window.avatar3d.resumeAudio();
    }

    if (!room || room.state !== 'connected') {
      console.log(`[LiveKit Prompt] Connecting session to answer: "${promptText}"`);
      queuedPrompt = promptText;
      await startSession(promptText);
      return;
    }

    try {
      const payload = new TextEncoder().encode(JSON.stringify({ text: promptText }));
      await room.localParticipant.publishData(payload, { reliable: true, topic: 'user_prompt' });
      console.log(`[LiveKit Prompt] Published user prompt to Alex: "${promptText}"`);
      if (stateLabel) stateLabel.textContent = 'THINKING...';
    } catch (err) {
      console.error('[LiveKit Prompt] Failed to send user prompt:', err);
    }
  };

  async function startSession(initialPrompt = null) {
    if (initialPrompt) queuedPrompt = initialPrompt;
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
        adaptiveStream: false,
        dynacast: true,
      });
      window.currentLiveKitRoom = room;

      // 4. Attach remote avatar audio track (guarded against duplicate/local audio)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind === 'audio' && participant && !participant.isLocal) {
          console.log(`[LiveKit] Subscribed to remote audio track from ${participant.identity}.`);

          // Playback via the single dedicated audio tag
          if (audioElem) {
            if (audioElem.srcObject) {
              audioElem.srcObject = null;
            }
            track.attach(audioElem);
          }

          // Feed same MediaStreamTrack into Avatar3D Web Audio analyser
          if (window.avatar3d && window.avatar3d.attachAudioTrack) {
            window.avatar3d.attachAudioTrack(track.mediaStreamTrack);
          } else {
            window.addEventListener('avatar3d:ready', () => {
              if (window.avatar3d && window.avatar3d.attachAudioTrack) {
                window.avatar3d.attachAudioTrack(track.mediaStreamTrack);
              }
            }, { once: true });
          }

          if (videoPlaceholder) {
            videoPlaceholder.classList.add('hidden');
          }
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

          // Relay state to 3D avatar animation controller
          if (window.avatar3d) {
            window.avatar3d.setAgentState(state);
          }

          // When speech finishes, clear highlights after a short grace period
          if (state !== 'speaking') {
            scheduleHighlightClear(4500);
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

      // 7. Local mic activity indicator & 3D avatar listening pose
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const isLocalSpeaking = speakers.some((s) => s.isLocal);
        if (micIndicator) micIndicator.classList.toggle('on', isLocalSpeaking);
        if (window.avatar3d) {
          window.avatar3d.setUserSpeaking(isLocalSpeaking);
        }
      });

      // 8. Handle disconnection
      room.on(RoomEvent.Disconnected, () => {
        console.log('[LiveKit] Room disconnected.');
        endSession();
      });

      // 9. Connect to LiveKit Cloud Room and enable user microphone
      await room.connect(url, token);
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
      } catch (micErr) {
        console.warn('[LiveKit] Microphone optional or permission withheld:', micErr);
      }

      updateStatus('connected', 'Connected');

      // If user clicked a prompt chip to start, send it immediately
      if (queuedPrompt) {
        const text = queuedPrompt;
        queuedPrompt = null;
        setTimeout(async () => {
          try {
            const payload = new TextEncoder().encode(JSON.stringify({ text }));
            await room.localParticipant.publishData(payload, { reliable: true, topic: 'user_prompt' });
            console.log(`[LiveKit Prompt] Auto-sent initial prompt: "${text}"`);
            if (stateLabel) stateLabel.textContent = 'THINKING...';
          } catch (e) {
            console.warn('[LiveKit Prompt] Error sending initial prompt:', e);
          }
        }, 1200);
      }

    } catch (err) {
      console.error('[LiveKit Error]', err);
      showError(err.message || 'Failed to connect to 3D avatar.');
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

    if (audioElem) {
      audioElem.srcObject = null;
    }
    if (micIndicator) {
      micIndicator.classList.remove('on');
    }

    if (window.avatar3d) {
      window.avatar3d.setAgentState('idle');
      window.avatar3d.setUserSpeaking(false);
    }

    clearAllHighlightsImmediate();
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
    if (window.avatar3d && typeof window.avatar3d.resumeAudio === 'function') {
      window.avatar3d.resumeAudio();
    }
  });

  // Clean up WebRTC session when page or tab closes
  window.addEventListener('beforeunload', () => {
    if (room) {
      try {
        room.disconnect();
      } catch (e) {}
    }
  });

  // Automatically connect and load avatar when website loads
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => {
      if (!room || room.state === 'disconnected') {
        startSession();
      }
    }, 500);
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      setTimeout(() => {
        if (!room || room.state === 'disconnected') {
          startSession();
        }
      }, 500);
    });
  }
})();
