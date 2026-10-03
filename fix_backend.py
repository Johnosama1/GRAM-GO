import re

with open("artifacts/api-server/src/routes/combo.ts", "r") as f:
    content = f.read()

# Fix GET /status
parsed_items_logic = """
  let parsedSelectedItems: number[] = [];
  if (attempt?.selectedItems) {
    if (typeof attempt.selectedItems === "string") {
      try { parsedSelectedItems = JSON.parse(attempt.selectedItems); } catch (e) {}
    } else if (Array.isArray(attempt.selectedItems)) {
      parsedSelectedItems = attempt.selectedItems;
    }
  }
"""

content = content.replace("res.json({\n    items: comboItems.map(item => ({", parsed_items_logic + "\n  res.json({\n    items: comboItems.map(item => ({")
content = content.replace("selectedItems: attempt?.selectedItems ?? [],", "selectedItems: parsedSelectedItems,")

# Fix POST /check
content = content.replace("""const unique = Array.from(new Set(selectedItems)).filter(id => id >= 1 && id <= 5);\n  if (unique.length !== 3) {""", """const validItems = selectedItems.filter(id => typeof id === "number" && id >= 1 && id <= 5);\n  const isUnique = new Set(validItems).size === 3;\n  if (validItems.length !== 3 || !isUnique) {""")

content = content.replace("""const isMatch = unique.length === 3 && unique.every((id, index) => id === expectedArray[index]);""", """const isMatch = validItems.every((id, index) => id === expectedArray[index]);""")

content = content.replace("""selectedItems: unique,""", """selectedItems: validItems,""")
content = content.replace("""details: { comboDate: todayStr, selectedItems: unique }""", """details: { comboDate: todayStr, selectedItems: validItems }""")

with open("artifacts/api-server/src/routes/combo.ts", "w") as f:
    f.write(content)
