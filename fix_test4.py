import re

with open("artifacts/api-server/src/__tests__/combo.test.ts", "r") as f:
    content = f.read()

# Restore back to original and fix just the (db.select as any) which ts is complaining about since it calls db.select() later
content = re.sub(r'db\.select\(\'args\'\)', 'db.select()', content)
content = re.sub(r"db\.select\(\)\.from\('table'\)", 'db.select().from(dailyCombosTable)', content)
content = re.sub(r"db\.select\(\)\.from\(dailyCombosTable\)\.where\('cond'\)", 'db.select().from(dailyCombosTable).where(eq(dailyCombosTable.id, 1))', content)

with open("artifacts/api-server/src/__tests__/combo.test.ts", "w") as f:
    f.write(content)
