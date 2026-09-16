import React, { useEffect, useRef, useState, useCallback } from "react";

interface WeaponConfig {
  id: number;
  type: string;
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  range: number;
  color: string;
}

import weaponsData from "./weapons_config.json";
const WEAPONS: Record<string, WeaponConfig> = weaponsData;

interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  isEnemy: boolean;
  damage: number;
  color: string;
  distance: number;
  maxRange: number;
}

interface DroppedWeapon {
  id: number;
  x: number;
  y: number;
  weaponId: number;
  timer: number;
  vy: number;
}

import { api } from "../../lib/api";
import { useUser } from "../../lib/userContext";
import {
  Skull,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
  Swords,
  X,
} from "lucide-react";

interface SwordAdventureGameProps {
  onClose: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  speed: number;
  hitFlash: number;
  defeated: boolean;
  weaponId: number;
  shootTimer: number;
  state: "walking" | "running" | "shooting" | "death";
  frameIndex: number;
  animTimer: number;
  deathTimer: number;
}



const HERO_RUN_FRAMES = [
  "/games/adventurer-run-00.png",
  "/games/adventurer-run-01.png",
  "/games/adventurer-run-02.png",
  "/games/adventurer-run-03.png",
  "/games/adventurer-run-04.png",
  "/games/adventurer-run-05.png",
];

const HERO_ATTACK_FRAMES = [
  "/games/adventurer-attack2-01.png",
  "/games/IMG_20260907_030232_058.png",
  "/games/IMG_20260907_030234_571.png",
  "/games/IMG_20260907_030236_226.png",
  "/games/IMG_20260907_030238_999.png",
  "/games/IMG_20260907_030300_377.png",
  "/games/IMG_20260907_030305_391.png",
  "/games/IMG_20260907_030316_538.png",
  "/games/IMG_20260907_030317_840.png",
  "/games/IMG_20260907_030320_124.png",
  "/games/IMG_20260907_030322_984.png",
];

