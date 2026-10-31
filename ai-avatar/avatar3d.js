/**
 * 3D Interactive Full-Body Avatar for Apex Cloud Solutions Website Guide
 * Built with Three.js (ES Module) + Ready Player Me GLB + LiveKit Audio Analyser.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

export class Avatar3D {
    constructor(canvasId = 'avatar-canvas') {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error(`[Avatar3D] Canvas #${canvasId} not found.`);
            return;
        }

        this.isReady = false;
        this.currentAgentState = 'idle'; // 'idle' | 'listening' | 'thinking' | 'speaking'
        this.isUserSpeaking = false;
        this.isSpeakingAudio = false;

        // Three.js core components
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mixer = null;
        this.clock = new THREE.Clock();

        // Model, Bones & Morph Targets
        this.avatarGroup = new THREE.Group();
        this.model = null;
        this.modelSize = new THREE.Vector3(0.6, 1.75, 0.4);
        this.modelCenter = new THREE.Vector3(0, 0.88, 0);
        this.morphMeshes = [];
        this.headBone = null;
        this.neckBone = null;
        this.spineBone = null;
        this.rightArmBone = null;
        this.rightForeArmBone = null;
        this.rightHandBone = null;
        this.rightShoulderBone = null;

        // Content pointing state (points out cards/sections for a few seconds)
        this.isPointing = false;
        this.pointingTimer = 0;
        this.pointingDuration = 3.8;
        this.pointingWeight = 0;
        this.targetPointingWeight = 0;

        // Realistic grounding contact shadow
        this.contactShadow = null;

        // Interactive 3D Turntable (Mouse/Touch Drag Rotation)
        this.defaultRotationY = -0.32; // Calibrated presentation stance facing content
        this.targetRotationY = -0.32;
        this.currentRotationY = -0.32;
        this.isDragging = false;
        this.previousPointerX = 0;
        this.dragVelocity = 0;
        this.autoResetTimer = 0;
        this.autoResetDelay = 3.0; // Seconds after release before smoothly easing back

        // Animation actions & speaking motion
        this.actions = {};
        this.currentAction = null;
        // Keep speaking gestures calm, natural, and conversational (avoid dramatic hands-on-hips or wild gesturing)
        this.talkingClips = [
            { name: 'Talking_0', duration: 4.8 }, // Natural, calm conversational speaking
        ];
        this.currentTalkingIndex = 0;
        this.talkingRotationTimer = 0;

        // Blinking state
        this.blinkTimer = 0;
        this.nextBlinkTime = 2.0 + Math.random() * 2.5;
        this.isBlinking = false;
        this.blinkDuration = 0.15;
        this.blinkProgress = 0;

        // Web Audio amplitude analysis
        this.audioContext = null;
        this.analyser = null;
        this.audioData = null;
        this.currentJawOpen = 0;
        this.silenceTimer = 0;

        this.init();
    }

    async init() {
        this.setupScene();
        this.setupLights();
        this.setupEvents();
        await this.loadModels();

        this.isReady = true;
        console.log('[Avatar3D] Ready and initialized with content-facing full-body framing.');
        window.dispatchEvent(new CustomEvent('avatar3d:ready', { detail: { avatar: this } }));

        this.animate();
    }

    setupScene() {
        const width = this.canvas.clientWidth || 240;
        const height = this.canvas.clientHeight || 380;

        this.scene = new THREE.Scene();
        this.scene.background = null; // 100% transparent scene background

        // Use a vertical FOV of 28 degrees for natural, distortion-free perspective
        this.camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 30);
        this.camera.position.set(0, 0.9, 3.8);
        this.camera.lookAt(0, 0.9, 0);

        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            alpha: true, // Transparent canvas
            antialias: true,
            powerPreference: 'high-performance',
        });
        this.renderer.setClearColor(0x000000, 0); // Clear to fully transparent
        this.renderer.setSize(width, height, false);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.scene.add(this.avatarGroup);
    }

    setupLights() {
        // Ambient light for overall illumination of PBR materials
        const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
        this.scene.add(ambientLight);

        // Soft hemisphere light for natural bounce
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444455, 1.1);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);

        // Key light (warm, positioned to illuminate the avatar from front/center with soft volumetric shadow)
        const keyLight = new THREE.DirectionalLight(0xfff7ed, 1.8);
        keyLight.position.set(1.2, 3.2, 2.8);
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.width = 1024;
        keyLight.shadow.mapSize.height = 1024;
        keyLight.shadow.camera.near = 0.5;
        keyLight.shadow.camera.far = 8;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.radius = 2.0;
        this.scene.add(keyLight);

        // Fill light (cool, softer from the left side)
        const fillLight = new THREE.DirectionalLight(0xe0f2fe, 1.2);
        fillLight.position.set(-1.8, 2.0, 2.5);
        this.scene.add(fillLight);
    }

    setupEvents() {
        // Interactive 3D mouse drag rotation
        this.setupInteractionEvents();

        // Resize observer to keep full-body framing sharp inside widget wrapper
        const resizeObserver = new ResizeObserver(() => this.onResize());
        if (this.canvas.parentElement) {
            resizeObserver.observe(this.canvas.parentElement);
        }

        // Pause animation loop when tab is hidden to conserve power and CPU
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.clock.stop();
            } else {
                this.clock.start();
            }
        });
    }

    setupInteractionEvents() {
        if (!this.canvas) return;

        this.canvas.title = 'Click and drag horizontally to rotate 3D avatar';

        const onPointerDown = (e) => {
            this.isDragging = true;
            this.previousPointerX = e.clientX;
            this.dragVelocity = 0;
            this.autoResetTimer = 0;
            if (this.canvas.setPointerCapture) {
                try {
                    this.canvas.setPointerCapture(e.pointerId);
                } catch (_) {}
            }
            this.canvas.classList.add('grabbing');
        };

        const onPointerMove = (e) => {
            if (!this.isDragging) return;
            const deltaX = e.clientX - this.previousPointerX;
            this.previousPointerX = e.clientX;

            // Sensitivity factor: horizontal drag rotates model around vertical Y-axis
            const sensitivity = 0.010;
            this.targetRotationY += deltaX * sensitivity;
            this.dragVelocity = deltaX * sensitivity;
            this.autoResetTimer = 0;
        };

        const onPointerUp = (e) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            if (this.canvas.releasePointerCapture) {
                try {
                    this.canvas.releasePointerCapture(e.pointerId);
                } catch (_) {}
            }
            this.canvas.classList.remove('grabbing');
            // Start countdown to smoothly return to default presentation view
            this.autoResetTimer = this.autoResetDelay;
        };

        this.canvas.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
        window.addEventListener('pointercancel', onPointerUp);
    }

    updateCameraFraming() {
        if (!this.camera || !this.canvas) return;

        const width = this.canvas.clientWidth || 240;
        const height = this.canvas.clientHeight || 380;
        if (width === 0 || height === 0) return;

        const aspect = width / height;
        this.camera.aspect = aspect;
        this.camera.updateProjectionMatrix();

        const modelHeight = this.modelSize.y || 1.75;
        const modelWidth = this.modelSize.x || 0.6;

        // Provide comfortable padding to make avatar slightly smaller and well proportioned
        const padding = 1.30;
        const fovRad = (this.camera.fov * Math.PI) / 180;

        // Distance needed vertically to fit full height
        const distY = (modelHeight * padding) / (2 * Math.tan(fovRad / 2));
        // Distance needed horizontally to fit full width
        const distX = (modelWidth * padding) / (2 * Math.tan(fovRad / 2) * aspect);

        const cameraDist = Math.max(distY, distX);
        // Center camera on the mid-body / chest
        const targetY = modelHeight * 0.50;

        this.camera.position.set(0, targetY, cameraDist);
        this.camera.lookAt(0, targetY, 0);
    }

    onResize() {
        if (!this.canvas || !this.renderer || !this.camera) return;
        const width = this.canvas.clientWidth || 240;
        const height = this.canvas.clientHeight || 380;
        if (width === 0 || height === 0) return;

        this.renderer.setSize(width, height, false);
        this.updateCameraFraming();
    }

    createContactShadow() {
        // High-resolution procedural soft contact shadow texture
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        const cx = 128;
        const cy = 128;

        // Multi-stop radial gradient for realistic contact falloff directly under feet
        const gradient = ctx.createRadialGradient(cx, cy, 14, cx, cy, 120);
        gradient.addColorStop(0, 'rgba(14, 14, 20, 0.72)');   // Dark contact core directly under boots
        gradient.addColorStop(0.28, 'rgba(20, 20, 28, 0.46)'); // Inner contact zone
        gradient.addColorStop(0.60, 'rgba(28, 28, 38, 0.20)'); // Soft ambient occlusion falloff
        gradient.addColorStop(0.88, 'rgba(32, 32, 44, 0.05)'); // Outer penumbra
        gradient.addColorStop(1.0, 'rgba(0, 0, 0, 0.00)');     // Feathered transparent edge

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(cx, cy, 120, 0, Math.PI * 2);
        ctx.fill();

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;

        // Ground ellipse: wider along width (0.84m), slightly narrower in depth (0.46m)
        const geometry = new THREE.PlaneGeometry(0.84, 0.46);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 0.88,
            depthWrite: false,
        });

        const shadowMesh = new THREE.Mesh(geometry, material);
        shadowMesh.rotation.x = -Math.PI / 2; // Lie flat on floor
        shadowMesh.position.set(0, 0.003, 0); // Position at ground level directly under boots
        shadowMesh.renderOrder = 0;

        return shadowMesh;
    }

    async loadModels() {
        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');
        loader.setDRACOLoader(dracoLoader);

        try {
            // Load base Ready Player Me avatar
            const avatarGltf = await loader.loadAsync('/static/models/avatar.glb');
            this.model = avatarGltf.scene;

            // Compute exact bounding box
            const box = new THREE.Box3().setFromObject(this.model);
            box.getSize(this.modelSize);
            box.getCenter(this.modelCenter);
            console.log('[Avatar3D] Model Bounding Box:', { size: this.modelSize, center: this.modelCenter });

            // Plant feet exactly at ground level (y = 0)
            this.model.position.set(0, -box.min.y, 0);

            // Keep model internal rotation at 0; orientation is driven by avatarGroup
            this.model.rotation.y = 0;
            this.avatarGroup.rotation.y = this.currentRotationY;

            // Traverse to collect morph meshes, skeletal bones, and enable shadows
            this.model.traverse((child) => {
                if (child.isSkinnedMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.morphTargetDictionary) {
                        this.morphMeshes.push(child);
                    }
                }
                if (child.isBone) {
                    const name = child.name.toLowerCase();
                    if (name.includes('head') && !this.headBone) this.headBone = child;
                    if (name.includes('neck') && !this.neckBone) this.neckBone = child;
                    if (name.includes('spine') && !this.spineBone) this.spineBone = child;
                    if (child.name === 'RightArm') this.rightArmBone = child;
                    if (child.name === 'RightForeArm') this.rightForeArmBone = child;
                    if (child.name === 'RightHand') this.rightHandBone = child;
                    if (child.name === 'RightShoulder') this.rightShoulderBone = child;
                }
            });

            // Add grounded contact shadow beneath avatar boots for realism
            this.contactShadow = this.createContactShadow();
            this.avatarGroup.add(this.contactShadow);
            this.avatarGroup.add(this.model);
            this.mixer = new THREE.AnimationMixer(this.model);

            // Dynamically fit camera to full body
            this.updateCameraFraming();

            // Load animations pack
            const animGltf = await loader.loadAsync('/static/models/animations.glb');
            animGltf.animations.forEach((clip) => {
                const action = this.mixer.clipAction(clip);
                this.actions[clip.name] = action;
            });

            // Start in Idle state with smooth fade in
            if (this.actions['Idle']) {
                this.currentAction = this.actions['Idle'];
                this.currentAction.fadeIn(0.5).play();
            } else {
                const first = Object.values(this.actions)[0];
                if (first) {
                    this.currentAction = first;
                    this.currentAction.fadeIn(0.5).play();
                }
            }

            console.log('[Avatar3D] Full-body avatar and animations loaded successfully.');
        } catch (err) {
            console.error('[Avatar3D] Failed to load 3D avatar assets:', err);
            throw err;
        }
    }

    // =========================================================================
    // Web Audio Amplitude Analyser for Mouth Movement
    // =========================================================================

    attachAudioTrack(mediaStreamTrack) {
        if (!mediaStreamTrack) return;

        try {
            if (!this.audioContext) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                this.audioContext = new AudioCtx();
            }

            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => {});
            }

            const stream = new MediaStream([mediaStreamTrack]);
            const source = this.audioContext.createMediaStreamSource(stream);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.35;

            // Connect source to analyser ONLY.
            // DO NOT connect to audio output to avoid double playback!
            source.connect(this.analyser);
            this.audioData = new Uint8Array(this.analyser.frequencyBinCount);

            console.log('[Avatar3D] Audio track successfully attached to mouth analyser.');
        } catch (err) {
            console.warn('[Avatar3D] Could not initialize audio analyser:', err);
        }
    }

    resumeAudio() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch((err) => {
                console.warn('[Avatar3D] AudioContext resume error:', err);
            });
        }
    }

    getAudioAmplitude() {
        if (!this.analyser || !this.audioData) return 0;

        this.analyser.getByteTimeDomainData(this.audioData);

        // Compute Root Mean Square (RMS) from time-domain audio samples
        let sumSquares = 0;
        for (let i = 0; i < this.audioData.length; i++) {
            const normalized = (this.audioData[i] - 128) / 128;
            sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / this.audioData.length);
        return rms;
    }

    // =========================================================================
    // State Transitions & Animation Actions
    // =========================================================================

    setAgentState(state) {
        if (this.currentAgentState === state) return;
        console.log(`[Avatar3D] Agent state transition: ${this.currentAgentState} -> ${state}`);
        this.currentAgentState = state;
        this.updateAnimationState();
    }

    setUserSpeaking(speaking) {
        this.isUserSpeaking = !!speaking;
        this.updateAnimationState();
    }

    updateAnimationState() {
        // Priority order:
        // 1. Agent Speaking (when agent state is 'speaking' or active TTS audio detected)
        // 2. User Speaking / Listening (when user speaks or agent is 'listening')
        // 3. Thinking (when agent state is 'thinking')
        // 4. Idle (default)

        if (this.currentAgentState === 'speaking' || this.isSpeakingAudio) {
            this.playTalkingAnimation();
        } else if (this.isUserSpeaking || this.currentAgentState === 'listening') {
            this.playIdleAnimation('listening');
        } else if (this.currentAgentState === 'thinking') {
            this.playIdleAnimation('thinking');
        } else {
            this.playIdleAnimation('idle');
        }
    }

    playTalkingAnimation(forceStart = false) {
        if (forceStart) {
            this.currentTalkingIndex = 0;
            this.talkingRotationTimer = 0;
        }
        const clipInfo = this.talkingClips[this.currentTalkingIndex];
        const clipName = typeof clipInfo === 'object' ? clipInfo.name : clipInfo;
        const nextAction = this.actions[clipName] || this.actions['Talking_0'];

        if (nextAction && this.currentAction !== nextAction) {
            // Smooth, natural crossfade between gesture animations (0.75s)
            this.crossFadeToAction(nextAction, 0.75);
        }
    }

    playIdleAnimation(subState = 'idle') {
        const idleAction = this.actions['Idle'];
        if (idleAction && this.currentAction !== idleAction) {
            // Relax arms smoothly back to idle (0.80s)
            this.crossFadeToAction(idleAction, 0.80);
        }
        // Reset talking sequence index so next speech begins with natural conversational opening
        this.currentTalkingIndex = 0;
        this.talkingRotationTimer = 0;
    }

    crossFadeToAction(newAction, duration = 0.5) {
        if (!newAction || newAction === this.currentAction) return;

        newAction.reset();
        newAction.setEffectiveTimeScale(1);
        newAction.setEffectiveWeight(1);
        newAction.fadeIn(duration);
        newAction.play();

        if (this.currentAction) {
            this.currentAction.fadeOut(duration);
        }

        this.currentAction = newAction;
    }

    // =========================================================================
    // Pointing Gesture towards Referenced Content (Sections, Products, Cards)
    // =========================================================================

    pointToContent(durationSec = 3.5) {
        console.log(`[Avatar3D] Indicating referenced content for ${durationSec}s`);
        this.isPointing = true;
        this.pointingDuration = durationSec;
        this.pointingTimer = durationSec;
        this.targetPointingWeight = 1.0;

        // Smoothly glide avatar back to default presentation stance so pointing gesture aligns with content
        this.targetRotationY = this.defaultRotationY;
        this.autoResetTimer = 0;
    }

    updatePointingGesture(delta) {
        if (!this.isPointing && this.pointingWeight <= 0.001) return;

        if (this.pointingTimer > 0) {
            this.pointingTimer -= delta;
            this.targetPointingWeight = 1.0;
        } else {
            this.targetPointingWeight = 0.0;
            if (this.pointingWeight <= 0.005) {
                this.isPointing = false;
                this.pointingWeight = 0;
                return;
            }
        }

        // Smooth ease-in and ease-out: gentle, natural presenter gesture
        const lerpSpeed = this.targetPointingWeight > this.pointingWeight ? 2.4 : 1.6;
        this.pointingWeight = THREE.MathUtils.lerp(this.pointingWeight, this.targetPointingWeight, delta * lerpSpeed);

        if (this.pointingWeight <= 0.001) return;

        // Apply natural presenter gesture to right arm/forearm/hand towards content (left)
        // Calibrated against Mixamo skeleton rest pose to preserve shoulder joint integrity
        if (this.rightArmBone) {
            // Smoothly raises arm forward-left toward the content without popping the shoulder joint
            const targetArmEuler = new THREE.Euler(0.50, 0.05, -0.28, 'XYZ');
            const targetArmQuat = new THREE.Quaternion().setFromEuler(targetArmEuler);
            this.rightArmBone.quaternion.slerp(targetArmQuat, this.pointingWeight);
        }

        if (this.rightForeArmBone) {
            // Relaxed natural elbow bend pointing towards content (avoids hyperextended/stiff arm)
            const targetForeArmEuler = new THREE.Euler(0.02, 0.05, -0.42, 'XYZ');
            const targetForeArmQuat = new THREE.Quaternion().setFromEuler(targetForeArmEuler);
            this.rightForeArmBone.quaternion.slerp(targetForeArmQuat, this.pointingWeight);
        }

        if (this.rightHandBone) {
            // Open presenter hand with palm gently angled towards the content
            const targetHandEuler = new THREE.Euler(-0.15, 0.20, -0.05, 'XYZ');
            const targetHandQuat = new THREE.Quaternion().setFromEuler(targetHandEuler);
            this.rightHandBone.quaternion.slerp(targetHandQuat, this.pointingWeight);
        }

        if (this.headBone) {
            // Natural glance toward the content while explaining
            this.headBone.rotation.y = THREE.MathUtils.lerp(this.headBone.rotation.y, -0.16, this.pointingWeight * 0.4);
        }
    }

    // =========================================================================
    // Interactive 3D Turntable Rotation (Drag, Inertia & Smart Auto-Return)
    // =========================================================================

    updateRotation(delta) {
        if (!this.avatarGroup) return;

        if (this.isDragging) {
            // Actively track cursor drag with responsive smoothing
            this.currentRotationY = THREE.MathUtils.lerp(this.currentRotationY, this.targetRotationY, 0.40);
        } else {
            // Apply natural inertial deceleration
            if (Math.abs(this.dragVelocity) > 0.0001) {
                this.targetRotationY += this.dragVelocity;
                this.dragVelocity *= 0.88; // decay
            }

            // Auto-return timer countdown
            if (this.autoResetTimer > 0) {
                this.autoResetTimer -= delta;
            } else {
                // Smoothly ease back to default presentation stance facing content
                this.targetRotationY = THREE.MathUtils.lerp(this.targetRotationY, this.defaultRotationY, delta * 1.8);
            }

            this.currentRotationY = THREE.MathUtils.lerp(this.currentRotationY, this.targetRotationY, delta * 7.0);
        }

        // Apply rotation to avatar group (character + contact shadow turn synchronously)
        this.avatarGroup.rotation.y = this.currentRotationY;
    }

    // =========================================================================
    // Procedural Morphs: Jaw Lip-sync, Blinking, Warm Professional Expression
    // =========================================================================

    lerpMorphTarget(targetName, value, speed = 0.1) {
        for (let i = 0; i < this.morphMeshes.length; i++) {
            const mesh = this.morphMeshes[i];
            const dict = mesh.morphTargetDictionary;
            const influences = mesh.morphTargetInfluences;
            if (dict && dict[targetName] !== undefined && influences) {
                const index = dict[targetName];
                influences[index] = THREE.MathUtils.lerp(influences[index] || 0, value, speed);
            }
        }
    }

    setMorphValue(targetName, value) {
        for (let i = 0; i < this.morphMeshes.length; i++) {
            const mesh = this.morphMeshes[i];
            const dict = mesh.morphTargetDictionary;
            const influences = mesh.morphTargetInfluences;
            if (dict && dict[targetName] !== undefined && influences) {
                influences[dict[targetName]] = value;
            }
        }
    }

    updateMouthAnimation(delta) {
        const rms = this.getAudioAmplitude();
        const NOISE_GATE = 0.025;

        let targetJaw = 0;

        if (rms > NOISE_GATE) {
            // Active speech audio detected
            targetJaw = Math.min(0.75, (rms - NOISE_GATE) * 4.2);
            this.silenceTimer = 0;
            if (!this.isSpeakingAudio) {
                this.isSpeakingAudio = true;
                this.updateAnimationState();
            }
        } else {
            // Silence
            this.silenceTimer += delta;
            // After 400ms of continuous silence, return to non-speaking
            if (this.silenceTimer > 0.40) {
                if (this.isSpeakingAudio) {
                    this.isSpeakingAudio = false;
                    this.updateAnimationState();
                }
            }
        }

        // Smooth attack and release
        const lerpFactor = targetJaw > this.currentJawOpen ? 0.28 : 0.16;
        this.currentJawOpen += (targetJaw - this.currentJawOpen) * lerpFactor;

        // Apply jawOpen morph target to Head & Teeth
        this.setMorphValue('jawOpen', this.currentJawOpen);

        // Subtle secondary vowels for natural speech
        if (this.currentJawOpen > 0.1) {
            this.setMorphValue('viseme_aa', this.currentJawOpen * 0.4);
            this.setMorphValue('viseme_O', this.currentJawOpen * 0.25);
        } else {
            this.setMorphValue('viseme_aa', 0);
            this.setMorphValue('viseme_O', 0);
        }
    }

    updateBlinking(delta) {
        this.blinkTimer += delta;

        if (!this.isBlinking && this.blinkTimer >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkProgress = 0;
            this.blinkTimer = 0;
            this.nextBlinkTime = 1.8 + Math.random() * 3.2;
        }

        if (this.isBlinking) {
            this.blinkProgress += delta;
            const halfDuration = this.blinkDuration / 2;
            let blinkWeight = 0;

            if (this.blinkProgress <= halfDuration) {
                blinkWeight = this.blinkProgress / halfDuration;
            } else if (this.blinkProgress <= this.blinkDuration) {
                blinkWeight = 1 - (this.blinkProgress - halfDuration) / halfDuration;
            } else {
                this.isBlinking = false;
                blinkWeight = 0;
            }

            this.setMorphValue('eyeBlinkLeft', blinkWeight);
            this.setMorphValue('eyeBlinkRight', blinkWeight);
        }
    }

    updateFacialExpressions() {
        // Professional consultant facial expressions based on reference blendshapes
        const isSpeaking = this.currentAgentState === 'speaking' || this.isSpeakingAudio;
        const isListening = this.currentAgentState === 'listening' || this.isUserSpeaking;
        const isThinking = this.currentAgentState === 'thinking';

        let targetSmile = 0.08;
        let targetSquint = 0;
        let targetBrow = 0.05;
        let targetDimple = 0;
        let targetNoseSneer = 0;
        let targetPress = 0;

        if (isSpeaking) {
            // Warm, engaged consultant smile & engaged eyes
            targetSmile = 0.34;
            targetSquint = 0.24;
            targetBrow = 0.17;
            targetDimple = 0.18;
            targetNoseSneer = 0.08;
        } else if (isListening) {
            // Attentive, listening expression
            targetSmile = 0.16;
            targetSquint = 0.08;
            targetBrow = 0.22;
        } else if (isThinking) {
            // Thoughtful, processing expression
            targetSmile = 0.04;
            targetBrow = 0.25;
            targetSquint = 0.14;
            targetPress = 0.18;
        }

        this.lerpMorphTarget('mouthSmileLeft', targetSmile, 0.08);
        this.lerpMorphTarget('mouthSmileRight', targetSmile, 0.08);
        this.lerpMorphTarget('eyeSquintLeft', targetSquint, 0.08);
        this.lerpMorphTarget('eyeSquintRight', targetSquint, 0.08);
        this.lerpMorphTarget('browInnerUp', targetBrow, 0.08);
        this.lerpMorphTarget('mouthDimpleLeft', targetDimple, 0.08);
        this.lerpMorphTarget('mouthDimpleRight', targetDimple, 0.08);
        this.lerpMorphTarget('noseSneerLeft', targetNoseSneer, 0.08);
        this.lerpMorphTarget('noseSneerRight', targetNoseSneer, 0.08);
        this.lerpMorphTarget('mouthPressLeft', targetPress, 0.08);
        this.lerpMorphTarget('mouthPressRight', targetPress * 0.7, 0.08);

        // Content-facing eye gaze:
        // Left eye looks out-left, right eye looks in-right -> subtle convergence toward center content
        this.lerpMorphTarget('eyeLookOutLeft', 0.10, 0.06);
        this.lerpMorphTarget('eyeLookInRight', 0.10, 0.06);
    }

    // =========================================================================
    // Main Render Loop
    // =========================================================================

    animate() {
        requestAnimationFrame(() => this.animate());

        if (!this.isReady) return;

        const delta = this.clock.getDelta();

        // 1. Update Skeletal Animation Mixer
        // Lets Talking_0, Talking_1, Talking_2, and Idle mocap keyframes drive
        // the head, neck, spine, arms, and hands organically without distortion.
        if (this.mixer) {
            this.mixer.update(delta);
        }

        // 2. Interactive 3D Turntable Rotation with Inertia & Auto-return
        this.updateRotation(delta);

        // 3. Pointing gesture overlay towards referenced content (if triggered)
        this.updatePointingGesture(delta);

        // 4. Audio-amplitude Driven Mouth Movement
        this.updateMouthAnimation(delta);

        // 3. Talking Animation Gesture Rotation (with natural phrasing duration)
        if (this.currentAgentState === 'speaking' || this.isSpeakingAudio) {
            this.talkingRotationTimer += delta;
            const currentClip = this.talkingClips[this.currentTalkingIndex];
            const maxDuration = (currentClip && currentClip.duration) ? currentClip.duration : 4.2;
            if (this.talkingRotationTimer >= maxDuration) {
                this.talkingRotationTimer = 0;
                this.currentTalkingIndex = (this.currentTalkingIndex + 1) % this.talkingClips.length;
                this.playTalkingAnimation();
            }
        } else {
            this.talkingRotationTimer = 0;
        }

        // 4. Natural Eye Blinking
        this.updateBlinking(delta);

        // 5. Warm Professional Facial Expression (Smile & Engaged Eyes)
        this.updateFacialExpressions();

        // 6. Render Scene onto transparent canvas
        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// Auto-initialize when DOM is loaded
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => {
        window.avatar3d = new Avatar3D('avatar-canvas');
    });
}
