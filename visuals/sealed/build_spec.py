#!/usr/bin/env python3
"""Writes visuals/sealed/posts.json — the Sealed social set's spec — for visuals/tools/make_posts.py.

  python3 visuals/sealed/build_spec.py && python3 visuals/tools/make_posts.py visuals/sealed/posts.json

Posts are written here rather than by hand so the layout stays in step with the words: each headline is measured in
Archivo and sized to fit, and the screenshot is placed under however many lines the sentence takes. Every source is a
real simulator capture of the app's demo plan (sources/app, 1206 x 2622) or a widget the app rendered (sources/widgets).
Crops are fractions of the source: [x0, y0, x1, y1].
"""
import json
import os

from PIL import Image, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "sources")
W = 1080
LEFT = 64
VIS_BOTTOM = 1120  # the picture is readable down to about here; below it the scrim and the button take over

BRAND = {
    "name": "Sealed", "field": "#08090C", "mark": "mark.png", "wordmark": ["SEALED", ""], "accentText": "#C6F24A",
    "url": "sealedapp.co.uk", "cta": ["#B4E23A", "#C6F24A", "#DCF97E"], "ctaInk": "#0C0D0F",
    "defaultCta": "Earn the close", "defaultWash": "wax", "stars": False,
    "fine": "Every frame is the real app, running its demo plan. iPhone and Apple Watch. £3.99 a month, 7-day free trial.",
    "fonts": [{"family": "Archivo", "file": "fonts/Archivo.ttf", "weight": "100 900"},
              {"family": "JetBrains Mono", "file": "fonts/JetBrainsMono.ttf", "weight": "100 800"}],
    "headFont": "Archivo,sans-serif", "headWeight": 800, "headTracking": "-.015em", "headCase": "uppercase", "headLine": 1.04,
    "markFont": "Archivo,sans-serif", "markWeight": 800, "markTracking": ".14em",
    "kickerFont": "'JetBrains Mono',monospace", "bodyFont": "Archivo,-apple-system,sans-serif", "subColor": "#B9BEC8",
    # One colour per meaning, from the app: wax = the seal, lime = hit or done, gold = beat the plan and the run's
    # metals, amber = at risk, bone = BASE's quiet facts, pact = the partner's blue.
    "washes": {
        "wax": {"bloom1": "rgba(178,34,48,.9)", "bloom2": "rgba(120,22,34,.7)", "ink": "#F26472", "glow": "rgba(198,242,74,.30)"},
        "lime": {"bloom1": "rgba(140,180,45,.6)", "bloom2": "rgba(150,28,40,.6)", "ink": "#C6F24A", "glow": "rgba(198,242,74,.30)"},
        "gold": {"bloom1": "rgba(214,170,70,.7)", "bloom2": "rgba(150,28,40,.6)", "ink": "#E8C765", "glow": "rgba(198,242,74,.30)"},
        "amber": {"bloom1": "rgba(240,160,74,.6)", "bloom2": "rgba(150,28,40,.55)", "ink": "#F0A04A", "glow": "rgba(198,242,74,.30)"},
        "bone": {"bloom1": "rgba(120,130,160,.5)", "bloom2": "rgba(150,28,40,.5)", "ink": "#E6DFD3", "glow": "rgba(198,242,74,.30)"},
        "violet": {"bloom1": "rgba(110,63,160,.75)", "bloom2": "rgba(40,120,150,.55)", "ink": "#B79BF0", "glow": "rgba(198,242,74,.30)"},
        "pact": {"bloom1": "rgba(178,34,48,.85)", "bloom2": "rgba(40,110,170,.7)", "ink": "#7FB6E6", "glow": "rgba(198,242,74,.30)"},
    },
}


def font(size, weight):
    f = ImageFont.truetype(os.path.join(SRC, "fonts/Archivo.ttf"), size)
    f.set_variation_by_axes([weight, 100])
    return f


def head_size(headline, limit=78, width=950):
    lines = [l.lstrip("*").upper() for l in headline.split("|")]
    for size in range(limit, 40, -2):
        if max(font(size, 800).getlength(l) for l in lines) * 0.985 <= width:
            return size
    return 42


def sub_lines(sub, width=860):
    f, n, cur = font(30, 400), 1, 0.0
    for word in sub.split(" "):
        w = f.getlength(word + " ")
        if cur + w > width:
            n, cur = n + 1, w
        else:
            cur += w
    return n


def size_of(src):
    return Image.open(os.path.join(SRC, src)).size


