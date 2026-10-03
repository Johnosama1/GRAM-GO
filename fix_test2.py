import re

with open("artifacts/api-server/src/__tests__/combo.test.ts", "r") as f:
    content = f.read()

# Fix mock typing properly using any casts
content = content.replace("(db.select as any) = mockSelect;", "")
content = content.replace("(db.select().from as any) = mockFrom;", "")
content = content.replace("(db.select().from().where as any) = mockWhere;", "")
content = content.replace("(db.select().from().where().limit as any) = mockLimit;", "(db as any).select = mockSelect; mockSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: mockLimit }) }) });")

# For the other ones
content = content.replace("(db.select().from().where().limit as any)", "mockSelect")
content = content.replace("mockSelect = mockLimit;", "mockSelect.mockReturnValue({ from: () => ({ where: () => ({ limit: mockLimit }) }) });")

with open("artifacts/api-server/src/__tests__/combo.test.ts", "w") as f:
    f.write(content)
