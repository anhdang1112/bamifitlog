"""Set the app version in every place that needs it: python tools/bump_version.py 1.4.0"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
ver = sys.argv[1] if len(sys.argv) > 1 else None
if not ver or not re.fullmatch(r"\d+\.\d+\.\d+", ver):
    sys.exit("usage: python tools/bump_version.py MAJOR.MINOR.PATCH")

(ROOT / "version.json").write_text(json.dumps({"version": ver}) + "\n", encoding="utf-8")
for name, pattern, repl in [
    ("app.js", r"const APP_VERSION = '[^']*';", f"const APP_VERSION = '{ver}';"),
    ("sw.js", r"const VERSION = '[^']*';", f"const VERSION = '{ver}';"),
]:
    p = ROOT / name
    s = p.read_text(encoding="utf-8")
    s, n = re.subn(pattern, repl, s)
    assert n == 1, f"{name}: version line not found"
    p.write_text(s, encoding="utf-8", newline="\n")
print("version ->", ver)