def vis(src, crop, w, x=None, y=0, **kw):
    """A crop placed w wide. x defaults to centred; y is an offset below the text block (or below the previous visual)."""
    iw, ih = size_of(src)
    h = (crop[3] - crop[1]) * ih * w / ((crop[2] - crop[0]) * iw)
    return dict(src=src, crop=crop, w=w, x=(W - w) // 2 if x is None else x, dy=y, _h=h, r=kw.pop("r", 34), **kw)


POSTS = []


def balance(sub, width=860):
    """The narrowest column that keeps the sentence on the same number of lines, so no line ends on one stray word."""
    n = sub_lines(sub, width)
    while width > 500 and sub_lines(sub, width - 10) == n:
        width -= 10
    return width if n > 1 else 860


CTA_Y = 1136
FLOOR = CTA_Y - 30  # pictures end here, clear of the button


def post(slug, feature, pillar, wash, kicker, headline, sub, cta, visuals, shows, angle, facts, callouts=None, **kw):
    """Text on top, then the visuals laid out in rows (a visual marked beside=True shares the previous one's row),
    shrunk if needed to end above the button and centred in the space that is left."""
    hs = kw.pop("headSize", None) or head_size(headline, kw.pop("headMax", 78))
    subw = balance(sub)
    text_end = 150 + 40 + len(headline.split("|")) * hs * 1.04 + 22 + sub_lines(sub, subw) * 30 * 1.32
    top = text_end + kw.pop("gap", 34)
    rows = []
    for v in visuals:
        (rows[-1] if v.get("beside") else rows.append([]) or rows[-1]).append(dict(v))
    GAP = 16
    total = sum(max(v["_h"] for v in r) for r in rows) + GAP * (len(rows) - 1)
    f = min(1.0, (FLOOR - top) / total) if rows else 1.0
    y = top + max(0.0, (FLOOR - top - total * f) * 0.42)
    placed = []
    for r in rows:
        for v in r:
            h = v.pop("_h")
            v.pop("dy"), v.pop("beside", None)
            v["w"] = round(v["w"] * f)
            v["x"] = round(W / 2 + (v["x"] - W / 2) * f)
            v["y"] = round(y)
            v["_box"] = [v["x"], v["y"], v["w"], round(h * f)]
            placed.append(v)
        y += max(b["_box"][3] for b in placed[-len(r):]) + GAP
    p = dict(id=f"{len(POSTS) + 1:02d}", slug=slug, feature=feature, pillar=pillar, wash=wash, kicker=kicker, headline=headline,
             sub=sub, subW=subw, cta=cta, headSize=hs, bottomScrim=kw.pop("bottomScrim", 230), ctaY=CTA_Y, visuals=placed,
             shows=shows, angle=angle, facts=facts)
    # A callout is given relative to a visual: on = its index, at = the point as fractions of that visual's box,
    # dx/dy = where the label sits from that point.
    for c in callouts or []:
        bx, by, bw, bh = placed[c.pop("on", 0)]["_box"]
        fx, fy = c.pop("at")
        ax, ay = round(bx + fx * bw), round(by + fy * bh)
        c.update(at=[ax, ay], x=ax + c.pop("dx"), y=ay + c.pop("dy"))
        p.setdefault("callouts", []).append(c)
    for v in placed:
        v.pop("_box")
    p.update(kw)
    POSTS.append(p)


A = "app/"
FULL = [0, 0, 1, 1]

# ── The seal ──────────────────────────────────────────────────────────────────────────────────────────────────────
post("one-press", "The seal", "hook", "wax", "The seal",
     "One press a night.|*Only as full as you earned.",
     "Today reads 96%. Hold the wax and that is the impression it takes.", "Earn the close",
     [vis(A + "home.png", [0.04, 0.325, 0.96, 0.815], 640)],
     "The home screen: a molten wax seal inside three arcs marked TRAIN, FUEL and BASE, with 96% and HOLD TO SEAL under it.",
     "The whole app is one object. You press it once a night and it can only form as full as the day you had.",
     ["Today's seal stands at 96%", "Three arcs feed it: TRAIN, FUEL, BASE", "One press a night"])

post("hold-the-wax", "The press", "founder", "wax", "The press",
     "Hold the wax.|*Feel it give.",
     "It moves under your thumb and catches the light as you tilt the phone. The wax is a real Metal shader.", "Press yours",
     [vis(A + "press-04.png", [0.04, 0.325, 0.96, 0.815], 640)],
     "The seal mid press: the wax spreading and throwing off droplets while the day still reads 96%, HOLD TO SEAL.",
     "The craft. The seal is a live surface that responds to touch and tilt, caught here half way through the press.",
     ["The wax is a Metal shader", "It responds to touch and to tilt", "96% on screen, mid press"])

post("it-sets", "The close", "hook", "gold", "The close",
     "Then it sets.|*And the day is final.",
     "Sealed, 96%, beat the plan. One press and the day is done.", "Seal today",
     [vis(A + "press-07.png", [0.04, 0.325, 0.96, 0.77], 640)],
     "The instant after the press: a ripple leaving the stamped seal, a gold ring round it, SEALED and 96% BEAT THE PLAN below.",
     "Finality. One press and the day is closed.",
     ["Sealed at 96%, marked BEAT THE PLAN", "A gold ring means the day beat the plan"])

post("gilded", "Gilded wax", "hook", "gold", "Gilded",
     "Beat the plan.|*The wax comes up gilded.",
     "100%, sealed at 21:12. Doing more never makes the seal bigger. It turns it gold.", "Earn the gold",
     [vis(A + "home-sealed.png", [0.04, 0.315, 0.96, 0.815], 640)],
     "A sealed day: the crimson seal stamped with a gold S and a gold ring, SEALED 21:12, 100% BEAT THE PLAN, and a SHARE THE SEAL button.",
     "Overachieving is rewarded with gold, never with a bigger number.",
     ["Sealed at 21:12", "100%, beat the plan", "The seal caps at 100%; beating the plan gilds it"])

post("locks-forever", "Sealed days lock", "honest", "wax", "Honest by design",
     "Sealed days|*lock forever.",
     "Thursday: 98%. TRAIN 100, FUEL 99, BASE 96. No going back to tidy it up.", "Earn the close",
     [vis(A + "day.png", [0.035, 0.668, 0.965, 0.895], 952)],
     "A sealed night opened from the wall: THURSDAY 12 NOVEMBER, 98%, TRAIN 100%, FUEL 99%, BASE 96%, 55 MIN, 435 KCAL, SEALED 21:32.",
     "The seal cannot be edited after the fact. What you earned is what stays.",
     ["Thursday sealed at 98%", "TRAIN 100%, FUEL 99%, BASE 96%", "55 min, 435 kcal, sealed 21:32", "No retro-edits"])

post("eighty-holds", "80% holds the day", "honest", "amber", "Kind by design",
     "Short of perfect?|*80% still holds.",
     "It's evening and today reads 59%. The app says it plainly: push for 80% and the streak is safe.", "Hold the day",
     [vis(A + "risk.png", [0.04, 0.325, 0.96, 0.955], 560)],
     "The home screen in the evening with the day behind: 59%, an amber line reading SEALED STREAK AT RISK, PUSH FOR 80%, and TRAIN 60%, BASE 62%, FUEL 57% below.",
     "Honest and kind at once: it tells you where you stand, and 80% is enough to hold the day and the run.",
     ["Today reads 59%", "TRAIN 60%, BASE 62%, FUEL 57%", "80% holds the day and the streak"])

post("three-arcs", "How a day works", "feature", "wax", "How it works",
     "Three arcs.|*One seal.",
     "TRAIN, FUEL and BASE fill through the day. Press the wax once, in the evening. Not before.", "Earn the close",
     [vis(A + "setup-sealed.png", [0.0, 0.385, 1.0, 0.845], 700)],
     "The guide's YOUR DAY page: a sealed crimson seal with the day dragged to night, and three tiles: TRAIN 100% 4 OF 4 SETS, FUEL 100% 3 OF 3 MEALS, BASE 100% FILLS ITSELF.",
     "The whole method on one card: tick training and meals, let Health fill BASE, press once at night.",
     ["TRAIN 100%: 4 of 4 sets", "FUEL 100%: 3 of 3 meals", "BASE 100%: fills itself from Apple Health"])

post("sealed-fx", "Sealed FX", "feature", "wax", "Sealed FX",
     "Wax, lava or liquid.|*Your colour.",
     "Three forms and a shelf of colours: crimson, ember, forest, ocean, violet, plum, brass, slate.", "Pick yours",
     [vis(A + "fx.png", [0.0, 0.545, 1.0, 0.945], 952)],
     "The SEALED FX screen: FORM tiles for WAX, LAVA and LIQUID, and COLOUR pots named CRIMSON, EMBER, FOREST, OCEAN, VIOLET, PLUM, BRASS and SLATE.",
     "The seal is yours to choose, and it previews on the real thing.",
     ["3 forms: wax, lava, liquid", "8 colours shown: crimson, ember, forest, ocean, violet, plum, brass, slate"])

post("lava", "Sealed FX: lava", "feature", "amber", "Sealed FX · Lava",
     "Same seal.|*Poured in lava.",
     "Today's 96%, molten. It still only forms as full as you earned.", "Pick yours",
     [vis(A + "home-lava.png", [0.04, 0.325, 0.96, 0.815], 640)],
     "The home screen with the seal set to lava: a glowing molten disc with cracked dark arcs, 96%, HOLD TO SEAL.",
     "Same honest seal, different material.",
     ["Lava is one of 3 forms", "The day reads 96%"])

post("liquid", "Sealed FX: liquid", "feature", "bone", "Sealed FX · Liquid",
     "Or liquid chrome.|*Gilded all the same.",
     "100%, sealed at 21:12, beat the plan. The gold is earned, whatever the seal is made of.", "Pick yours",
     [vis(A + "liquid.png", [0.04, 0.315, 0.96, 0.815], 640)],
     "A sealed day with the seal set to liquid: a chrome disc with a gold S and gold ring, SEALED 21:12, 100% BEAT THE PLAN.",
     "The look changes; the rule doesn't. Gold only appears when the day beat the plan.",
     ["Liquid is one of 3 forms", "Sealed at 21:12, 100%, beat the plan"])

def grid(srcs, cols, crop, r=30):
    """Tiles in rows of `cols`, the full width between them."""
    gap = 16
    w = (952 - gap * (cols - 1)) / cols
    return [vis(src, crop, round(w), x=round(LEFT + (i % cols) * (w + gap)), beside=i % cols != 0, r=r) for i, src in enumerate(srcs)]


RING = [0.09, 0.345, 0.91, 0.695]         # the arcs and the wax, before the press
RING_SEALED = [0.09, 0.325, 0.91, 0.675]  # the same, once stamped

post("oil", "Sealed FX: oil", "founder", "violet", "Sealed FX · Oil",
     "Oil.|*Every colour at once.",
     "Liquid, in oil: the surface turns through the spectrum as it moves. Today's 96%, waiting for the press.", "Pick yours",
     [vis(A + "fx-liquid-OIL-molten.png", [0.04, 0.325, 0.96, 0.815], 640)],
     "The home screen with the seal set to liquid oil: a dark disc with bands of blue, violet and green moving across it, iridescent arcs, 96%, HOLD TO SEAL.",
     "The craft. One of the liquid finishes is oil, which shifts colour as it moves.",
     ["Oil is one of 8 liquid finishes", "The day reads 96%", "The seal is a Metal shader that responds to touch and tilt"])

post("lava-heats", "Sealed FX: lava colours", "feature", "amber", "Sealed FX · Lava",
     "Lava runs hot.|*In five colours.",
     "Lava, blue, acid, violet and gold. Bottom right: the same lava sealed and gilded, white hot.", "Pick yours",
     grid([A + "home-lava.png", A + "fx-lava-BLUE-molten.png", A + "fx-lava-ACID-molten.png",
           A + "fx-lava-VIOLET-molten.png", A + "fx-lava-GOLD-molten.png", A + "lava.png"], 3, RING)[:5]
     + [dict(grid([A + "lava.png"] * 6, 3, RING_SEALED)[5])],
     "Six lava seals in a grid: molten in orange, blue, acid green, violet and gold, and one sealed with a white-hot gold ring.",
     "Lava comes in five colours, and it glows hotter when the day is gilded.",
     ["Lava has 5 colours: lava, blue, acid, violet, gold", "3 forms: wax, lava, liquid"])

post("liquid-metals", "Sealed FX: liquid finishes", "feature", "bone", "Sealed FX · Liquid",
     "Liquid metal.|*Copper to smoke.",
     "Copper, gold, gunmetal, glass, rose and smoke. Each one sealed, so each one wears the gold ring.", "Pick yours",
     grid([A + f"fx-liquid-{t}-sealed.png" for t in ["COPPER", "GOLD", "GUNMETAL", "GLASS", "ROSE", "SMOKE"]], 3, RING_SEALED),
     "Six sealed liquid seals in a grid: copper, gold, gunmetal, glass, rose and smoke, each with a gold S and a gold ring.",
     "The liquid form is polished metal and glass, in eight finishes.",
     ["Liquid has 8 finishes: chrome, gold, copper, gunmetal, oil, glass, smoke, rose", "6 shown here", "A gold ring means the day beat the plan"])

post("wax-pots", "Sealed FX: wax colours", "feature", "wax", "Sealed FX · Wax",
     "Classic wax.|*Pick your pot.",
     "Ember, forest, plum, slate, violet and brass, all sealed and gilded. Crimson is where everyone starts.", "Pick yours",
     grid([A + f"fx-wax-{t}-sealed.png" for t in ["ember", "forest", "plum", "slate", "violet", "brass"]], 3, RING_SEALED),
     "Six sealed wax seals in a grid: ember red, forest green, plum, slate, violet and brass, each stamped with a gold S and ring.",
     "The original wax, in a shelf of colours.",
     ["Wax has 8 colours: crimson, ember, forest, ocean, violet, plum, brass, slate", "6 shown here", "Crimson is the default"])

post("which-is-yours", "Sealed FX: the range", "hook", "wax", "Sealed FX",
     "Twelve seals.|*Which one's yours?",
     "Wax, lava and liquid, in a few of their colours. All the same day, waiting for the press.", "Pick yours",
     grid([A + n + ".png" for n in ["home", "home-lava", "fx-liquid-OIL-molten", "fx-wax-forest-molten",
                                    "fx-lava-BLUE-molten", "fx-liquid-GOLD-molten", "fx-wax-violet-molten", "fx-lava-ACID-molten",
                                    "fx-liquid-ROSE-molten", "fx-wax-brass-molten", "fx-lava-VIOLET-molten", "fx-liquid-GLASS-molten"]], 4, RING, r=24),
     "Twelve molten seals in a grid, one per finish: crimson wax, lava, oil, forest wax, blue lava, liquid gold, violet wax, acid lava, rose, brass wax, violet lava and glass.",
     "The seal is the whole app, so it's yours to choose.",
     ["12 finishes shown", "3 forms: wax, lava, liquid", "Wax has 8 colours, lava 5, liquid 8"])

# ── TRAIN ─────────────────────────────────────────────────────────────────────────────────────────────────────────
post("one-tap", "TRAIN: one tap a set", "feature", "lime", "TRAIN",
     "Hit the set?|*One tap.",
     "Deadlift, 140 kg × 5: ticked. Barbell Row, 75 × 8, is next. No typing at any point.", "Tick a set",
     [vis(A + "train-midway.png", [0.0, 0.615, 1.0, 1.0], 800)],
     "A PULL session part way: Deadlift sets at 140 KG × 5 ticked lime, then BARBELL ROW set 1 at 75 KG × 8 still open, each showing last time's numbers.",
     "Logging a set at target is a single tap, with last time beside it.",
     ["Deadlift 140 kg × 5, ticked", "Barbell Row 75 kg × 8, next", "A set at target is one tap; no keyboard"])

post("real-plates", "TRAIN: slide in plates", "feature", "lime", "TRAIN",
     "Off plan?|*Slide in real plates.",
     "Hold the chip and slide: 80 kg on the bar. Bars step in plates, dumbbells in rack gaps, machines in stack pins.", "Load the bar",
     [vis(A + "plan-grab.png", [0.03, 0.30, 0.97, 0.615], 900)],
     "Bench Press with its weight chip held: the 80 KG chip lit and a lens showing 80 KG above the finger, beside BAR PLATES, DUMBBELL RACK and MACHINE STACK, 4 SETS and 8 REPS.",
     "Changing a weight is a slide in real gym steps. You never type a number.",
     ["Bench Press 4 × 8 at 80 kg", "Bar steps in plates, dumbbell in rack gaps, machine in stack pins", "No keyboard"])

post("rest-timer", "TRAIN: rest timer", "feature", "lime", "TRAIN",
     "Tick the set.|*The rest starts itself.",
     "1:25 left on this one. 3 of 10 sets down, and the timer runs on the lock screen too.", "Start a session",
     [vis(A + "train-rest.png", [0.0, 0.078, 1.0, 0.215], 952), vis(A + "train-rest.png", [0.0, 0.485, 1.0, 0.705], 952)],
     "A PULL session with the rest timer counting 1:25 in the corner, 3/10 SETS and 30% EARNED, and Deadlift sets at 140 KG × 5 ticked.",
     "The rest timer is automatic: tick a set and it runs.",
     ["Rest timer at 1:25", "3 of 10 sets, 30% earned", "The rest timer also runs on the lock screen"],
     callouts=[dict(text="Rest, counting down", at=[0.135, 0.20], dx=70, dy=-100)], gap=92)

post("workout-done", "TRAIN: workout done", "hook", "lime", "TRAIN",
     "Workout done.|*Every set kept.",
     "10 of 10 sets, 100% earned, locked. That's how days get sealed.", "Earn the close",
     [vis(A + "train-locked.png", [0.0, 0.165, 1.0, 0.212], 952), vis(A + "train-locked.png", [0.0, 0.362, 1.0, 0.787], 952)],
     "A finished PULL session: 10/10 SETS, 100% EARNED, a WORKOUT DONE card reading 'Every set kept. That's how days get sealed.' and LOCKED 11:16, with the Deadlift sets ticked below.",
     "The micro-closure: TRAIN is complete and locked before the day's seal.",
     ["10 of 10 sets", "100% earned", "Locked at 11:16"])

post("locks-as-it-stands", "TRAIN: ending early", "honest", "wax", "Honest by design",
     "Cut it short?|*It locks as it stands.",
     "3 of 10 sets done. Hold to end, and the rest stay honest at zero.", "Earn the close",
     [vis(A + "train-end.png", [0.0, 0.645, 1.0, 0.965], 952)],
     "The foot of a part-done session: FIVE-A-SIDE 60 MIN unticked with USE 55 MIN FROM HEALTH, then HOLD TO END · LOCKS AS IT STANDS and '3 OF 10 SETS · THE REST STAY HONEST AT ZERO'.",
     "You can stop early, but the app won't round it up for you.",
     ["3 of 10 sets done", "Ending early locks the workout as it stands", "Unticked sets count as zero"])

post("rate-it", "TRAIN: rate the workout", "feature", "gold", "TRAIN",
     "Rate the session.|*Say a line about it.",
     "Four stars and a spoken note: “Legs were heavy but every set landed.” Optional, always.", "Start a session",
     [vis(A + "train-rated.png", [0.0, 0.605, 1.0, 0.96], 900)],
     "The RATE THE WORKOUT card: 4 of 5 stars, STRONG, a microphone and the note 'Legs were heavy but every set landed', LAST TIME 5 stars 'Best session in weeks', above HOLD TO COMPLETE & LOCK.",
     "A star rating and a voice note so next week you remember how it felt.",
     ["4 stars today, 5 stars last time", "Notes can be spoken", "Rating is optional"])

post("from-health", "TRAIN: Apple Health", "feature", "lime", "TRAIN · Apple Health",
     "Played five-a-side?|*It already counts.",
     "From Apple Health: football 55 min, 510 kcal. Strength 48 min, 362 kcal. No entry needed.", "Earn the close",
     [vis(A + "train.png", [0.0, 0.165, 1.0, 0.465], 952)],
     "The top of TRAIN: 10/10 SETS, 100% EARNED, a START CARDIO card (walk, run or match, clock runs on the lock screen) and FROM HEALTH · 103 MIN · 872 KCAL: STRENGTH 48 MIN 362 KCAL, FOOTBALL 55 MIN 510 KCAL.",
     "Workouts recorded anywhere in Apple Health show up in TRAIN on their own.",
     ["From Health: 103 min, 872 kcal", "Strength 48 min, 362 kcal", "Football 55 min, 510 kcal", "Cardio can be started in the app; its clock runs on the lock screen"])

# ── FUEL ──────────────────────────────────────────────────────────────────────────────────────────────────────────
post("tick-the-meal", "FUEL: tick, don't log", "hook", "lime", "FUEL",
     "Tick the meal.|*Skip the diary.",
     "Omelette, 477 kcal: ticked. You name your meals once, then each day is a tap.", "Tick a meal",
     [vis(A + "fuel.png", [0.0, 0.555, 1.0, 0.875], 952)],
     "FUEL's MEALS & DRINKS list with every row ticked lime: 3 egg omelette with cheese on 2 slices of toast 477 KCAL, Lunch chicken, rice and broccoli 460 KCAL, Post-gym shake 128 KCAL.",
     "Food is confirmation, not entry. Name your meals once and tick them.",
     ["Omelette 477 kcal, lunch 460 kcal, shake 128 kcal", "Meals are named once, then ticked each day", "Drinks count too"])

post("plate-fills", "FUEL: the plate", "feature", "lime", "FUEL",
     "The plate fills|*as you eat.",
     "605 of 1,361 kcal part way through the day. 1,361 of 1,361 once every meal is ticked.", "Fill the plate",
     [vis(A + "fuel-half.png", [0.0, 0.165, 1.0, 0.545], 466, x=64), vis(A + "fuel.png", [0.0, 0.165, 1.0, 0.545], 466, x=550, beside=True),
      vis(A + "fuel-half.png", [0.0, 0.582, 1.0, 0.685], 952)],
     "FUEL's plate twice, and the list under it. Left, part filled at 605 OF 1,361 KCAL with protein 56/144 g, carbs 40/91 g, fat 26/50 g; right, full and lime at 1,361 OF 1,361 KCAL with 144/144, 91/91 and 50/50 g. Below, the omelette (477 KCAL) ticked.",
     "A plate that fills as meals are ticked: the same screen at midday and at night.",
     ["605 of 1,361 kcal part way", "1,361 of 1,361 kcal when done", "Protein 144 g, carbs 91 g, fat 50 g on the plan"])

post("optional-maths", "FUEL: macros", "feature", "lime", "FUEL",
     "The maths is optional.|*And it stays on the phone.",
     "This omelette: 477 kcal, 32 g protein, from egg, cheddar and white toast. UK food data, built in.", "Name a meal",
     [vis(A + "macros.png", [0.0, 0.085, 1.0, 0.39], 952)],
     "TODAY'S PLATE for one meal: '3 egg omelette with cheese on 2 slices of toast' and a MACROS row reading 477 KCAL · 32P · 37C · 24F · EGG · CHEDDAR · WHITE TOAST.",
     "Macros are there if you want them, worked out on the device from UK food data.",
     ["477 kcal, 32 g protein, 37 g carbs, 24 g fat", "Made of egg, cheddar, white toast", "Uses UK CoFID food data, on the phone", "A barcode scan can fill it in"])

# ── BASE ──────────────────────────────────────────────────────────────────────────────────────────────────────────
post("readiness", "BASE: readiness", "feature", "bone", "BASE · This morning",
     "Train today?|*It says: steady.",
     "Readiness 68. Recovery high, heart normal, sleep strong. Train as planned.", "Read your morning",
     [vis(A + "base.png", [0.02, 0.165, 0.98, 0.425], 952)],
     "BASE's readiness card: 68 in a ring, READINESS Steady, 'Train as planned.', with RECOVERY High, HEART Normal, SLEEP Strong.",
     "A morning answer in plain words, worked out on the phone from Apple Health.",
     ["Readiness 68, Steady", "Recovery high, heart normal, sleep strong", "Scored on the phone"])

post("sleep-score", "BASE: sleep", "feature", "lime", "BASE · Last night",
     "Last night: 88.|*And here's why.",
     "8h 16m against a 6h 30m target. Bed at 22:07, 27 minutes later than usual. Plain words, not jargon.", "Read your night",
     [vis(A + "sleep.png", [0.0, 0.165, 1.0, 0.553], 760)],
     "The SLEEP screen: 88, Strong, '8h 16m. Plenty of hours, a few wake-ups.', then WHAT MADE THE SCORE: Time asleep full marks (8h 16m, target 6h 30m) and Regular bedtime good (22:07, 27m later than usual).",
     "A sleep score that shows its working.",
     ["Sleep score 88, Strong", "8h 16m asleep against a 6h 30m target", "Bed at 22:07, 27m later than usual"])

post("fills-itself", "BASE: zero input", "hook", "bone", "BASE",
     "BASE fills itself.|*Zero input.",
     "Steps 4,067 of 5,000. Active energy 674 of 600. Apple Health already knows; Sealed just reads it.", "Earn the close",
     [vis(A + "base.png", [0.0, 0.625, 1.0, 0.915], 952)],
     "BASE's signals: 3 of 6 hit, a red ring for STEPS at 4,067 of 5,000 and a lime ring for ACTIVE ENERGY at 674 of 600 kcal, +74.",
     "The third arc needs nothing from you. It reads what Apple Health has.",
     ["Steps 4,067 of 5,000", "Active energy 674 of 600 kcal", "3 of 6 signals hit so far today", "Signals you can choose: steps, sleep, active energy, rings, stand hours, water"])

post("seven-nights", "BASE: history", "feature", "lime", "BASE · Last 7 days",
     "Seven nights.|*Seven hits.",
     "Sleep averaged 8.2 hours against a 6.5 target. Steps hit 7 of 7 too: 11,281 a day.", "See your week",
     [vis(A + "base-week.png", [0.0, 0.445, 1.0, 0.835], 880)],
     "BASE turned over to its history, LAST 7 DAYS: SLEEP HIT 7 OF 7 with an 8.2 average of 6.5 hrs, STEPS HIT 7 OF 7 averaging 11,281 of 5,000, ACTIVE ENERGY HIT 6 OF 7 averaging 687 of 600 kcal.",
     "Every signal's week as bars against your own target.",
     ["Sleep hit 7 of 7, average 8.2 of 6.5 hrs", "Steps hit 7 of 7, average 11,281 of 5,000", "Active energy hit 6 of 7, average 687 of 600 kcal"])

post("what-to-do", "BASE: what to do with it", "feature", "bone", "BASE · Readiness",
     "A score is no use|*without a next step.",
     "Readiness 68, steady. Train: today's session stands. Tonight: bed by 21:42 keeps tomorrow steady.", "Read your morning",
     [vis(A + "readiness.png", [0.045, 0.172, 0.955, 0.41], 800, r=40), vis(A + "readiness.png", [0.045, 0.798, 0.955, 0.928], 800, r=40)],
     "The READINESS screen: 68, Steady, 'Train as planned.' on a scale from Ease off to Push, and WHAT TO DO WITH IT: 'Train · today's session stands.' and 'Tonight · bed by 21:42 keeps tomorrow steady.'",
     "Readiness ends in an instruction you can act on.",
     ["Readiness 68, Steady", "Train: today's session stands", "Tonight: bed by 21:42 keeps tomorrow steady"])

# ── The wall, the week, the run ───────────────────────────────────────────────────────────────────────────────────
post("the-wall", "The wall", "honest", "wax", "The wall",
     "Every seal kept.|*Honest gaps included.",
     "Streak 4, best 11, 2 mended. Gold rings mark the days that beat the plan.", "Build your wall",
     [vis(A + "wall.png", [0.0, 0.148, 1.0, 0.655], 700)],
     "THE WALL: SEALED STREAK 4, BEST 11, 2 MENDED, this week's seals, the run's marks 7 to 365, and NOVEMBER 2026 as a calendar of wax seals with one dashed mended day and one gold-ringed day.",
     "History you can't rewrite: every sealed night, the gaps, and the days mended.",
     ["Sealed streak 4, best 11", "2 days mended", "One missed day a week can be mended", "Gold-ringed days beat the plan"])

post("this-week", "This week", "feature", "wax", "This week",
     "One week.|*One honest screen.",
     "4 of 5 sealed. 5 workouts. TRAIN at 93%. 20.0k kg moved.", "See your week",
     [vis(A + "week.png", [0.0, 0.148, 1.0, 0.428], 952)],
     "THIS WEEK: four seals reading 93, 98, 88 and 98, then tiles for 4/5 SEALED, 5 WORKOUTS, 93% TRAIN and 20.0k KG VOLUME.",
     "A week on one screen, with nothing rounded up.",
     ["4 of 5 days sealed", "5 workouts", "TRAIN 93%", "20.0k kg volume", "Daily seals: 93, 98, 88, 98"])

post("thirty-nights", "The run: a milestone", "hook", "gold", "The run",
     "30 nights|*in a row.",
     "Hold a month and the app stops to mark it. Then: keep going.", "Start your run",
     [vis(A + "milestone.png", [0.08, 0.19, 0.92, 0.665], 600)],
     "The milestone screen: a large crimson seal with a silver ring, 30, NIGHTS IN A ROW.",
     "The run is marked when it's earned.",
     ["30 nights in a row", "A month's run turns the badge silver"], headMax=96)

post("metals", "The run: metals", "feature", "gold", "The run",
     "Brass at a week.|*Gold at three months.",
     "Bronze at 14, silver at 30, platinum at 60. The badge changes metal as the run grows.", "Start your run",
     [vis(A + "streak.png", [0.27, 0.282, 0.73, 0.350], 400),
      vis(A + "streak.png", [0.27, 0.612, 0.73, 0.680], 400),
      vis(A + "streak.png", [0.27, 0.777, 0.73, 0.845], 400),
      vis(A + "streak2.png", [0.27, 0.282, 0.73, 0.350], 400),
      vis(A + "streak2.png", [0.27, 0.447, 0.73, 0.515], 400)],
     "The app's Sealed Streak badge at five marks, stacked: 7 in brass, 14 in bronze, 30 in silver, 60 in platinum, 90 in gold.",
     "A streak that changes material as it grows.",
     ["Brass at 7 nights", "Bronze at 14", "Silver at 30", "Platinum at 60", "Gold at 90"], gap=22)

post("the-habit", "Progress: the habit", "feature", "wax", "The habit",
     "You press|*at about nine.",
     "Seals by weekday: Wednesday most. The wax goes down around 21:00. Your routine, drawn honestly.", "See your habit",
     [vis(A + "habit-all.png", [0.0, 0.435, 1.0, 0.945], 640)],
     "Progress, THE HABIT: SEALS BY WEEKDAY bars with WED MOST, and WHEN THE WAX IS PRESSED, a single sharp peak at about 21:00.",
     "The app shows the shape of your routine as well as the result.",
     ["Wednesday is the most-sealed weekday", "The wax is usually pressed around 21:00"])

# ── The pact ──────────────────────────────────────────────────────────────────────────────────────────────────────
post("streaks-take-two", "The pact", "pact", "pact", "The pact",
     "Some streaks|*take two.",
     "Day 13 with Alex. The pact only moves on the nights you both hold the day. Pact 4, best 4.", "Make a pact",
     [vis(A + "pact.png", [0.0, 0.148, 1.0, 0.535], 840)],
     "THE PACT: you and Alex, DAY 13 OF THE DUEL SINCE 1 NOV, PACT 4 · BEST 4, and two rows of nightly seals: yours 98, 65, 93, 98, 88, 98 and Alex's 86, 100, 91, 68, 94.",
     "Two people, one streak. It advances only when both of you seal.",
     ["Day 13 of the pact", "Pact streak 4, best 4", "The pact streak moves only when both hold the day (80% or more)"])

post("a-nose-in-front", "The pact: the duel", "pact", "pact", "The duel",
     "A nose in front.|*Never “you lost”.",
     "83–75 since day one, and Alex is near enough to hear you. Competitive, and always kind.", "Make a pact",
     [vis(A + "pact.png", [0.045, 0.314, 0.955, 0.382], 952, r=30), vis(A + "pact.png", [0.045, 0.549, 0.955, 0.73], 952, r=40)],
     "The duel: a banner reading 'A NOSE IN FRONT · 83–75 · ALEX'S NEAR ENOUGH TO HEAR YOU' and THE SCORE SINCE DAY ONE, 83 for you and 75 for Alex, THIS WEEK 95–88, WEEKS YOU 2, ALEX 0.",
     "A head-to-head that never uses loser language.",
     ["Score since day one: 83 to 75", "This week 95 to 88", "Weeks: you 2, Alex 0", "The duel is optional and always worded kindly"])

# ── Price, widgets, the idea ──────────────────────────────────────────────────────────────────────────────────────
post("price", "The price", "feature", "lime", "The price",
     "£3.99 a month.|*7 days free.",
     "One plan, everything included. A reminder on day 5, before it bills. Cancel any time.", "Try 7 days",
     [vis(A + "paywall.png", [0.03, 0.118, 0.97, 0.675], 560)],
     "The app's own offer page: 7 DAYS FREE, 'Then £3.99 a month. Cancel any time.', a timeline TODAY everything free, DAY 5 we remind you before it bills, DAY 7 £3.99 a month begins, and START MY FREE WEEK.",
     "One price, said plainly, with a reminder before it bills.",
     ["£3.99 a month, 7-day free trial", "One plan, everything included", "A reminder on day 5, before it bills", "Everything you sealed stays on your phone either way"])

post("widgets", "Widgets", "feature", "gold", "Widgets",
     "The seal, on|*your home screen.",
     "Sealed, 100%, gold. Run 5, best 11. 6 of 6 signals hit and 20.0 T lifted this week.", "Add the widget",
     [vis("widgets/widget-seal.png", FULL, 296, x=64, r=44), vis("widgets/widget-base-medium.png", FULL, 634, x=382, beside=True, r=44),
      vis("widgets/widget-week.png", FULL, 634, x=64, r=44), vis("widgets/widget-work.png", FULL, 296, x=720, beside=True, r=44)],
     "Four of the app's widgets: THE SEAL reading SEALED 100% GOLD, RUN 5 NEXT 7; THE BASE with 6/6 SIGNALS; THIS WEEK with seals 94, 99, 88, 99, 100, RUN 5 BEST 11; THE WORK with 20.0 T LIFTED THIS WEEK.",
     "The day's state without opening the app.",
     ["Seal widget: sealed, 100%, gold; run 5, next mark 7", "BASE widget: 6 of 6 signals", "Week widget: 94, 99, 88, 99, 100; run 5, best 11", "Work widget: 20.0 T lifted this week", "Lock-screen widgets too"])

post("wont-let-you-lie", "The idea", "honest", "wax", "Earn the close",
     "The app that|won't let you|*lie to yourself.",
     "No retro-edits. No streak you didn't earn. One wax seal a night, only as full as the day.", "Earn the close",
     [],
     "A text card: the headline over three short lists headed Honest by design, Kind by design and Private by design.",
     "The founding idea: a tracker you can't argue with, that is still kind.",
     ["Sealed days lock forever", "80% holds the day and the run", "Scheduled rest days seal by design", "One missed day a week can be mended",
      "Everything lives on the phone: no ads, no tracking, no email address"],
     pills=[dict(x=64, y=690, w=940, color="#F26472", items=["#Honest by design", "Sealed days lock forever", "No retro-edits", "80% holds the day"]),
            dict(x=64, y=820, w=940, color="#C6F24A", items=["#Kind by design", "Rest days seal by design", "One mend a week", "No loser language"]),
            dict(x=64, y=950, w=940, color="#E6DFD3", items=["#Private by design", "On the phone", "No ads", "No tracking", "No email address"])],
     headMax=104)


def main():
    spec = {"sources": "sources", "out": "2026-11-launch", "brand": BRAND, "posts": POSTS}
    json.dump(spec, open(os.path.join(HERE, "posts.json"), "w"), indent=1, ensure_ascii=False)
    print(len(POSTS), "posts")


if __name__ == "__main__":
    main()
