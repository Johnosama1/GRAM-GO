with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

# Make sure keyboard sets vx and facingRight
content = content.replace(
    '''  // Keyboard support for desktop / browser testing
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
  }, [handleJump, handleAttack]);''',
    '''  // Keyboard support for desktop / browser testing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        handleJump();
      } else if (e.code === "KeyX" || e.code === "KeyJ" || e.code === "Enter" || e.code === "KeyF") {
        e.preventDefault();
        handleAttack();
      } else if (e.code === "ArrowLeft" || e.key === "a" || e.key === "A") {
        stateRef.current.hero.vx = -4;
        stateRef.current.hero.facingRight = false;
      } else if (e.code === "ArrowRight" || e.key === "d" || e.key === "D") {
        stateRef.current.hero.vx = 4;
        stateRef.current.hero.facingRight = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        e.code === "ArrowLeft" || e.key === "a" || e.key === "A" ||
        e.code === "ArrowRight" || e.key === "d" || e.key === "D"
      ) {
        stateRef.current.hero.vx = 0;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [handleJump, handleAttack]);'''
)

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)
