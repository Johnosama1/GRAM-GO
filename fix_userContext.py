import re

with open('artifacts/app/src/lib/userContext.tsx', 'r') as f:
    content = f.read()

# I will run doIssueSession in the background by removing await so it won't block the UI loading.
new_block = """      } else if (cachedUser) {
        // Init failed (server busy), but we have cached user! We can still issue a session and let them use the app
        setUser(cachedUser);
        if (cachedSlots) {
          setSlots(cachedSlots);
        }

        doIssueSession(cachedUser.id).catch(() => {});

        const isOwnerAdmin = Number(cachedUser.id) === 6145230334;
        setIsAdminState(isOwnerAdmin);
        api.adminCheck(cachedUser.id)
          .then((res) => setIsAdminState(res.isAdmin))
          .catch(() => setIsAdminState(isOwnerAdmin));

        getTasksOnce().catch(() => {});
        getCompletedTasksOnce(cachedUser.id).catch(() => {});
        getWithdrawalsOnce(cachedUser.id).catch(() => {});
        checkCheckinStatus().catch(() => {});
      }"""

old_block = """      } else if (cachedUser) {
        // Init failed (server busy), but we have cached user! We can still issue a session and let them use the app
        setUser(cachedUser);
        if (cachedSlots) {
          setSlots(cachedSlots);
        }

        await doIssueSession(cachedUser.id);

        const isOwnerAdmin = Number(cachedUser.id) === 6145230334;
        setIsAdminState(isOwnerAdmin);
        api.adminCheck(cachedUser.id)
          .then((res) => setIsAdminState(res.isAdmin))
          .catch(() => setIsAdminState(isOwnerAdmin));

        getTasksOnce().catch(() => {});
        getCompletedTasksOnce(cachedUser.id).catch(() => {});
        getWithdrawalsOnce(cachedUser.id).catch(() => {});
        checkCheckinStatus().catch(() => {});
      }"""

content = content.replace(old_block, new_block)
with open('artifacts/app/src/lib/userContext.tsx', 'w') as f:
    f.write(content)
