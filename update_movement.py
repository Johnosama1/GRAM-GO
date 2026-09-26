import re

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

# 1. Add vx and facingRight to hero state
content = content.replace(
    '''      y: 400,
      width: 44,
      height: 54,
      vy: 0,''',
    '''      y: 400,
      width: 44,
      height: 54,
      vx: 0,
      vy: 0,
      facingRight: true,'''
)

# 2. Add joystick UI state
content = content.replace(
    '''  const [resultMessage, setResultMessage] = useState<string | null>(null);''',
    '''  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
  const [joystickOrigin, setJoystickOrigin] = useState({ x: 0, y: 0 });'''
)

# 3. Update game loop: remove auto-scroll, add hero.x update
# Search for s.bgOffset = (s.bgOffset + s.gameSpeed) % 40;
content = content.replace(
    '''      if (s.gameState === "playing") {
        s.bgOffset = (s.bgOffset + s.gameSpeed) % 40;
      }''',
    '''      if (s.gameState === "playing") {
        // No automatic global scroll
        s.gameSpeed = 0;
        s.bgOffset = (s.bgOffset + s.gameSpeed) % 40;
      }'''
)

# Find Hero Physics & Gravity
#         hero.y += hero.vy;
content = content.replace(
    '''        // Hero Physics & Gravity
        hero.y += hero.vy;''',
    '''        // Hero Physics & Gravity
        hero.x += hero.vx;
        if (hero.x < 0) hero.x = 0;
        if (hero.x > width - hero.width) hero.x = width - hero.width;
        hero.y += hero.vy;'''
)

# Advance Sprite Animation Frame
content = content.replace(
    '''        // Advance Sprite Animation Frame (Game Engine Controller)
        if (hero.isGrounded) {
          hero.animTimer += 1;
          // Running animation pace: smooth, energetic 10-12 fps (changes frame every 5-6 ticks at 60fps)
          const ticksPerFrame = Math.max(4, Math.round(5.5 - (s.gameSpeed - 3.5) * 0.3));
          if (hero.animTimer >= ticksPerFrame) {
            hero.animTimer = 0;
            hero.frameIndex = (hero.frameIndex + 1) % 6;
          }
        } else {''',
    '''        // Advance Sprite Animation Frame (Game Engine Controller)
        if (hero.isGrounded) {
          if (hero.vx === 0) {
            hero.frameIndex = 0; // Idle
            hero.animTimer = 0;
          } else {
            hero.animTimer += 1;
            const ticksPerFrame = 5;
            if (hero.animTimer >= ticksPerFrame) {
              hero.animTimer = 0;
              hero.frameIndex = (hero.frameIndex + 1) % 6;
            }
          }
        } else {'''
)

# Remove s.gameSpeed increment
content = content.replace(
    '''        s.gameSpeed = Math.min(6.0, 3.5 + s.enemiesDefeated * 0.04);''',
    '''        // s.gameSpeed = Math.min(6.0, 3.5 + s.enemiesDefeated * 0.04);'''
)

# Hero sprite direction handling (facingRight)
# In Draw Hero:
content = content.replace(
    '''      // Ground subtle shadow & cyan energy aura
      ctx.fillStyle = "rgba(0, 242, 254, 0.22)";
      ctx.beginPath();
      ctx.ellipse(hx + hero.width / 2, groundY - 2, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      let currentImg: HTMLImageElement | undefined;
      currentImg = heroRunImagesRef.current[hero.frameIndex];''',
    '''      // Ground subtle shadow & cyan energy aura
      ctx.fillStyle = "rgba(0, 242, 254, 0.22)";
      ctx.beginPath();
      ctx.ellipse(hx + hero.width / 2, groundY - 2, 22, 6, 0, 0, Math.PI * 2);
      ctx.fill();

      // Flip context if facing left
      ctx.save();
      if (!hero.facingRight) {
        ctx.translate(hx + hero.width / 2, 0);
        ctx.scale(-1, 1);
        ctx.translate(-(hx + hero.width / 2), 0);
      }

      let currentImg: HTMLImageElement | undefined;
      currentImg = heroRunImagesRef.current[hero.frameIndex];'''
)

content = content.replace(
    '''      // Draw Equipped Weapon
      const wImg = weaponImagesRef.current[hero.equippedWeaponId];
      if (wImg && wImg.complete && wImg.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(wImg, hx + 10, hy + 15, 32, 32);
          ctx.imageSmoothingEnabled = true;
      }

      ctx.restore();''',
    '''      // Draw Equipped Weapon will be handled later
      const wImg = weaponImagesRef.current[hero.equippedWeaponId];
      if (wImg && wImg.complete && wImg.naturalWidth > 0) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(wImg, hx + 10, hy + 15, 32, 32);
          ctx.imageSmoothingEnabled = true;
      }

      ctx.restore(); // for facingRight flip

      ctx.restore(); // for initial save'''
)


with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)

print("Done")
