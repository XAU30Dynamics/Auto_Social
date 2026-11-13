#!/usr/bin/env python3
"""Social post visuals: one 1080x1350 picture per post, safe on Instagram and TikTok.

  python3 visuals/tools/make_posts.py visuals/strategydynamics/posts.json            # every post
  python3 visuals/tools/make_posts.py visuals/strategydynamics/posts.json 03 07      # only these ids
  python3 visuals/tools/make_posts.py visuals/strategydynamics/posts.json --safe     # also draw the TikTok overlay check

The spec file names the brand (colours, mark, wordmark, url), the source folder and the posts. Each post is a headline,
a few real screenshots cropped and placed, optional callouts, and a call to action. Output: <out>/<id>-<slug>.jpg (what
gets posted; TikTok refuses PNG), .png, manifest.json (what each picture shows, for the caption writer) and sheet.jpg.

SAFE ZONE (the reason for this tool). 4:5 is the tallest picture Instagram shows whole. TikTok shows a 4:5 photo centred
on a 9:16 screen and lays its own buttons down the right side and its caption over the bottom. So on this canvas:
  no words or call to action below y = 1215, and none right of x = 930 below y = 560.
Screenshots may run under both. `--safe` draws those two areas in red so a layout can be checked by eye.
"""
import html
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse

from PIL import Image

W, H = 1080, 1350
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
SAFE_BOTTOM, SAFE_RIGHT, SAFE_RIGHT_FROM = 1215, 930, 560


def url(p):
    return "file://" + urllib.parse.quote(os.path.abspath(p))


def css(brand):
    return f"""
:root{{color-scheme:dark}}
*{{box-sizing:border-box}}
html,body{{margin:0;width:{W}px;height:{H}px;overflow:hidden;background:{brand['field']}}}
body{{position:relative;font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;color:#F4F5F7;-webkit-font-smoothing:antialiased}}
.bloom{{position:absolute;border-radius:50%;filter:blur(120px)}}
.stars{{position:absolute;inset:0;opacity:.5}}
.brand{{position:absolute;left:64px;top:54px;display:flex;align-items:center;gap:14px;font-family:"New York",ui-serif,Georgia,serif;font-size:34px;font-weight:600;letter-spacing:-.01em}}
.brand img{{height:46px}}
.brand b{{font-weight:600;color:{brand['accentText']}}}
.k{{position:absolute;left:64px;font-size:21px;letter-spacing:.22em;text-transform:uppercase;font-weight:700}}
h1{{position:absolute;left:64px;margin:0;font-family:"New York",ui-serif,Georgia,serif;font-weight:500;letter-spacing:-.012em;line-height:1.04}}
h1 em{{font-style:normal}}
.s{{position:absolute;left:64px;font-size:30px;line-height:1.32;color:#C3C8D2}}
.v{{position:absolute;overflow:hidden;box-shadow:0 0 0 1.5px rgba(255,255,255,.13),0 40px 110px rgba(0,0,0,.7)}}
.v img{{display:block;position:absolute;left:0;top:0;max-width:none}}
.scrim{{position:absolute;left:0;right:0;pointer-events:none}}
.cta{{position:absolute;left:64px;display:flex;align-items:center;gap:20px}}
.cta .p{{height:68px;padding:0 34px;border-radius:999px;display:flex;align-items:center;font-size:28px;font-weight:700;color:#04140C;box-shadow:0 0 44px var(--glow)}}
.cta .u{{font-size:26px;font-weight:600;color:#F4F5F7;text-shadow:0 2px 14px rgba(0,0,0,.9)}}
.fine{{position:absolute;left:64px;right:64px;top:1262px;font-size:15px;line-height:1.35;color:#7F8594;text-shadow:0 1px 8px rgba(0,0,0,.9)}}
.call{{position:absolute;padding:11px 18px;border-radius:16px;font-size:23px;font-weight:650;line-height:1.2;color:#F4F5F7;background:rgba(10,12,18,.86);border:1.5px solid var(--ink);box-shadow:0 10px 40px rgba(0,0,0,.6);-webkit-backdrop-filter:blur(10px)}}
.call small{{display:block;font-size:17px;font-weight:500;color:#AEB4C0;margin-top:3px}}
.num{{position:absolute;font-family:"New York",ui-serif,Georgia,serif;font-weight:500;line-height:1;letter-spacing:-.02em}}
.pills{{position:absolute;display:flex;flex-wrap:wrap;gap:10px}}
.pills span{{padding:10px 19px;border-radius:999px;font-size:24px;font-weight:600;border:1.5px solid;background:rgba(255,255,255,.04)}}
.pills .g{{flex-basis:100%;border:0;background:none;padding:9px 0 0;font-size:17px;letter-spacing:.2em;text-transform:uppercase;color:#8A90A0}}
svg.o{{position:absolute;left:0;top:0;overflow:visible}}
"""


