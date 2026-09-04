import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

export default function AnimatedBackground() {
  const [location] = useLocation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Micro star particles (lightweight 25 particles)
    const stars = Array.from({ length: 25 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.6 + 0.2,
      speed: Math.random() * 0.2 + 0.05,
      color: Math.random() > 0.5 ? "rgba(0, 242, 254," : "rgba(168, 85, 247,",
    }));

    let frame = 0;
    const render = () => {
      frame++;
      ctx.clearRect(0, 0, width, height);

      // Render micro twinkling particles
      for (const s of stars) {
        s.y -= s.speed;
        if (s.y < 0) {
          s.y = height;
          s.x = Math.random() * width;
        }
        const a = s.alpha * (0.6 + 0.4 * Math.sin(frame * 0.03 + s.x));
        ctx.fillStyle = `${s.color}${a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animId);
    };
  }, [location]);

  if (location === "/admin") {
    return null;
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, overflow: "hidden", pointerEvents: "none", background: "#030612" }}>
      {/* Ambient Top Cyan Radial Glow */}
      <div
        style={{
          position: "absolute",
          top: "-15%",
          left: "20%",
          width: "60vw",
          height: "60vw",
          maxWidth: 400,
          maxHeight: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(0, 242, 254, 0.09) 0%, rgba(0, 114, 255, 0.03) 50%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* Ambient Middle/Bottom Purple Radial Glow */}
      <div
        style={{
          position: "absolute",
          top: "40%",
          right: "-10%",
          width: "70vw",
          height: "70vw",
          maxWidth: 450,
          maxHeight: 450,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(127, 0, 255, 0.08) 0%, rgba(168, 85, 247, 0.02) 50%, transparent 70%)",
          filter: "blur(50px)",
        }}
      />

      {/* Particle Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
