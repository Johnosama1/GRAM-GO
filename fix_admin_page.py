import re

with open('artifacts/app/src/pages/AdminPage.tsx', 'r') as f:
    content = f.read()

content = content.replace('console.log("Promo Code Created");', 'showToast("Promo Code Created", "ok");')
content = content.replace('console.error("Error creating code");', 'showToast("Error creating code", "err");')
content = content.replace('console.error("Error deleting code");', 'showToast("Error deleting code", "err");')

with open('artifacts/app/src/pages/AdminPage.tsx', 'w') as f:
    f.write(content)
