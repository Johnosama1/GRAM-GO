with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'r') as f:
    content = f.read()

timer_code = '''        // Timer Text
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 14px 'Cairo', sans-serif";
        const seconds = Math.ceil(w.timer / 60);
        ctx.fillText(seconds.toString(), w.x + 10, w.y - 10);'''

new_timer_code = '''        // Timer Text
        ctx.fillStyle = "#ef4444";
        ctx.font = "bold 24px 'Arial', sans-serif";
        const seconds = Math.ceil(w.timer / 60);
        ctx.fillText(seconds.toString(), w.x + 10, w.y - 20);'''

content = content.replace(timer_code, new_timer_code)

with open('artifacts/app/src/components/games/SwordAdventureGame.tsx', 'w') as f:
    f.write(content)
