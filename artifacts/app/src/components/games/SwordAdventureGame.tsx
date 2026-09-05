import React, { useEffect, useRef, useState, useCallback } from "react";
import { api } from "../../lib/api";
import { useUser } from "../../lib/userContext";
import {
  Heart,
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
}

interface Obstacle {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  type: "spike";
}

export default function SwordAdventureGame({ onClose }: SwordAdventureGameProps) {
  const { refresh } = useUser();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Audio Context ref for lazy user-gesture initialization
  const audioCtxRef = useRef<AudioContext | null>(null);

  // React State for HUD & Modals
  const [gameState, setGameState] = useState<"playing" | "over" | "claiming">("playing");
  const [enemiesDefeated, setEnemiesDefeated] = useState(0);
  const [goEarned, setGoEarned] = useState(0);
  const [lives, setLives] = useState(3);
  const [muted, setMuted] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);

  // Game Engine State in Ref (for 60fps loop without React re-render overhead)
  const stateRef = useRef({
    gameState: "playing" as "playing" | "over" | "claiming",
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
      isAttacking: false,
      attackTimer: 0,
      invulnerableTimer: 0,
      legCycle: 0,
    },
    enemies: [] as Enemy[],
    obstacles: [] as Obstacle[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    enemiesDefeated: 0,
    lives: 3,
    gameSpeed: 3.5,
    spawnEnemyTimer: 80,
    spawnObstacleTimer: 160,
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
    setLives(3);
    setResultMessage(null);

    const s = stateRef.current;
    s.gameState = "playing";
    s.enemies = [];
    s.obstacles = [];
    s.particles = [];
    s.floatingTexts = [];
    s.enemiesDefeated = 0;
    s.lives = 3;
    s.gameSpeed = 3.5;
    s.spawnEnemyTimer = 70;
    s.spawnObstacleTimer = 150;
    s.bgOffset = 0;
    s.startTime = Date.now();
    s.hero.vy = 0;
    s.hero.isGrounded = true;
    s.hero.isJumping = false;
    s.hero.isAttacking = false;
    s.hero.attackTimer = 0;
    s.hero.invulnerableTimer = 0;
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

  // Attack Action
  const handleAttack = useCallback(() => {
    const s = stateRef.current;
    if (s.gameState !== "playing") return;
    const hero = s.hero;

    if (hero.attackTimer <= 0) {
      hero.isAttacking = true;
      hero.attackTimer = 16;
      playSound("slash");

      // Energy wave particles
      for (let i = 0; i < 8; i++) {
        s.particles.push({
          x: hero.x + hero.width + 10,
          y: hero.y + hero.height / 2 + (Math.random() - 0.5) * 30,
          vx: Math.random() * 5 + 3,
          vy: (Math.random() - 0.5) * 3,
          size: Math.random() * 3 + 2,
          color: "#00f2fe",
          alpha: 1,
          life: 0,
          maxLife: 12,
        });
      }

      // Hit detection on enemies in range
      const attackRange = 110;
      const attackBox = {
        x: hero.x + hero.width * 0.4,
        y: hero.y - 12,
        width: attackRange,
        height: hero.height + 24,
      };

      s.enemies.forEach((enemy) => {
        if (!enemy.defeated && enemy.x < attackBox.x + attackBox.width && enemy.x + enemy.width > attackBox.x) {
          enemy.hp -= 1;
          enemy.hitFlash = 8;
          playSound("hit");

          // Hit sparks
          for (let p = 0; p < 12; p++) {
            s.particles.push({
              x: enemy.x + enemy.width / 2,
              y: enemy.y + enemy.height / 2,
              vx: (Math.random() - 0.5) * 8 + 2,
              vy: (Math.random() - 0.5) * 8,
              size: Math.random() * 4 + 2,
              color: Math.random() > 0.5 ? "#fbbf24" : "#00f2fe",
              alpha: 1,
              life: 0,
              maxLife: 20,
            });
          }

          if (enemy.hp <= 0) {
            enemy.defeated = true;
            s.enemiesDefeated += 1;
            const killed = s.enemiesDefeated;
            setEnemiesDefeated(killed);
            setGoEarned(Math.round(killed * 0.05 * 1000) / 1000);
            playSound("coin");

            // Floating +0.05 GO Text
            s.floatingTexts.push({
              id: Date.now() + Math.random(),
              x: enemy.x + 8,
              y: enemy.y - 10,
              text: "+0.05 GO",
              color: "#fbbf24",
              alpha: 1,
              vy: -1.8,
            });

            // Defeat explosion particles
            for (let p = 0; p < 22; p++) {
              s.particles.push({
                x: enemy.x + enemy.width / 2,
                y: enemy.y + enemy.height / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                size: Math.random() * 5 + 2,
                color: Math.random() > 0.4 ? "#a855f7" : "#00f2fe",
                alpha: 1,
                life: 0,
                maxLife: 25,
              });
            }
          }
        }
      });
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
        if (hero.attackTimer > 0) {
          hero.attackTimer -= 1;
          if (hero.attackTimer <= 0) hero.isAttacking = false;
        }

        if (hero.invulnerableTimer > 0) {
          hero.invulnerableTimer -= 1;
        }

        if (hero.isGrounded) {
          hero.legCycle = (hero.legCycle + 0.25) % (Math.PI * 2);
        }

        // Spawn Enemies
        s.spawnEnemyTimer -= 1;
        if (s.spawnEnemyTimer <= 0) {
          s.enemies.push({
            id: Date.now() + Math.random(),
            x: width + 30,
            y: groundY - 54,
            width: 42,
            height: 54,
            hp: 1,
            maxHp: 1,
            speed: s.gameSpeed * (0.85 + Math.random() * 0.3),
            hitFlash: 0,
            defeated: false,
          });
          s.spawnEnemyTimer = Math.floor(Math.random() * 50 + 75);
        }

        // Spawn Obstacles (Spikes)
        s.spawnObstacleTimer -= 1;
        if (s.spawnObstacleTimer <= 0) {
          s.obstacles.push({
            id: Date.now() + Math.random(),
            x: width + 40,
            y: groundY - 26,
            width: 32,
            height: 26,
            type: "spike",
          });
          s.spawnObstacleTimer = Math.floor(Math.random() * 80 + 140);
        }

        // Update Enemies & Player Hitbox Detection
        for (let i = s.enemies.length - 1; i >= 0; i--) {
          const enemy = s.enemies[i];
          if (!enemy.defeated) {
            enemy.x -= enemy.speed;
          } else {
            enemy.y -= 1.2;
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
              s.lives -= 1;
              setLives(s.lives);
              hero.invulnerableTimer = 45;
              playSound("hit");

              if (s.lives <= 0) {
                playSound("over");
                finishGameSession();
                return;
              }
            }
          }

          if (enemy.x < -60 || (enemy.defeated && enemy.hitFlash <= 0)) {
            s.enemies.splice(i, 1);
          }
        }

        // Update Obstacles & Player Collision
        for (let i = s.obstacles.length - 1; i >= 0; i--) {
          const obs = s.obstacles[i];
          obs.x -= s.gameSpeed;

          if (hero.invulnerableTimer <= 0) {
            const heroBox = { x: hero.x + 10, y: hero.y + 10, width: hero.width - 20, height: hero.height - 10 };
            const obsBox = { x: obs.x + 4, y: obs.y + 4, width: obs.width - 8, height: obs.height - 4 };

            if (
              heroBox.x < obsBox.x + obsBox.width &&
              heroBox.x + heroBox.width > obsBox.x &&
              heroBox.y < obsBox.y + obsBox.height &&
              heroBox.y + heroBox.height > obsBox.y
            ) {
              s.lives -= 1;
              setLives(s.lives);
              hero.invulnerableTimer = 45;
              playSound("hit");

              if (s.lives <= 0) {
                playSound("over");
                finishGameSession();
                return;
              }
            }
          }

          if (obs.x < -50) {
            s.obstacles.splice(i, 1);
          }
        }

        s.gameSpeed = Math.min(6.0, 3.5 + s.enemiesDefeated * 0.04);
      }

      // ── 4. Draw Obstacles (Metallic Spikes) ────────────────────────────
      s.obstacles.forEach((obs) => {
        ctx.fillStyle = "#ef4444";
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        const step = obs.width / 3;
        for (let k = 0; k < 3; k++) {
          const sx = obs.x + k * step;
          ctx.moveTo(sx, obs.y + obs.height);
          ctx.lineTo(sx + step / 2, obs.y);
          ctx.lineTo(sx + step, obs.y + obs.height);
        }
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // ── 5. Draw Enemies (Hooded Skeleton Warriors) ─────────────────────
      s.enemies.forEach((enemy) => {
        if (enemy.defeated) return;

        const ex = enemy.x;
        const ey = enemy.y;

        ctx.save();
        if (enemy.hitFlash > 0) {
          ctx.filter = "brightness(2) drop-shadow(0 0 12px #ff0055)";
        }

        // Dark Cloak
        ctx.fillStyle = "#1e1b2e";
        ctx.beginPath();
        ctx.moveTo(ex + 10, ey + 18);
        ctx.lineTo(ex + enemy.width - 10, ey + 18);
        ctx.lineTo(ex + enemy.width, ey + enemy.height);
        ctx.lineTo(ex, ey + enemy.height);
        ctx.closePath();
        ctx.fill();

        // Hood / Head
        ctx.fillStyle = "#2d2438";
        ctx.beginPath();
        ctx.arc(ex + enemy.width / 2, ey + 18, 14, 0, Math.PI * 2);
        ctx.fill();

        // Skull Face
        ctx.fillStyle = "#f1f5f9";
        ctx.beginPath();
        ctx.arc(ex + enemy.width / 2 - 2, ey + 18, 9, 0, Math.PI * 2);
        ctx.fill();

        // Glowing Red Eyes
        ctx.fillStyle = "#ef4444";
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(ex + enemy.width / 2 - 5, ey + 17, 2.5, 0, Math.PI * 2);
        ctx.arc(ex + enemy.width / 2 + 1, ey + 17, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Enemy Sword
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ex + 2, ey + 26);
        ctx.lineTo(ex - 8, ey + 38);
        ctx.stroke();

        // HP Bar
        const barWidth = 32;
        const barHeight = 4;
        const barX = ex + (enemy.width - barWidth) / 2;
        const barY = ey - 10;
        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(barX, barY, barWidth, barHeight);
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(barX, barY, (barWidth * enemy.hp) / enemy.maxHp, barHeight);

        ctx.restore();
      });

      // ── 6. Draw Hero ──────────────────────────────────────────────────
      const hero = s.hero;
      ctx.save();

      // Invulnerability flicker
      if (hero.invulnerableTimer > 0 && Math.floor(hero.invulnerableTimer / 4) % 2 === 0) {
        ctx.globalAlpha = 0.35;
      }

      const hx = hero.x;
      const hy = hero.y;

      // Cyan Glowing Energy Cape
      ctx.fillStyle = "#00f2fe";
      ctx.shadowColor = "#00f2fe";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      const capeFlutter = Math.sin(Date.now() / 120) * 8;
      ctx.moveTo(hx + 12, hy + 18);
      ctx.lineTo(hx - 18 + capeFlutter, hy + 36);
      ctx.lineTo(hx - 12 + capeFlutter, hy + 48);
      ctx.lineTo(hx + 20, hy + 32);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Hero Body / Armor
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(hx + 12, hy + 20, 20, 22);

      // Gold Trim
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hx + 12, hy + 20, 20, 22);

      // Hero Head / Helmet
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(hx + 22, hy + 12, 12, 0, Math.PI * 2);
      ctx.fill();

      // Helmet Cyan Visor
      ctx.fillStyle = "#00f2fe";
      ctx.shadowColor = "#00f2fe";
      ctx.shadowBlur = 8;
      ctx.fillRect(hx + 22, hy + 10, 10, 4);
      ctx.shadowBlur = 0;

      // Running Legs animation
      const legOffset = Math.sin(hero.legCycle) * 7;
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";

      // Left Leg
      ctx.beginPath();
      ctx.moveTo(hx + 16, hy + 42);
      ctx.lineTo(hx + 12 - legOffset, hy + 54);
      ctx.stroke();

      // Right Leg
      ctx.beginPath();
      ctx.moveTo(hx + 26, hy + 42);
      ctx.lineTo(hx + 28 + legOffset, hy + 54);
      ctx.stroke();

      // Sword
      if (!hero.isAttacking) {
        ctx.strokeStyle = "#00f2fe";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#00f2fe";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(hx + 28, hy + 28);
        ctx.lineTo(hx + 44, hy + 12);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        // Attack Slashing Arc FX
        const slashProgress = 1 - hero.attackTimer / 16;
        const arcCenter = { x: hx + 34, y: hy + 26 };
        const radius = 52;

        ctx.strokeStyle = "#00f2fe";
        ctx.lineWidth = 5;
        ctx.shadowColor = "#00f2fe";
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(arcCenter.x, arcCenter.y, radius, -Math.PI * 0.45 + slashProgress * 0.6, Math.PI * 0.35 + slashProgress * 0.6);
        ctx.stroke();

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(arcCenter.x, arcCenter.y, radius - 4, -Math.PI * 0.35 + slashProgress * 0.6, Math.PI * 0.25 + slashProgress * 0.6);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      ctx.restore();

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
          {/* Hearts */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 3,
              background: "rgba(10, 16, 38, 0.85)",
              border: "1px solid rgba(239, 68, 68, 0.45)",
              borderRadius: 12,
              padding: "4px 8px",
              boxShadow: "0 0 12px rgba(239, 68, 68, 0.25)",
            }}
          >
            {[1, 2, 3].map((h) => (
              <Heart
                key={h}
                size={16}
                fill={h <= lives ? "#ef4444" : "transparent"}
                color={h <= lives ? "#ef4444" : "rgba(255,255,255,0.3)"}
                style={{
                  transition: "all 0.2s ease",
                  filter: h <= lives ? "drop-shadow(0 0 4px #ef4444)" : "none",
                }}
              />
            ))}
          </div>

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

      {/* ── Game Over / Round Result Modal ─────────────────────────────── */}
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
