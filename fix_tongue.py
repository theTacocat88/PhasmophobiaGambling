"""
Run from: C:\\Users\\elias\\Documents\\Projects\\phas-gambling
  python fix_tongue.py
"""

CSS = 'styles.css'

with open(CSS, 'r', encoding='utf-8') as f:
    content = f.read()

# The trigger is currently a full-height flex child.
# We need to find the .cs-linking-trigger block and replace it.

OLD = """.cs-linking-trigger {
  width: 22px;
  min-width: 22px;
  flex-shrink: 0;
  background: #1e2122;
  border: none;
  border-left: 1px solid #3a3d3e;
  color: #555;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  writing-mode: vertical-rl;
  padding-top: 20px;
  transition: color 0.15s, background 0.15s;
}"""

NEW = """.cs-linking-trigger {
  width: 22px;
  min-width: 22px;
  height: 72px;          /* small tab, not full height */
  align-self: flex-start; /* sit at the top of the sidebar */
  flex-shrink: 0;
  background: #1e2122;
  border: none;
  border-left: 1px solid #3a3d3e;
  border-bottom: 1px solid #3a3d3e;
  border-radius: 0 0 6px 0; /* rounded bottom-right corner */
  color: #555;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  writing-mode: vertical-rl;
  transition: color 0.15s, background 0.15s;
}"""

if OLD in content:
    content = content.replace(OLD, NEW, 1)
    with open(CSS, 'w', encoding='utf-8') as f:
        f.write(content)
    print("[OK] Tongue tab fixed — now 72px tall, sits at top of sidebar")
else:
    print("[SKIP] Could not find exact trigger block.")
    print()
    print("Manually replace .cs-linking-trigger in styles.css with:")
    print()
    print(NEW)
