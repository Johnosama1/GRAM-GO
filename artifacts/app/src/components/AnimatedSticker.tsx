import { useEffect, useRef } from "react";
import lottie from "lottie-web";

export function AnimatedSticker({
  animationData,
  size = 60,
  loop = true,
}: {
  animationData: any;
  size?: number;
  loop?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let anim: ReturnType<typeof lottie.loadAnimation> | null = null;
    if (!ref.current) return;

    anim = lottie.loadAnimation({
      container: ref.current,
      renderer: "svg",
      loop,
      autoplay: true,
      animationData,
    });

    return () => {
      if (anim) anim.destroy();
    };
  }, [animationData, loop]);

  return <div ref={ref} style={{ width: size, height: size, flexShrink: 0 }} />;
}