def stars(seed):
    out, x = [], seed * 7919 + 13
    for _ in range(70):
        x = (x * 1103515245 + 12345) % 2147483648
        px = x % W
        x = (x * 1103515245 + 12345) % 2147483648
        py = x % H
        x = (x * 1103515245 + 12345) % 2147483648
        r, a = 1 + (x % 3) * .5, .15 + (x % 50) / 100
        out.append(f'<circle cx="{px}" cy="{py}" r="{r}" fill="rgba(255,255,255,{a:.2f})"/>')
    return f'<svg class="stars" width="{W}" height="{H}">{"".join(out)}</svg>'


def visual(v, src_dir):
    """A cropped screenshot placed on the canvas. crop = [x0, y0, x1, y1] as fractions of the source."""
    path = os.path.join(src_dir, v["src"])
    iw, ih = Image.open(path).size
    x0, y0, x1, y1 = v.get("crop", [0, 0, 1, 1])
    w = v["w"]
    scale = w / ((x1 - x0) * iw)
    h = v.get("h") or (y1 - y0) * ih * scale
    t = []
    if v.get("ry") or v.get("rx") or v.get("rz"):
        t.append(f'perspective({v.get("persp", 2200)}px) rotateY({v.get("ry", 0)}deg) rotateX({v.get("rx", 0)}deg) rotate({v.get("rz", 0)}deg)')
    style = (f'left:{v["x"]}px;top:{v["y"]}px;width:{w}px;height:{h:.1f}px;border-radius:{v.get("r", 30)}px;'
             f'{"transform:" + " ".join(t) + ";" if t else ""}{"transform-origin:" + v["origin"] + ";" if v.get("origin") else ""}'
             f'{"box-shadow:none;" if v.get("flat") else ""}{"opacity:" + str(v["opacity"]) + ";" if v.get("opacity") else ""}')
    return (f'<div class="v" style="{style}"><img src="{url(path)}" style="width:{iw * scale:.1f}px;'
            f'left:{-x0 * iw * scale:.1f}px;top:{-y0 * ih * scale:.1f}px"></div>')


def callout(c):
    """A label with a line to a point: at = the point on the canvas, x/y = the label's top left."""
    ax, ay = c["at"]
    lx, ly = c["x"], c["y"]
    sx, sy = c.get("from", [lx + 30, ly + (0 if ay < ly else 50)])
    line = (f'<svg class="o" width="{W}" height="{H}"><path d="M{sx} {sy} L{ax} {ay}" stroke="var(--ink)" stroke-width="2.5" fill="none" stroke-linecap="round"/>'
            f'<circle cx="{ax}" cy="{ay}" r="9" fill="none" stroke="var(--ink)" stroke-width="2.5"/><circle cx="{ax}" cy="{ay}" r="3.5" fill="var(--ink)"/></svg>')
    sub = f'<small>{html.escape(c["sub"])}</small>' if c.get("sub") else ""
    return line + f'<div class="call" style="left:{lx}px;top:{ly}px;{"max-width:" + str(c["mw"]) + "px;" if c.get("mw") else ""}">{html.escape(c["text"])}{sub}</div>'


