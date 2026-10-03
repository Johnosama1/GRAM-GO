import re

with open("artifacts/app/src/pages/GamesPage.tsx", "r") as f:
    content = f.read()

# Add focus listener to GamesPage
focus_listener = """
  useEffect(() => {
    loadComboStatus();
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      loadComboStatus();
    };
    window.addEventListener("focus", handleFocus);
    window.addEventListener("visibilitychange", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);
"""

content = content.replace("""  useEffect(() => {
    loadComboStatus();
  }, []);""", focus_listener)

with open("artifacts/app/src/pages/GamesPage.tsx", "w") as f:
    f.write(content)
