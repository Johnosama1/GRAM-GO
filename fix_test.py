import re

with open("artifacts/api-server/src/__tests__/combo.test.ts", "r") as f:
    content = f.read()

# Fix db.select().from().where() missing arguments in mock typing
content = content.replace("db.select().from()", "db.select().from('table')")
content = content.replace("db.select().from('table').where()", "db.select().from('table').where('cond')")
content = content.replace("db.select().from('table').where('cond').limit", "db.select().from('table').where('cond').limit")
content = content.replace("db.select()", "db.select('args')")

with open("artifacts/api-server/src/__tests__/combo.test.ts", "w") as f:
    f.write(content)