export default function SwordAdventureGame({ onClose }: SwordAdventureGameProps) {
  const { refresh } = useUser();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Audio Context ref for lazy user-gesture initialization
  const audioCtxRef = useRef<AudioContext | null>(null);


  // Animated Hero Sprite Frames (Game Engine Preload & Cache)
  const heroRunImagesRef = useRef<HTMLImageElement[]>([]);
  const heroAttackImagesRef = useRef<HTMLImageElement[]>([]);
  const weaponImagesRef = useRef<Record<number, HTMLImageElement>>({});
  const enemyWalkImagesRef = useRef<HTMLImageElement | null>(null);
  const enemyRunImagesRef = useRef<HTMLImageElement | null>(null);
  const enemyShootImagesRef = useRef<HTMLImageElement | null>(null);
  const enemyDeathImagesRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const imgWalk = new Image(); imgWalk.src = "/games/Soldier 1 Walking-Sheet.png"; enemyWalkImagesRef.current = imgWalk;
    const imgRun = new Image(); imgRun.src = "/games/Soldier 1 Running-Sheet.png"; enemyRunImagesRef.current = imgRun;
    const imgShoot = new Image(); imgShoot.src = "/games/Soldier 1 Shoot-Sheet.png"; enemyShootImagesRef.current = imgShoot;
    const imgDeath = new Image(); imgDeath.src = "/games/Soldier 1 Death-Sheet.png"; enemyDeathImagesRef.current = imgDeath;
    // preload weapons
    for (let i = 1; i <= 50; i++) {
      const img = new Image();
      img.src = `/weapons/${i}.png`;
      weaponImagesRef.current[i] = img;
    }

    const runImages: HTMLImageElement[] = [];
    HERO_RUN_FRAMES.forEach((src, idx) => {
      const img = new Image();
      img.src = src;
      img.onerror = () => {
        // Fallback to root path if /games/ fails
        img.src = `/adventurer-run-0${idx}.png`;
      };
      runImages.push(img);
    });
    heroRunImagesRef.current = runImages;

    const attackImages: HTMLImageElement[] = [];
    HERO_ATTACK_FRAMES.forEach((src) => {
      const filename = src.split("/").pop();
      const img = new Image();
      img.src = src;
      img.onerror = () => {
        // Fallback to root path if /games/ fails
        img.src = `/${filename}`;
      };
      attackImages.push(img);
    });
    heroAttackImagesRef.current = attackImages;
  }, []);

  // React State for HUD & Modals
  const [gameState, setGameState] = useState<"playing" | "over" | "claiming" | "level_complete" | "game_won">("playing");
  const [enemiesDefeated, setEnemiesDefeated] = useState(0);
  const [goEarned, setGoEarned] = useState(0);
    const [muted, setMuted] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Game Engine State in Ref (for 60fps loop without React re-render overhead)
  const stateRef = useRef({
    gameState: "playing" as "playing" | "over" | "claiming" | "level_complete" | "game_won",
    sessionToken: null as string | null,
    width: 380,
    height: 600,
    groundY: 460,
    hero: {
      x: 65,
      y: 400,
      width: 44,
      height: 54,
      vy: 0,
      isGrounded: true,
      isJumping: false,
      invulnerableTimer: 0,
      frameIndex: 0,
      animTimer: 0,
      equippedWeaponId: 1, // Start with weapon 1
      shootCooldown: 0,
    },
    projectiles: [] as Projectile[],
    droppedWeapons: [] as DroppedWeapon[],
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    enemiesDefeated: 0,
    levelEnemiesSpawned: 0,
    levelEnemiesDefeated: 0,
    currentLevel: 1,
    gameSpeed: 3.5,
    spawnEnemyTimer: 80,
    bgOffset: 0,
    stars: [] as Array<{ x: number; y: number; size: number; alpha: number; speed: number }>,
    startTime: Date.now(),
  });

  // Sound effects helper
  const playSound = useCallback((type: "jump" | "slash" | "hit" | "coin" | "over") => {
    if (muted) return;
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      const ctx = audioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      if (type === "slash") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(550, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.14);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.14);
      } else if (type === "jump") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.16);
      } else if (type === "coin") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(987.77, ctx.currentTime);
        osc.frequency.setValueAtTime(1318.51, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === "hit") {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(140, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, ctx.currentTime + 0.18);
        gain.gain.setValueAtTime(0.35, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
      }
    } catch {
      // Audio errors fail silently without blocking gameplay
    }
  }, [muted]);

  // Start Session with Backend
  const startNewGameSession = async () => {
    setGameState("playing");
    setEnemiesDefeated(0);
    setGoEarned(0);
    setResultMessage(null);

    const s = stateRef.current;
    s.gameState = "playing";
    s.enemies = [];
    s.particles = [];
    s.floatingTexts = [];
    s.projectiles = [];
    s.droppedWeapons = [];
    s.enemiesDefeated = 0;
    s.levelEnemiesSpawned = 0;
    s.levelEnemiesDefeated = 0;
    s.currentLevel = 1;
    s.gameSpeed = 3.5;
    s.spawnEnemyTimer = 70;
    s.bgOffset = 0;
    s.startTime = Date.now();
    s.hero.vy = 0;
    s.hero.isGrounded = true;
    s.hero.isJumping = false;
    s.hero.invulnerableTimer = 0;
    s.hero.shootCooldown = 0;
    // Keep equippedWeaponId across levels if they continue, but if new session, reset to 1
    s.hero.equippedWeaponId = 1;
    s.hero.frameIndex = 0;
    s.hero.animTimer = 0;
    s.hero.y = s.groundY - s.hero.height;

    try {
      const res = await api.startSwordAdventure();
      if (res && res.sessionToken) {
        stateRef.current.sessionToken = res.sessionToken;
      }
    } catch (err) {
      console.warn("[SwordAdventure] Session started in offline/standalone mode:", err);
    }
  };

  useEffect(() => {
    startNewGameSession();
  }, []);

  // Finish Game Session with Backend Validation
  const finishGameSession = useCallback(async () => {
    const s = stateRef.current;
    setGameState("claiming");
    s.gameState = "claiming";

    const token = s.sessionToken;
    const killed = s.enemiesDefeated;
    const duration = Math.max(1, Math.round((Date.now() - s.startTime) / 1000));

    if (token) {
      try {
        const res = await api.finishSwordAdventure({
          sessionToken: token,
          enemiesDefeated: killed,
          durationSeconds: duration,
        });

        if (res && res.ok) {
          setResultMessage(res.message);
          setGoEarned(res.reward);
          await refresh();
        }
      } catch (err: unknown) {
        const msg = err && typeof err === "object" && "body" in err
          ? (err as { body?: { error?: string } }).body?.error
          : "Session concluded";
        setResultMessage(msg || "Game round finished");
      }
    } else {
      setResultMessage(`Great battle! You defeated ${killed} enemies.`);
      setGoEarned(Math.round(killed * 0.05 * 1000) / 1000);
    }

    setGameState("over");
    s.gameState = "over";
  }, [refresh]);

  // Jump Action
  const handleJump = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== "playing") return;
    const hero = s.hero;

    if (hero.isGrounded) {
      hero.vy = -14.5;
      hero.isGrounded = false;
      hero.isJumping = true;
      playSound("jump");

      // Jump dust particles
      for (let i = 0; i < 6; i++) {
        s.particles.push({
          x: hero.x + hero.width / 2,
          y: s.groundY,
          vx: (Math.random() - 0.5) * 4 - 2,
          vy: -Math.random() * 2 - 1,
          size: Math.random() * 3 + 2,
          color: "rgba(0, 242, 254, 0.8)",
          alpha: 1,
          life: 0,
          maxLife: 15,
        });
      }
    }
  }, [playSound]);

  // Attack Action (Shoot Weapon)
  const handleAttack = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== "playing") return;
    const hero = s.hero;

    if (hero.shootCooldown <= 0) {
      const weapon = WEAPONS[hero.equippedWeaponId.toString()];
      if (!weapon) return;

      hero.shootCooldown = weapon.fireRate;
      playSound("slash"); // Fallback for shoot sound

      // Spawn projectile
      const isShotgun = weapon.type === "shotgun";
      const numBullets = isShotgun ? 3 : 1;

      for (let i = 0; i < numBullets; i++) {
        let vy = 0;
        if (isShotgun) {
          vy = (i - 1) * 2; // Spread: -2, 0, 2
        }

        s.projectiles.push({
          id: Date.now() + Math.random(),
          x: hero.x + hero.width,
          y: hero.y + hero.height / 2 - 4,
          vx: weapon.bulletSpeed,
          vy: vy,
          isEnemy: false,
          damage: weapon.damage,
          color: weapon.color,
          distance: 0,
          maxRange: weapon.range,
        });
      }

      // Muzzle flash particles
      for (let i = 0; i < 4; i++) {
        s.particles.push({
          x: hero.x + hero.width + 5,
          y: hero.y + hero.height / 2 + (Math.random() - 0.5) * 10,
          vx: Math.random() * 3 + 1,
          vy: (Math.random() - 0.5) * 2,
          size: Math.random() * 3 + 1,
          color: weapon.color,
          alpha: 1,
          life: 0,
          maxLife: 8,
        });
      }
    }
  }, [playSound]);

  // Keyboard support for desktop / browser testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        handleJump();
      } else if (e.code === "KeyX" || e.code === "KeyJ" || e.code === "Enter" || e.code === "KeyF") {
        e.preventDefault();
        handleAttack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleJump, handleAttack]);

  // Main Canvas & Game Loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Generate stars for parallax background once
    if (stateRef.current.stars.length === 0) {
      for (let i = 0; i < 45; i++) {
        stateRef.current.stars.push({
          x: Math.random() * 500,
          y: Math.random() * 350,
          size: Math.random() * 2 + 1,
          alpha: Math.random() * 0.7 + 0.3,
          speed: Math.random() * 0.4 + 0.2,
        });
      }
    }

    // Resize Handler with DPR Scaling
    const resizeCanvas = () => {
      const container = containerRef.current;
      const width = container?.clientWidth || window.innerWidth || 380;
      const height = container?.clientHeight || window.innerHeight || 600;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const groundY = Math.max(220, height - 130);
      stateRef.current.width = width;
      stateRef.current.height = height;
      stateRef.current.groundY = groundY;

      if (stateRef.current.hero.isGrounded) {
        stateRef.current.hero.y = groundY - stateRef.current.hero.height;
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", resizeCanvas);

    // ── Main Render Frame ───────────────────────────────────────────────
    const render = () => {
      const s = stateRef.current;
      const width = s.width || 380;
      const height = s.height || 600;
      const groundY = s.groundY;

      // Clear Canvas Frame
      ctx.clearRect(0, 0, width, height);

      // ── 1. Sky & Galaxy Background ────────────────────────────────────
      const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
      skyGrad.addColorStop(0, "#030616");
      skyGrad.addColorStop(0.45, "#0a0e28");
      skyGrad.addColorStop(0.8, "#180e36");
      skyGrad.addColorStop(1, "#070b1c");
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, height);

      // Parallax Stars
      s.stars.forEach((star) => {
        if (s.gameState === "playing") {
          star.x -= star.speed;
          if (star.x < 0) star.x = width + 10;
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${star.alpha})`;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // Luminous Full Moon
      const moonX = width * 0.76;
      const moonY = height * 0.2;
      const moonGrad = ctx.createRadialGradient(moonX, moonY, 12, moonX, moonY, 48);
      moonGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      moonGrad.addColorStop(0.35, "rgba(0, 242, 254, 0.55)");
      moonGrad.addColorStop(0.7, "rgba(168, 85, 247, 0.2)");
      moonGrad.addColorStop(1, "transparent");
      ctx.fillStyle = moonGrad;
      ctx.beginPath();
      ctx.arc(moonX, moonY, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(moonX, moonY, 20, 0, Math.PI * 2);
      ctx.fill();

      // Distant Gothic Castle Silhouettes
      ctx.fillStyle = "rgba(10, 16, 38, 0.85)";
      ctx.beginPath();
      const castleBaseY = groundY - 24;
      ctx.moveTo(width * 0.55, groundY);
      ctx.lineTo(width * 0.55, castleBaseY - 50);
      ctx.lineTo(width * 0.6, castleBaseY - 95);
      ctx.lineTo(width * 0.65, castleBaseY - 50);
      ctx.lineTo(width * 0.72, castleBaseY - 45);
      ctx.lineTo(width * 0.76, castleBaseY - 120);
      ctx.lineTo(width * 0.8, castleBaseY - 45);
      ctx.lineTo(width * 0.92, castleBaseY - 60);
      ctx.lineTo(width * 0.95, castleBaseY - 90);
      ctx.lineTo(width * 0.98, castleBaseY - 35);
      ctx.lineTo(width + 20, groundY);
      ctx.fill();

      // ── 2. Scrolling Ground Platform ──────────────────────────────────
      if (s.gameState === "playing") {
        s.bgOffset = (s.bgOffset + s.gameSpeed) % 40;
      }

      // Stone Ground
      const groundGrad = ctx.createLinearGradient(0, groundY, 0, height);
      groundGrad.addColorStop(0, "rgba(20, 26, 52, 0.96)");
      groundGrad.addColorStop(0.2, "rgba(12, 16, 36, 0.98)");
      groundGrad.addColorStop(1, "#050712");
      ctx.fillStyle = groundGrad;
      ctx.fillRect(0, groundY, width, height - groundY);

      // Neon Cyan Ground Surface Line
      ctx.strokeStyle = "#00f2fe";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "#00f2fe";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(width, groundY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Stone Slabs
      ctx.strokeStyle = "rgba(0, 242, 254, 0.15)";
      ctx.lineWidth = 1.5;
      for (let x = -s.bgOffset; x < width + 40; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 14, height);
        ctx.stroke();
      }

      // ── 3. Physics & Update State ─────────────────────────────────────
      if (s.gameState === "playing") {
        const hero = s.hero;

        // Hero Physics & Gravity
        hero.y += hero.vy;
        if (!hero.isGrounded) {
          hero.vy += 0.72;
          if (hero.y >= groundY - hero.height) {
            hero.y = groundY - hero.height;
            hero.vy = 0;
            hero.isGrounded = true;
            hero.isJumping = false;
          }
        }

        // Timers
        if (hero.shootCooldown > 0) {
          hero.shootCooldown -= 1;
        }

        if (hero.invulnerableTimer > 0) {
          hero.invulnerableTimer -= 1;
        }

        // Advance Sprite Animation Frame (Game Engine Controller)
        if (hero.isGrounded) {
          hero.animTimer += 1;
          // Running animation pace: smooth, energetic 10-12 fps (changes frame every 5-6 ticks at 60fps)
          const ticksPerFrame = Math.max(4, Math.round(5.5 - (s.gameSpeed - 3.5) * 0.3));
          if (hero.animTimer >= ticksPerFrame) {
            hero.animTimer = 0;
            hero.frameIndex = (hero.frameIndex + 1) % 6;
          }
        } else {
          // Dynamic jump frame in the air
          if (hero.vy < 0) {
            hero.frameIndex = 1; // Leaping upward
          } else {
            hero.frameIndex = 4; // Falling/landing
          }
        }

        // Spawn Enemies
        if (s.levelEnemiesSpawned < 100) {
          s.spawnEnemyTimer -= 1;
          if (s.spawnEnemyTimer <= 0) {
            // Determine weapon based on level and spawned count
            const offset = (s.currentLevel - 1) * 10;
            const group = Math.floor(s.levelEnemiesSpawned / 10); // 0 to 9
            const assignedWeaponId = offset + group + 1;

                        s.enemies.push({
              id: Date.now() + Math.random(),
              x: width + 50,
              y: groundY - 60,
              width: 50,
              height: 60,
              hp: 4,
              maxHp: 4,
              speed: 1.5 + Math.random() * 0.5,
              hitFlash: 0,
              defeated: false,
              weaponId: assignedWeaponId,
              shootTimer: (60 + Math.random() * 60) / (1 + s.levelEnemiesSpawned * 0.005),
              state: "walking",
              frameIndex: 0,
              animTimer: 0,
              deathTimer: 0,
            });
            s.levelEnemiesSpawned += 1;
            // Progressive difficulty: enemies spawn faster
            s.spawnEnemyTimer = Math.max(30, 100 - (s.enemiesDefeated * 0.2));
          }
        } else if (s.enemies.length === 0 && s.levelEnemiesSpawned >= 100) {
            // Level complete
            if (s.currentLevel < 5) {
                setGameState("level_complete");
                s.gameState = "level_complete";
            } else {
                setGameState("game_won");
                s.gameState = "game_won";
            }
        }



        // Update Dropped Weapons
        for (let i = s.droppedWeapons.length - 1; i >= 0; i--) {
          const w = s.droppedWeapons[i];
          w.x -= s.gameSpeed; // scroll with ground
          w.timer -= 1;
          w.y += w.vy;
          if (w.y >= groundY - 20) {
            w.y = groundY - 20;
            w.vy = 0;
          } else {
            w.vy += 0.5;
          }

          // Player picks up weapon
          if (hero.x < w.x + 32 && hero.x + hero.width > w.x && hero.y < w.y + 32 && hero.y + hero.height > w.y) {
            hero.equippedWeaponId = w.weaponId;
            playSound("coin");
            s.droppedWeapons.splice(i, 1);
            continue;
          }

          if (w.timer <= 0 || w.x < -60) {
             // Game over if timer expires OR weapon is missed off-screen
             playSound("over");
             finishGameSession();
             return;
          }
        }

        // Update Projectiles
        for (let i = s.projectiles.length - 1; i >= 0; i--) {
          const p = s.projectiles[i];
          if (p.isEnemy) {
             p.x -= p.vx;
          } else {
             p.x += p.vx;
          }
          p.y += p.vy;
          p.distance += p.vx;

          let destroyed = false;

          if (p.distance >= p.maxRange || p.x < -20 || p.x > width + 20) {
             destroyed = true;
          }

          // Collision Check
          if (!destroyed) {
            if (p.isEnemy) {
              // Enemy projectile hitting player
                            if (hero.invulnerableTimer <= 0 && p.x > hero.x && p.x < hero.x + hero.width && p.y > hero.y && p.y < hero.y + hero.height) {
                hero.invulnerableTimer = 45;
                playSound("hit");
                destroyed = true;
                playSound("over");
                finishGameSession();
                return;
              }
            } else {
              // Player projectile hitting enemy
              for (let j = 0; j < s.enemies.length; j++) {
                const enemy = s.enemies[j];
                if (!enemy.defeated && p.x > enemy.x && p.x < enemy.x + enemy.width && p.y > enemy.y && p.y < enemy.y + enemy.height) {
                  enemy.hp -= p.damage;
                  enemy.hitFlash = 8;
                  playSound("hit");
                  destroyed = true;

                  // Hit particles
                  for (let pp = 0; pp < 6; pp++) {
                    s.particles.push({
                      x: p.x,
                      y: p.y,
                      vx: (Math.random() - 0.5) * 4,
                      vy: (Math.random() - 0.5) * 4,
                      size: Math.random() * 3 + 1,
                      color: p.color,
                      alpha: 1,
                      life: 0,
                      maxLife: 15,
                    });
                  }

                  if (enemy.hp <= 0) {
                    enemy.defeated = true;
                    s.enemiesDefeated += 1;
                    s.levelEnemiesDefeated += 1;
                    const killed = s.enemiesDefeated;
                    setEnemiesDefeated(killed);
                    setGoEarned(Math.round(killed * 0.05 * 1000) / 1000);
                    playSound("coin");

                    // Drop weapon
                    s.droppedWeapons.push({
                      id: Date.now() + Math.random(),
                      x: enemy.x,
                      y: enemy.y,
                      weaponId: enemy.weaponId,
                      timer: 300, // 5 seconds at 60fps
                      vy: -5
                    });

                    // Explosion
                    for (let pp = 0; pp < 15; pp++) {
                      s.particles.push({
                        x: enemy.x + enemy.width / 2,
                        y: enemy.y + enemy.height / 2,
                        vx: (Math.random() - 0.5) * 8,
                        vy: (Math.random() - 0.5) * 8,
                        size: Math.random() * 4 + 2,
                        color: "#ef4444",
                        alpha: 1,
                        life: 0,
                        maxLife: 20,
                      });
                    }
                  }
                  break; // only hit one enemy
                }
              }
            }
          }

          if (destroyed) {
            s.projectiles.splice(i, 1);
          }
        }

        // Update Enemies
        for (let i = s.enemies.length - 1; i >= 0; i--) {
          const enemy = s.enemies[i];

          if (enemy.defeated) {
             enemy.x -= s.gameSpeed;
             enemy.state = "death";
             enemy.deathTimer += 1;
             enemy.animTimer += 1;
             if (enemy.animTimer > 8) {
                 enemy.frameIndex += 1;
                 enemy.animTimer = 0;
             }
             if (enemy.deathTimer > 60) {
                 s.enemies.splice(i, 1);
             }
             continue;
          }

          const distToPlayer = enemy.x - (hero.x + hero.width);

          // AI State Machine
          if (distToPlayer > 200) {
              enemy.state = "walking";
              enemy.x -= enemy.speed;
          } else if (distToPlayer > 120) {
              enemy.state = "running";
              enemy.x -= enemy.speed * 1.5;
          } else if (distToPlayer <= 120 && distToPlayer > -50) {
              enemy.state = "shooting";
              // Stop moving while shooting
              if (distToPlayer < 50) enemy.x += enemy.speed * 0.5;
          } else {
              enemy.state = "running";
              enemy.x -= enemy.speed;
          }

          // Global Scroll
          enemy.x -= s.gameSpeed;

          // Animation
          enemy.animTimer += 1;
          const frameThreshold = enemy.state === "running" ? 5 : 8;
          if (enemy.animTimer > frameThreshold) {
              enemy.frameIndex = (enemy.frameIndex + 1) % 4; // assume 4 frames loop for walk/run/shoot
              enemy.animTimer = 0;
          }

          // Shooting Logic
          if (enemy.state === "shooting") {
             enemy.shootTimer -= 1;
             if (enemy.shootTimer <= 0) {
                 enemy.shootTimer = 80;
                 const weapon = WEAPONS[enemy.weaponId];
                 if (weapon && enemy.x > 0 && enemy.x < width) {

                   s.projectiles.push({
                      id: Date.now() + Math.random(),
                      x: enemy.x,
                      y: enemy.y + 20,
                      vx: weapon.bulletSpeed,
                      vy: (hero.y - enemy.y) / (distToPlayer / weapon.bulletSpeed) * 0.5,
                      isEnemy: true,
                      damage: 1,
                      color: "#ef4444",
                      distance: 0,
                      maxRange: weapon.range,
                   });
                 }
             }
          }

          if (enemy.hitFlash > 0) enemy.hitFlash -= 1;

          // Hero vs Enemy Collision
          if (!enemy.defeated && hero.invulnerableTimer <= 0) {
            const heroBox = { x: hero.x + 8, y: hero.y + 8, width: hero.width - 16, height: hero.height - 8 };
            const enemyBox = { x: enemy.x + 8, y: enemy.y + 6, width: enemy.width - 16, height: enemy.height - 6 };

            if (
              heroBox.x < enemyBox.x + enemyBox.width &&
              heroBox.x + heroBox.width > enemyBox.x &&
              heroBox.y < enemyBox.y + enemyBox.height &&
              heroBox.y + heroBox.height > enemyBox.y
            ) {
              hero.invulnerableTimer = 45;
              playSound("hit");
              playSound("over");
              finishGameSession();
              return;
            }
          }

          if (enemy.x < -100 && !enemy.defeated) {
            s.enemies.splice(i, 1);
          }
        }

        s.gameSpeed = Math.min(6.0, 3.5 + s.enemiesDefeated * 0.04);
      }



      // ── 5. Draw Enemies ─────────────────────
      s.enemies.forEach((enemy) => {
        const ex = enemy.x;
        const ey = enemy.y;

        ctx.save();

        if (enemy.hitFlash > 0) {
           ctx.filter = "brightness(2) sepia(1) hue-rotate(-50deg) saturate(5)";
        }

        let img = null;
        let framesCount = 4;

        if (enemy.state === "walking") { img = enemyWalkImagesRef.current; framesCount = 4; }
        else if (enemy.state === "running") { img = enemyRunImagesRef.current; framesCount = 4; }
        else if (enemy.state === "shooting") { img = enemyShootImagesRef.current; framesCount = 4; }
        else if (enemy.state === "death") { img = enemyDeathImagesRef.current; framesCount = 4; }

        if (img && img.complete && img.naturalWidth > 0) {
            let fw = img.width / framesCount;
            let clampedFrame = enemy.frameIndex;
            if (enemy.state === "death" && clampedFrame >= framesCount) {
                clampedFrame = framesCount - 1; // clamp to last frame
            } else {
                clampedFrame = clampedFrame % framesCount;
            }
            let frameX = clampedFrame * fw;

            ctx.drawImage(img, frameX, 0, fw, img.height, ex - 10, ey - 10, 70, 70);
        } else {
           ctx.fillStyle = "#ef4444";
           ctx.fillRect(ex, ey, enemy.width, enemy.height);
        }

        ctx.restore();

        // HP Bar
        if (!enemy.defeated) {
          ctx.fillStyle = "rgba(0,0,0,0.5)";
          ctx.fillRect(ex, ey - 10, enemy.width, 4);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(ex, ey - 10, enemy.width * (enemy.hp / enemy.maxHp), 4);
        }
      });


      // ── 6. Draw Hero (Animated Adventurer Sprite Frames) ──────────────
      const hero = s.hero;
      ctx.save();

      // Invulnerability flicker
      if (hero.invulnerableTimer > 0 && Math.floor(hero.invulnerableTimer / 4) % 2 === 0) {
        ctx.globalAlpha = 0.4;
      }

      const hx = hero.x;
      const hy = hero.y;

      const spriteW = 86;
      const spriteH = 64;
      const spriteX = hx - 14;
      const spriteY = hy + hero.height - spriteH;

      // Ground subtle shadow & cyan energy aura
      ctx.fillStyle = "rgba(0, 242, 254, 0.22)";
      ctx.beginPath();
      ctx.ellipse(hx + hero.width / 2, groundY - 2, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      let currentImg: HTMLImageElement | undefined;
      currentImg = heroRunImagesRef.current[hero.frameIndex];

      if (currentImg && currentImg.complete && currentImg.naturalWidth > 0) {
        // Pixel-crisp 2D rendering for authentic pixel-art
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(currentImg, spriteX, spriteY, spriteW, spriteH);
        ctx.imageSmoothingEnabled = true;
      } else {
        // Fallback procedural hero rendering while frames load
        ctx.fillStyle = "#00f2fe";
        ctx.fillRect(hx + 8, hy + 10, hero.width - 16, hero.height - 10);
      }

      // Draw Equipped Weapon
      const wImg = weaponImagesRef.current[hero.equippedWeaponId];
      if (wImg && wImg.complete && wImg.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(wImg, hx + 10, hy + 15, 32, 32);
          ctx.imageSmoothingEnabled = true;
      }

      ctx.restore();


      // ── 7.5. Draw Projectiles & Dropped Weapons ─────────────────────────────
      s.projectiles.forEach((p) => {
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      s.droppedWeapons.forEach((w) => {
        const dImg = weaponImagesRef.current[w.weaponId];
        if (dImg && dImg.complete && dImg.naturalWidth > 0) {
            ctx.imageSmoothingEnabled = false;
            // Hover effect
            const hoverY = Math.sin(Date.now() / 150) * 4;
            ctx.drawImage(dImg, w.x, w.y + hoverY, 32, 32);
            ctx.imageSmoothingEnabled = true;
        }

        // Timer Text
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 14px 'Cairo', sans-serif";
        const seconds = Math.ceil(w.timer / 60);
        ctx.fillText(seconds.toString(), w.x + 10, w.y - 10);
      });

      // ── 7. Draw Particles ─────────────────────────────────────────────
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);

        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (p.life >= p.maxLife) {
          s.particles.splice(i, 1);
        }
      }

      // ── 8. Draw Floating Texts (+0.05 GO) ─────────────────────────────
      for (let i = s.floatingTexts.length - 1; i >= 0; i--) {
        const ft = s.floatingTexts[i];
        ft.y += ft.vy;
        ft.alpha -= 0.025;

        ctx.fillStyle = ft.color;
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.font = "bold 14px 'Cairo', sans-serif";
        ctx.shadowColor = ft.color;
        ctx.shadowBlur = 8;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        if (ft.alpha <= 0) {
          s.floatingTexts.splice(i, 1);
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("orientationchange", resizeCanvas);
    };
  }, [finishGameSession]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100dvh",
        zIndex: 9999,
        background: "#030612",
        display: "flex",
        flexDirection: "column",
        userSelect: "none",
        WebkitUserSelect: "none",
        touchAction: "none",
        overflow: "hidden",
        direction: "ltr",
      }}
    >
      {/* ── Top HUD ────────────────────────────────────────────────────── */}
      <div
        style={{
          position: "absolute",
          top: "max(env(safe-area-inset-top, 0px), 12px)",
          left: 12,
          right: 12,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pointerEvents: "auto",
        }}
      >
        {/* Left: Hearts & Enemies Defeated */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>


          {/* Enemies Defeated */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(10, 16, 38, 0.85)",
              border: "1px solid rgba(168, 85, 247, 0.45)",
              borderRadius: 12,
              padding: "4px 10px",
              boxShadow: "0 0 12px rgba(168, 85, 247, 0.2)",
            }}
          >
            <Skull size={15} color="#c084fc" />
            <span style={{ color: "#ffffff", fontWeight: 900, fontSize: 13 }}>
              {enemiesDefeated}
            </span>
          </div>
        </div>

        {/* Right: GO Earned & Buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* GO Earned */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              background: "rgba(10, 16, 38, 0.85)",
              border: "1px solid rgba(251, 191, 36, 0.5)",
              borderRadius: 12,
              padding: "4px 10px",
              boxShadow: "0 0 12px rgba(251, 191, 36, 0.3)",
            }}
          >
            <img src="/go.png" alt="GO" style={{ width: 16, height: 16, borderRadius: "50%" }} />
            <span style={{ color: "#fbbf24", fontWeight: 900, fontSize: 13 }}>
              +{goEarned.toFixed(2)} GO
            </span>
          </div>

          {/* Mute Button */}
          <button
            onClick={() => setMuted((m) => !m)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "rgba(10, 16, 38, 0.85)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>

          {/* Exit Button */}
          <button
            onClick={() => {
              if (enemiesDefeated > 0 && gameState === "playing") {
                finishGameSession();
              } else {
                onClose();
              }
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              color: "#f87171",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Main Canvas Viewport (With touch gestures on left/right half) ─ */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
        }}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          if (!touch) return;
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;
          const relativeX = touch.clientX - rect.left;
          // Left half jumps, Right half attacks
          if (relativeX < rect.width * 0.5) {
            handleJump();
          } else {
            handleAttack();
          }
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
          }}
        />
      </div>

      {/* ── Mobile Touch Controls Overlay ──────────────────────────────── */}
      {gameState === "playing" && (
        <div
          style={{
            position: "absolute",
            bottom: "max(env(safe-area-inset-bottom, 0px), 20px)",
            left: 20,
            right: 20,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pointerEvents: "auto",
          }}
        >
          {/* JUMP Touch Button */}
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleJump();
            }}
            onClick={(e) => {
              e.preventDefault();
              handleJump();
            }}
            style={{
              width: 76,
              height: 76,
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(0, 242, 254, 0.35), rgba(8, 20, 50, 0.9))",
              border: "2.5px solid #00f2fe",
              boxShadow: "0 0 24px rgba(0, 242, 254, 0.5), inset 0 0 12px rgba(0, 242, 254, 0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#00f2fe",
              cursor: "pointer",
              touchAction: "none",
            }}
          >
            <Zap size={26} />
            <span style={{ fontSize: 10, fontWeight: 900, marginTop: 2, letterSpacing: 0.5 }}>
              JUMP
            </span>
          </button>

          {/* ATTACK Touch Button */}
          <button
            onTouchStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleAttack();
            }}
            onClick={(e) => {
              e.preventDefault();
              handleAttack();
            }}
            style={{
              width: 82,
              height: 82,
              borderRadius: "50%",
              background: "linear-gradient(135deg, rgba(168, 85, 247, 0.45), rgba(0, 242, 254, 0.25), rgba(8, 14, 32, 0.95))",
              border: "2.5px solid #c084fc",
              boxShadow: "0 0 28px rgba(168, 85, 247, 0.6), inset 0 0 14px rgba(0, 242, 254, 0.3)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              cursor: "pointer",
              touchAction: "none",
            }}
          >
            <Swords size={30} color="#00f2fe" style={{ filter: "drop-shadow(0 0 6px #00f2fe)" }} />
            <span style={{ fontSize: 11, fontWeight: 900, marginTop: 2, color: "#c084fc", letterSpacing: 0.5 }}>
              ATTACK
            </span>
          </button>
        </div>
      )}

      {/* ── Modals ─────────────────────────────── */}
      {(gameState === "level_complete" || gameState === "game_won") && (
        <div style={{
            position: "absolute", inset: 0, zIndex: 100, background: "rgba(3, 6, 18, 0.88)",
            backdropFilter: "blur(16px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
           <div style={{
              background: "linear-gradient(145deg, rgba(10, 16, 38, 0.96), rgba(4, 7, 20, 0.98))",
              border: "1.5px solid rgba(0, 242, 254, 0.35)", borderRadius: 24, padding: "32px 24px",
              maxWidth: 340, width: "100%", textAlign: "center", boxShadow: "0 0 40px rgba(0, 242, 254, 0.25)",
           }}>
             <h2 style={{ fontSize: 24, color: "#00f2fe", marginBottom: 10 }}>
                {gameState === "level_complete" ? `LEVEL ${stateRef.current.currentLevel} COMPLETE!` : "YOU BEAT THE GAME!"}
             </h2>
             <button onClick={() => {
                 if (gameState === "level_complete") {
                     stateRef.current.currentLevel += 1;
                     stateRef.current.levelEnemiesSpawned = 0;
                     stateRef.current.levelEnemiesDefeated = 0;
                     stateRef.current.enemies = [];
                     stateRef.current.droppedWeapons = [];
                     stateRef.current.projectiles = [];
                     setGameState("playing");
                     stateRef.current.gameState = "playing";
                 } else {
                     finishGameSession();
                 }
             }} style={{ padding: "10px 20px", background: "#00f2fe", borderRadius: 10, border: "none", fontWeight: "bold", cursor: "pointer", marginTop: 20 }}>
                 {gameState === "level_complete" ? "NEXT LEVEL" : "CLAIM REWARDS"}
             </button>
           </div>
        </div>
      )}

      {gameState === "over" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 100,
            background: "rgba(3, 6, 18, 0.88)",
            backdropFilter: "blur(16px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              background: "linear-gradient(145deg, rgba(10, 16, 38, 0.96), rgba(4, 7, 20, 0.98))",
              border: "1.5px solid rgba(0, 242, 254, 0.35)",
              borderRadius: 24,
              padding: "32px 24px",
              maxWidth: 340,
              width: "100%",
              textAlign: "center",
              boxShadow: "0 0 40px rgba(0, 242, 254, 0.25)",
              animation: "popIn 0.3s ease",
            }}
          >
            <div
              style={{
                width: 68,
                height: 68,
                borderRadius: "50%",
                background: enemiesDefeated > 0 ? "rgba(0, 242, 254, 0.15)" : "rgba(239, 68, 68, 0.15)",
                border: enemiesDefeated > 0 ? "2px solid #00f2fe" : "2px solid #ef4444",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                fontSize: 32,
                boxShadow: enemiesDefeated > 0 ? "0 0 20px rgba(0, 242, 254, 0.4)" : "0 0 20px rgba(239, 68, 68, 0.3)",
              }}
            >
              {enemiesDefeated > 0 ? "⚔️" : "💀"}
            </div>

            <h2
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: enemiesDefeated > 0 ? "#00f2fe" : "#f87171",
                margin: "0 0 8px",
              }}
            >
              {enemiesDefeated > 0 ? "BATTLE FINISHED" : "GAME OVER"}
            </h2>

            {resultMessage && (
              <p style={{ color: "#e2e8f0", fontSize: 13, margin: "0 0 16px", lineHeight: 1.4 }}>
                {resultMessage}
              </p>
            )}

            {/* Stats Summary Card */}
            <div
              style={{
                background: "rgba(8, 14, 32, 0.8)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: 16,
                padding: "16px",
                marginBottom: 20,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div>
                <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                  Enemies Defeated
                </div>
                <div style={{ color: "#c084fc", fontSize: 20, fontWeight: 900, marginTop: 2 }}>
                  {enemiesDefeated}
                </div>
              </div>

              <div>
                <div style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                  GO Earned
                </div>
                <div style={{ color: "#fbbf24", fontSize: 20, fontWeight: 900, marginTop: 2 }}>
                  +{goEarned.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={startNewGameSession}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 14,
                  background: "linear-gradient(135deg, #00f2fe 0%, #a855f7 100%)",
                  border: "none",
                  color: "#040714",
                  fontWeight: 900,
                  fontSize: 15,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  boxShadow: "0 4px 20px rgba(0, 242, 254, 0.4)",
                }}
              >
                <RotateCcw size={18} />
                <span>PLAY AGAIN</span>
              </button>

              <button
                onClick={onClose}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 14,
                  background: "rgba(255, 255, 255, 0.08)",
                  border: "1px solid rgba(255, 255, 255, 0.15)",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                BACK TO GAMES
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
