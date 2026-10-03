import re

with open("artifacts/app/src/pages/GamesPage.tsx", "r") as f:
    content = f.read()

# Add RED/GREEN visual indicator logic to the background/border of the overall combo card

# Locate the Game 1: DAILY COMBO card container
old_card_bg = 'background: "linear-gradient(145deg, rgba(8, 16, 42, 0.88), rgba(4, 8, 24, 0.95))",'
new_card_bg = 'background: status?.attempted ? (status.isSuccess ? "rgba(34, 197, 94, 0.15)" : "rgba(239, 68, 68, 0.15)") : "linear-gradient(145deg, rgba(8, 16, 42, 0.88), rgba(4, 8, 24, 0.95))",'

old_card_border = 'border: "1.5px solid rgba(0, 242, 254, 0.35)",'
new_card_border = 'border: status?.attempted ? (status.isSuccess ? "1.5px solid #4ade80" : "1.5px solid #f87171") : "1.5px solid rgba(0, 242, 254, 0.35)",'

content = content.replace(old_card_bg, new_card_bg)
content = content.replace(old_card_border, new_card_border)

with open("artifacts/app/src/pages/GamesPage.tsx", "w") as f:
    f.write(content)
