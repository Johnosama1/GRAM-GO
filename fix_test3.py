import re

with open("artifacts/api-server/src/__tests__/combo.test.ts", "r") as f:
    content = f.read()

# Completely rewrite the mocking to avoid TS issues
content = re.sub(r'\(db\.select\(\)\.from\(\)\.where\(\)\.limit as any\) = mockLimit;', r'db.select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: mockLimit }) }) }) as any;', content)
content = re.sub(r'\(db\.select\(\)\.from\(\)\.where\(\)\.limit as any\) = mockComboLimit;', r'db.select = vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: mockComboLimit }) }) }) as any;', content)

# Remove the individual mock assignments
content = content.replace("(db.select as any) = mockSelect;", "")
content = content.replace("(db.select().from as any) = mockFrom;", "")
content = content.replace("(db.select().from().where as any) = mockWhere;", "")


with open("artifacts/api-server/src/__tests__/combo.test.ts", "w") as f:
    f.write(content)
