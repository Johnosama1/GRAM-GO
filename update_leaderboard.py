import re

with open("artifacts/app/src/pages/LeaderboardPage.tsx", "r") as f:
    content = f.read()

# Add imports for stickers if they don't exist
imports = """
import { AnimatedSticker } from "../components/AnimatedSticker";
import leaderboard1Sticker from "../assets/stickers/leaderboard_1.json";
import leaderboard2Sticker from "../assets/stickers/leaderboard_2.json";
import leaderboard3Sticker from "../assets/stickers/leaderboard_3.json";
"""

if "import leaderboard1Sticker" not in content:
    content = content.replace('import leaderboardVideo from "../assets/stickers/leaderboard_video.webm";',
                              'import leaderboardVideo from "../assets/stickers/leaderboard_video.webm";\n' + imports.strip())

def replace_podium(content, top_num, rank_bg, rank_size, bottom_pos, sticker_name, sticker_size, sticker_bottom):
    # This searches for the structure of each top player and replaces it with the requested design

    # regex pattern
    pattern = r'(\{top' + str(top_num) + r'\s*\?\s*\(\s*<div[^>]*>)\s*(<div\s*style=\{\{\s*position:\s*"relative"\s*\}\}>)\s*(<div\s*style=\{\{\s*width:\s*\d+,[^>]*>.*?</div>)\s*(<div\s*style=\{\{\s*position:\s*"absolute",\s*bottom:\s*-[0-9]+,[^>]*>)\s*(<div\s*style=\{\{\s*width:\s*\d+[^>]*>' + str(top_num) + r'</div>)\s*(</div>)\s*(</div>)'

    def replacer(match):
        pre_div = match.group(1)
        relative_div = match.group(2)
        avatar_div = match.group(3)
        rank_outer_div = match.group(4)
        rank_inner_div = match.group(5)

        # Change the rank position to top
        new_rank_outer = rank_outer_div.replace(f'bottom: {bottom_pos}', f'top: -{int(rank_size/2)}')

        # Add sticker
        sticker = f"""
                  <div style={{{{ position: "absolute", bottom: "{sticker_bottom}", left: "50%", transform: "translateX(-50%)", zIndex: 10, pointerEvents: "none" }}}}>
                    <AnimatedSticker animationData={{{sticker_name}}} size={{{sticker_size}}} />
                  </div>"""

        return f"{pre_div}\n{relative_div}\n{new_rank_outer}\n{rank_inner_div}\n</div>\n{avatar_div}\n{sticker}\n</div>"

    return re.sub(pattern, replacer, content, flags=re.DOTALL)

# 2nd Place
content = replace_podium(content, 2, "linear-gradient(135deg, #cbd5e1, #94a3b8)", 28, "-10", "leaderboard2Sticker", 90, "40px")

# 1st Place
content = replace_podium(content, 1, "linear-gradient(135deg, #fde047, #eab308)", 34, "-12", "leaderboard1Sticker", 120, "50px")

# 3rd Place
content = replace_podium(content, 3, "linear-gradient(135deg, #fdba74, #ea580c)", 28, "-10", "leaderboard3Sticker", 90, "40px")

with open("artifacts/app/src/pages/LeaderboardPage.tsx", "w") as f:
    f.write(content)

print("Updated LeaderboardPage.tsx")