def page(brand, p, src_dir, n, safe):
    wash = brand["washes"][p.get("wash", brand["defaultWash"])]
    b1, b2, ink, glow = wash["bloom1"], wash["bloom2"], wash["ink"], wash["glow"]
    ty = p.get("textY", 150)
    hs = p.get("headSize", 84)
    lines = p["headline"].split("|")
    head = "<br>".join(f'<em style="color:{ink}">{html.escape(l[1:])}</em>' if l.startswith("*") else html.escape(l) for l in lines)
    hy = ty + 40
    sy = hy + len(lines) * hs * 1.04 + 22
    body = [
        f'<div class="bloom" style="width:900px;height:760px;left:-260px;top:-240px;opacity:.5;background:radial-gradient(circle,{b1},transparent 70%)"></div>',
        f'<div class="bloom" style="width:820px;height:820px;right:-320px;top:520px;opacity:.32;background:radial-gradient(circle,{b2},transparent 70%)"></div>',
        f'<div class="bloom" style="width:1000px;height:700px;left:40px;bottom:-380px;opacity:.28;background:radial-gradient(circle,{b1},transparent 70%)"></div>',
        stars(n),
    ]
    body += [visual(v, src_dir) for v in p.get("visuals", []) if not v.get("front")]
    if p.get("topScrim"):
        body.append(f'<div class="scrim" style="top:0;height:{p["topScrim"]}px;background:linear-gradient(180deg,{brand["field"]} 0%,{brand["field"]}F2 55%,transparent)"></div>')
    bs = p.get("bottomScrim", 360)
    if bs:
        body.append(f'<div class="scrim" style="bottom:0;height:{bs}px;background:linear-gradient(0deg,{brand["field"]} 0%,{brand["field"]}F7 50%,{brand["field"]}99 72%,transparent)"></div>')
    body += [visual(v, src_dir) for v in p.get("visuals", []) if v.get("front")]
    wm = brand["wordmark"]
    body.append(f'<div class="brand"><img src="{url(os.path.join(src_dir, brand["mark"]))}"><span>{wm[0]}<b>{wm[1]}</b></span></div>')
    if p.get("kicker"):
        body.append(f'<div class="k" style="top:{ty}px;color:{ink}">{html.escape(p["kicker"])}</div>')
    body.append(f'<h1 style="top:{hy}px;font-size:{hs}px;width:{p.get("headW", 960)}px">{head}</h1>')
    if p.get("sub"):
        body.append(f'<div class="s" style="top:{sy:.0f}px;width:{p.get("subW", 860)}px">{html.escape(p["sub"])}</div>')
    for nm in p.get("numbers", []):
        body.append(f'<div class="num" style="left:{nm["x"]}px;top:{nm["y"]}px;font-size:{nm.get("size", 150)}px;color:{nm.get("color", ink)}">{html.escape(nm["text"])}</div>')
    for pl in p.get("pills", []):
        spans = "".join(f'<span class="g">{html.escape(t[1:])}</span>' if t.startswith("#") else f'<span style="color:{pl.get("color", ink)};border-color:{pl.get("color", ink)}55">{html.escape(t)}</span>' for t in pl["items"])
        body.append(f'<div class="pills" style="left:{pl["x"]}px;top:{pl["y"]}px;width:{pl["w"]}px">{spans}</div>')
    body += [callout(c) for c in p.get("callouts", [])]
    cy = p.get("ctaY", 1128)
    body.append(f'<div class="cta" style="top:{cy}px"><div class="p" style="background:linear-gradient(90deg,{brand["cta"][0]},{brand["cta"][1]},{brand["cta"][2]})">{html.escape(p.get("cta", brand["defaultCta"]))}</div><div class="u">{brand["url"]}</div></div>')
    fine = p.get("fine", brand.get("fine", ""))
    if fine:
        body.append(f'<div class="fine">{html.escape(fine)}</div>')
    if safe:
        body.append(f'<div style="position:absolute;left:0;right:0;top:{SAFE_BOTTOM}px;bottom:0;background:rgba(255,0,0,.28)"></div>'
                    f'<div style="position:absolute;left:{SAFE_RIGHT}px;right:0;top:{SAFE_RIGHT_FROM}px;height:{SAFE_BOTTOM - SAFE_RIGHT_FROM}px;background:rgba(255,0,0,.28)"></div>')
    return f'<!doctype html><meta charset="utf-8"><style>{css(brand)}body{{--ink:{ink};--glow:{glow}}}</style><body>{"".join(body)}</body>'


def shoot(doc, out_png):
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(doc)
    raw = out_png + ".2x.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", "--force-device-scale-factor=2",
                    f"--window-size={W},{H}", f"--screenshot={raw}", "file://" + f.name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
    os.unlink(f.name)
    im = Image.open(raw).convert("RGB").crop((0, 0, W * 2, H * 2)).resize((W, H), Image.LANCZOS)
    os.unlink(raw)
    im.save(out_png, optimize=True)
    im.save(out_png[:-4] + ".jpg", quality=93, subsampling=0)
    return im


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    safe = "--safe" in sys.argv
    spec_path = os.path.abspath(args[0])
    only = set(args[1:])
    spec = json.load(open(spec_path))
    base = os.path.dirname(spec_path)
    src_dir, out_dir = os.path.join(base, spec["sources"]), os.path.join(base, spec["out"] + ("-safecheck" if safe else ""))
    os.makedirs(out_dir, exist_ok=True)
    manifest, thumbs = [], []
    for n, p in enumerate(spec["posts"], 1):
        name = f'{p["id"]}-{p["slug"]}'
        out = os.path.join(out_dir, name + ".png")
        if not only or p["id"] in only:
            shoot(page(spec["brand"], p, src_dir, n, safe), out)
            print(name)
        if os.path.exists(out):
            thumbs.append(out)
        manifest.append({"id": p["id"], "file": name + ".jpg", "png": name + ".png", "feature": p.get("feature"), "pillar": p.get("pillar"),
                         "headline": p["headline"].replace("|", " ").replace("*", ""), "sub": p.get("sub"), "cta": p.get("cta", spec["brand"]["defaultCta"]),
                         "shows": p.get("shows"), "angle": p.get("angle"), "facts": p.get("facts", [])})
    if not safe:
        json.dump({"brand": spec["brand"]["name"], "size": [W, H], "posts": manifest}, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
    cols, tw = 5, 324
    th = int(tw * H / W)
    sheet = Image.new("RGB", (cols * (tw + 12) + 12, ((len(thumbs) + cols - 1) // cols) * (th + 12) + 12), (14, 15, 20))
    for i, t in enumerate(thumbs):
        sheet.paste(Image.open(t).resize((tw, th), Image.LANCZOS), (12 + (i % cols) * (tw + 12), 12 + (i // cols) * (th + 12)))
    sheet.save(os.path.join(out_dir, "sheet.jpg"), quality=88)


if __name__ == "__main__":
    main()
