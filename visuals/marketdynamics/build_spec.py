#!/usr/bin/env python3
"""Builds visuals/marketdynamics/posts.json. Crops are given in contact-sheet tile units (390 x 847 per phone screen)."""
import json, os

OUT = os.path.expanduser("~/Seans_Projects/Auto_Social/visuals/marketdynamics/posts.json")
TW, TH = 390.0, 847.0
GOLD = "rgba(235,199,94,.38)"

brand = {
    "name": "MarketDynamics", "field": "#07080C", "mark": "mark.png", "wordmark": ["Market", "Dynamics"],
    "accentText": "#EBC75E", "url": "On the App Store", "cta": ["#C9972B", "#EBC75E", "#F7DD8A"],
    "defaultCta": "Get the Read", "defaultWash": "gold",
    "fine": "Real screens from the app, on live and past gold data. Analysis and education, not advice or signals. Trading can lose money.",
    "washes": {
        "gold":   {"bloom1": "rgba(201,151,43,.85)", "bloom2": "rgba(138,100,20,.7)",  "ink": "#EBC75E", "glow": GOLD},
        "amber":  {"bloom1": "rgba(214,110,30,.8)",  "bloom2": "rgba(201,151,43,.5)",  "ink": "#FDB37A", "glow": GOLD},
        "teal":   {"bloom1": "rgba(20,150,138,.8)",  "bloom2": "rgba(201,151,43,.45)", "ink": "#5EEAD4", "glow": GOLD},
        "blue":   {"bloom1": "rgba(52,106,210,.8)",  "bloom2": "rgba(201,151,43,.45)", "ink": "#8EC2FF", "glow": GOLD},
        "violet": {"bloom1": "rgba(120,96,220,.8)",  "bloom2": "rgba(201,151,43,.45)", "ink": "#C4B5FD", "glow": GOLD},
        "red":    {"bloom1": "rgba(190,56,62,.8)",   "bloom2": "rgba(201,151,43,.45)", "ink": "#FF9A9A", "glow": GOLD},
    },
}


def V(src, y0, y1, w=952, x=None, y=480, x0=14, x1=376, r=34, **kw):
    v = {"src": f"ios/{src}.png", "crop": [round(x0 / TW, 4), round(y0 / TH, 4), round(x1 / TW, 4), round(y1 / TH, 4)],
         "w": w, "x": (1080 - w) // 2 if x is None else x, "y": y, "r": r}
    v.update(kw)
    return v


def C(text, sub, x, y, at, **kw):
    c = {"text": text, "sub": sub, "x": x, "y": y, "at": at}
    c.update(kw)
    return c


posts = []


def P(slug, feature, pillar, wash, kicker, headline, sub, cta, visuals, shows, angle, facts, callouts=None, **kw):
    p = {"id": f"{len(posts) + 1:02d}", "slug": slug, "feature": feature, "pillar": pillar, "wash": wash, "kicker": kicker,
         "headline": headline, "sub": sub, "cta": cta, "visuals": visuals, "callouts": callouts or [],
         "shows": shows, "angle": angle, "facts": facts}
    p.update(kw)
    posts.append(p)


PS, ED = "Product Showcase", "Educational Principles"
PRICE = "Gold Monthly is £16.99/month, cancel anytime. On iPhone and iPad"
PAT20 = "20 chart patterns: triangles, wedges, rectangles, flags and pennants, double and triple tops and bottoms, head and shoulders, harmonics (Gartley, Bat, Butterfly, Crab), trendline breaks"
HIST = "A past example on gold, drawn by the app's own chart"


def chart(i, **kw):
    """A pattern example chart card from the gallery, centred."""
    a = dict(w=770, y=446, r=40)
    a.update(kw)
    return V(f"p2-{i}", 178, 506, **a)


# ---------------------------------------------------------------- The Read
P("daily-read", "The Daily Read", PS, "amber", "The Daily Read",
  "Where gold stands,|*before London opens.",
  "Bias, strength out of 100, the live price and how much of the day's range is left.",
  "Get the Read",
  [V("today", 98, 560, y=478)],
  "The Today screen: a dial reading Bearish 36/100, moderate lean, beside the live XAUUSD price and the day range, with the written Read under it.",
  "One screen tells you where gold stands before the London open.",
  ["Bias Bearish, strength 36 out of 100, moderate lean", "Day range: 38 of 85 left, 56% used so far", "The Read lands every weekday before London opens", PRICE],
  bottomScrim=330)

P("read-paragraph", "The Daily Read: the written read", PS, "amber", "Today",
  "The whole day|*in one paragraph.",
  "2 of 3 drivers agreeing, the range left, the live H4 zone and the red news to watch.",
  "Get the Read",
  [V("today-28", 140, 280, y=478), V("today-28", 640, 702, y=872)],
  "The written Read on the Today screen: a moderate bearish lean with 2 of 3 drivers agreeing, 38 of the 85 average range left, the H4 sell zone 3,957-3,974 live and Core PPI at 13:30, with the H4 trade idea row under it.",
  "The morning's context written out in plain English, so you start the day with a plan.",
  ["2 of 3 drivers agreeing", "38 of the 85 average range is left", "H4 sell zone 3,957-3,974", "Event day: Core PPI m/m at 13:30", "The app marks areas of interest. It does not give buy or sell calls"],
  bottomScrim=300)

P("behind-the-bias", "What's behind the bias", ED, "amber", "The bias, explained",
  "Why, not|*just what.",
  "Regime, macro and positioning each get a verdict. Here, 2 of 3 agree.",
  "See the why",
  [V("today-bottom", 160, 348, y=470)],
  "The 'What's behind the bias' row: Regime bearish and Macro bearish both marked Agrees, Positioning bullish marked Against, '2 of 3 agree', with the H4 trade idea under it.",
  "A bias you can check: you see which drivers agree and which one does not.",
  ["2 of 3 agree", "Regime bearish, macro bearish, positioning bullish", "The bias is built from the regime, macro and positioning"],
  callouts=[C("The one that disagrees", "shown, not hidden", 600, 965, [815, 700], mw=330)])

P("regime-card", "Market regime", ED, "blue", "The regime",
  "What kind of|*market is this?",
  "Four regimes, read from 14 cross-asset pairs, and what each one means for gold.",
  "Read the regime",
  [V("today-40", 244, 462, y=478)],
  "The Market regime card: Deflationary risk-off, with the odds bar On 10%, Defl 19%, Infl 25%, Liq 46%, a note that liquidation leads today on day 1 of 2 to confirm, and the balance for gold.",
  "Gold behaves differently in each regime, so the app tells you which one you are trading in.",
  ["Regime: deflationary risk-off", "Odds: risk-on 10%, deflationary 19%, inflationary 25%, liquidation 46%", "On the day shown, liquidation led, day 1 of 2 to confirm", "The regime is read from 14 cross-asset pairs"],
  bottomScrim=300)

P("which-regime", "Regime sheet", ED, "blue", "Which regime?",
  "It needs 2 days|*to change its mind.",
  "A challenger must lead on 2 readings in a row, so a one-day swing can't flip the regime.",
  "Read the regime",
  [V("regime", 116, 368, y=478)],
  "The 'Which regime?' sheet: deflationary risk-off confirmed at 19%, liquidation leading at 46% on day 1 of 2 to confirm, and the rule that the name only changes after a challenger leads on 2 readings in a row.",
  "The regime call is built to be steady: no flip-flopping on one noisy day.",
  ["Deflationary risk-off 19%, confirmed regime", "Liquidation 46%, leading on the day shown, day 1 of 2 to confirm", "The name only changes once a challenger leads on 2 readings in a row"],
  bottomScrim=280)

P("whats-changed", "What's changed this month", ED, "amber", "Drivers",
  "What changed|*this month?",
  "Liquidation rose from 38% to 46%. The app names the drivers behind the shift.",
  "Check the drivers",
  [V("drivers-30", 196, 495, y=478)],
  "The 'What's changed this month' card: liquidation rose from 38% to 46%, with inflation expectations and bond prices turned in gold's favour and the yield curve and real yields pushing back, each with its share of the change.",
  "You see what moved the backdrop for gold, not just that it moved.",
  ["Liquidation rose from 38% to 46%", "Turned in gold's favour: inflation expectations, bond prices", "Pushing back: the yield curve, real yields"],
  bottomScrim=300)

P("regime-odds", "How the odds have moved", PS, "amber", "The regime, over time",
  "Watch the regime|*shift.",
  "How the odds of each regime have moved, day by day, with the latest change named.",
  "Read the regime",
  [V("drivers-55", 260, 428, y=478), V("drivers-80", 193, 420, y=940)],
  "The 'How the odds have moved' chart: a stacked area of the four regime odds from August to November, captioned 'Over the last month, Liquidation rose from 38% to 46%', with the gold direction list beneath.",
  "A regime is not a switch. You can watch one build before it takes over.",
  ["Over the last month, liquidation rose from 38% to 46%", "Four regimes: risk-on, deflationary risk-off, inflationary risk-off, liquidation"],
  bottomScrim=300)

P("gold-direction", "Gold direction board", PS, "amber", "Drivers",
  "Supportive,|*or a headwind?",
  "Real yields, bonds, oil, inflation and the curve, each marked for gold. Today: 2 supportive, 3 headwind.",
  "Check the drivers",
  [V("drivers-80", 193, 530, y=518)],
  "The Gold direction card: real yields and bond prices marked Headwind, oil and inflation expectations Supportive, the yield curve Headwind, gold vs silver Neutral, headed '2 supportive, 3 headwind'.",
  "Every driver of gold marked in plain words, so you know what is with you and what is against you.",
  ["2 supportive, 3 headwind", "Real yields 10y: rising fast, headwind", "Oil WTI: edging down, supportive", "Inflation expectations: falling fast, supportive"],
  bottomScrim=290)

# ---------------------------------------------------------------- Technicals
# Posts from here to the end of Patterns use captures from the 2.0.1 build (t2-*, p2-*): one blue ink, soft fill,
# dotted projection to the target, dashed while Possible.
P("technical-picture", "Technical picture", PS, "teal", "Technicals",
  "The chart,|*read for you.",
  "D1, H4 and H1 trend from swing structure, in one verdict, with the break drawn on.",
  "See the chart",
  [V("t2-levels", 150, 640, y=470)],
  "The Technicals screen: a 'Downtrend' verdict with D1, H4 and H1 chips, a plain-English summary, and the H4 candle chart with swing labels, the buy target band and the break marked under it.",
  "The trend on three timeframes read from structure, before you draw a single line.",
  ["Technical picture: downtrend. D1 down, H4 sideways, H1 down", "Price is below its 10, 20 and 50-day averages", "On H4, price broke below the last higher low at 3,895"],
  bottomScrim=300)

P("h4-chart", "H4 chart with zones", PS, "teal", "The H4 chart",
  "Every level,|*already drawn.",
  "Swings, zones, the break of structure and live price on one chart.",
  "See the chart",
  [V("t2-levels-12", 120, 480, w=830, y=462, r=40)],
  "The H4 gold chart in the app: candles from 4,150 down to 3,850, swing points labelled HH and LL, a sell zone and a buy zone shaded, 'Buy target 1 3,960.8', 'Broke 3,895' and 'Buy stop 3,875.0' marked, and live price at 3,898.3.",
  "The morning markup done for you: structure, zones and levels on the chart when you open it.",
  ["H4 chart, 5 day view", "Buy target 1 at 3,960.8", "Broke 3,895", "The chart also switches to H1, and to a flowing line"],
  bottomScrim=240)

P("sell-zone", "Zones: a trade idea", ED, "teal", "Zones",
  "Areas of interest,|*not signals.",
  "A zone with its stop and two targets. You wait for price, then apply your own entry.",
  "See the zones",
  [V("t2-levels-40", 170, 352, y=478)],
  "A Sell idea card marked 'Qualifies today': zone 3,957-3,974, 59 points above price, stop 3,991.0, target 1 3,895.4, target 2 3,874.0, with the note to wait for price to reach the zone and an H4 candle to close back out below it.",
  "The app marks where to pay attention. The trader still decides.",
  ["Sell zone 3,957-3,974, 59 pts above price", "Stop 3,991.0, target 1 3,895.4, target 2 3,874.0", "Wait for price to reach the zone, then an H4 candle that closes back out below it", "Zones on M30, H4 and D1"],
  bottomScrim=300)

P("why-this-zone", "Why this zone", ED, "teal", "Why this zone",
  "Four reasons|*for one zone.",
  "Zones are built where structure clusters. Tap one to see what built it.",
  "See the zones",
  [V("t2-levels-40", 170, 252, y=478), V("t2-levels-40", 402, 480, y=712)],
  "The sell zone 3,957-3,974 with its 'Why this zone' chips: pair resistance H4 3960.8, ADR exhaustion 3961.9, pivot R1 3967.1 and swing high H4 3970.9.",
  "A zone is not a guess. It is where several levels sit on top of each other.",
  ["Sell zone 3,957-3,974", "Built from: pair resistance H4 3960.8, ADR exhaustion 3961.9, pivot R1 3967.1, swing high H4 3970.9"],
  callouts=[C("4 levels in 17 points", "that cluster is the zone", 470, 1010, [400, 880], mw=350)])

P("structure-ladder", "Structure: levels near price", PS, "teal", "Structure",
  "Every level|*near price.",
  "Pivots, swings, ranges and prior highs and lows, ranked, with the distance in points.",
  "See the levels",
  [V("structure", 256, 696, w=860, y=470)],
  "The Structure sheet: a ladder of levels around live price 3,888.32, from Pivot R1 3,967.1 above to the prior day and week low 3,852.4 below, with confluence tags and the distance to each in points.",
  "Know what sits above and below price before you plan a trade.",
  ["Live price 3,888.32", "Above: pivot R1 3,967.1, ADR exhaustion and pair resistance 3,961.9, daily pivot 3,909.8", "Below: range low H4 3,874.0, swing low H4 3,870.1, prior day and week low 3,852.4"],
  bottomScrim=260)

P("h1-chart", "H1 chart with a forming pattern", PS, "teal", "H1 on tap",
  "Zoom in to|*the hourly.",
  "One tap to H1. The trendline forming there is drawn, target 4,031.",
  "See the chart",
  [V("t2-levels-h1-12", 118, 500, w=800, y=462, r=40)],
  "The Technicals chart switched to H1: hourly candles stepping down with swing labels, a falling trendline drawn in blue with a dotted projection to 'Target 4,031', 'Broke 3,870' marked, the buy target band at 3,960.8, and a 'Falling trendline, Forming' chip under the chart.",
  "The same read on the timeframe you actually trade from, with the pattern forming on it drawn for you.",
  ["H1 chart, 5 day view", "A falling trendline is forming on H1, target 4,031", "Broke 3,870", "Buy target 1 at 3,960.8", "The chart shows H4 or H1, as candles or a flowing line"],
  bottomScrim=200)

# ---------------------------------------------------------------- Patterns
P("patterns-grid", "Pattern detection", PS, "blue", "Pattern detection",
  "20 patterns.|*Spotted for you.",
  "Drawn on the gold chart, each with its stop and its target.",
  "Spot patterns",
  [V("p2-3", 178, 512, w=466, x=64, y=452, r=28), V("p2-30", 178, 512, w=466, x=550, y=452, r=28),
   V("p2-15", 178, 512, w=466, x=64, y=898, r=28), V("p2-37", 178, 512, w=466, x=550, y=898, r=28)],
  "Four gold charts from the app, each with a pattern drawn on it in blue with a shaded fill: a double bottom, a falling wedge, an inverse head and shoulders and a Gartley, each with its stop line and a dotted path to its target.",
  "The app watches the chart for patterns so you do not have to stare at it.",
  [PAT20, "Each pattern shows where it confirms, its target and its stop", "Shown: double bottom, falling wedge, inverse head and shoulders, Gartley", HIST],
  bottomScrim=250)

P("double-bottom", "Pattern: double bottom", PS, "blue", "Patterns · double bottom",
  "Two lows.|*One neckline.",
  "Drawn on H4 with its target at 4,561 and its stop at 4,302.",
  "Spot patterns",
  [chart(3)],
  "An H4 gold chart with a double bottom drawn on it in blue: Bottom 1 and Bottom 2 near 4,310 with the shaded shape between them, the neckline above, the stop at 4,302 and a dotted path to the target at 4,561, with price running up through the target.",
  "A textbook pattern, found and measured by the app.",
  ["Double bottom on H4, 19 Aug 2026", "Broke the neckline at 4,436, target 4,561, stop 4,302", HIST, PAT20],
  bottomScrim=240)

P("inverse-head-shoulders", "Pattern: inverse head and shoulders", PS, "blue", "Patterns · head and shoulders",
  "Left. Head. Right.|*Drawn for you.",
  "The inverse kind, on H4. Target 3,393, stop 3,322.",
  "Spot patterns",
  [chart(15)],
  "An H4 gold chart with an inverse head and shoulders drawn on it in blue: the left shoulder, head and right shoulder shaded under a falling neckline, the stop at 3,322 and a dotted path to the target at 3,393, with price climbing through the target.",
  "The shape most traders spot too late, marked as it completes.",
  ["Inverse head and shoulders on H4, 22 Aug 2025", "Broke at 3,348, target 3,393, stop 3,322", HIST, PAT20],
  bottomScrim=230)

P("head-shoulders", "Pattern: head and shoulders", PS, "red", "Patterns · the bearish ones",
  "It spots the|*tops too.",
  "A head and shoulders on H4. Target 2,027, stop 2,081.",
  "Spot patterns",
  [chart(12)],
  "An H4 gold chart with a head and shoulders top drawn on it in blue: the head at the high with a shoulder either side, a rising neckline, the stop at 2,081 above and a dotted path to the target at 2,027 below, with price falling to the target.",
  "Bullish or bearish, the app draws what the chart is doing.",
  ["Head and shoulders on H4, 2 Jan 2024", "Broke at 2,061, target 2,027, stop 2,081", HIST, PAT20],
  bottomScrim=240)

P("falling-wedge", "Pattern: falling wedge", PS, "blue", "Patterns · wedges",
  "A falling wedge.|*Then the turn.",
  "Drawn on H4 with both lines. Target 5,215, stop 4,829.",
  "Spot patterns",
  [chart(30)],
  "An H4 gold chart with a falling wedge drawn on it in blue: two falling lines closing in on price with the wedge shaded between them, the stop at 4,829 below and a dotted path to the target at 5,215, with price breaking up and out to the target.",
  "Wedges are drawn with both lines, so you can see the squeeze and the break.",
  ["Falling wedge on H4, 18 Feb 2026", "Broke at 4,958, target 5,215, stop 4,829", "Rising and falling wedges are both detected", HIST],
  bottomScrim=240)

P("gartley", "Pattern: Gartley harmonic", PS, "blue", "Patterns · harmonics",
  "X, A, B, C, D.|*Measured for you.",
  "A Gartley on H4. Target 4,400, stop 4,265.",
  "Spot patterns",
  [chart(37)],
  "An H4 gold chart with a Gartley harmonic drawn on it in blue: points X, A, B, C and D joined as two shaded triangles, a dotted path to the target at 4,400 and the stop at 4,265.",
  "Harmonics take a ruler and patience. The app does the measuring.",
  ["Gartley on H4, 10 Sep 2026", "Completed at 4,331, target 4,400, stop 4,265", "Four harmonics detected: Gartley, Bat, Butterfly, Crab", HIST],
  bottomScrim=240)

P("bat-butterfly", "Pattern: Bat and Butterfly", PS, "blue", "Patterns · harmonics",
  "A Bat.|*And a Butterfly.",
  "Same five points, different ratios. The app names each one.",
  "Spot patterns",
  [V("p2-40", 153, 660, w=466, x=64, y=452, r=28), V("p2-43", 153, 660, w=466, x=550, y=452, r=28)],
  "Two H4 gold charts side by side: a Bat with target 4,134 and stop 4,055, and a Butterfly with target 1,827 and stop 1,798, each with its X, A, B, C, D points drawn in blue and a 'Confirmed' pattern card under it.",
  "Harmonic patterns named and levelled, with no manual measuring.",
  ["Bat on H4, 14 Oct 2026: target 4,134, stop 4,055", "Butterfly on H4, 17 Jan 2021: target 1,827, stop 1,798", "Four harmonics detected: Gartley, Bat, Butterfly, Crab", HIST],
  bottomScrim=240)

P("trendline-break", "Pattern: trendline break", PS, "blue", "Patterns · trendlines",
  "It draws the line.|*Then watches it.",
  "A falling trendline on H4. Target 4,103, stop 3,861.",
  "Spot patterns",
  [chart(47)],
  "An H4 gold chart with a falling trendline drawn in blue from point 1 through point 2, price breaking above it, the stop at 3,861 and a dotted path to the target at 4,103, with price rallying to the target.",
  "Trendline breaks, drawn the same way every time, not by eye.",
  ["Falling trendline on H4, 3 Nov 2026", "Broke at 3,937, target 4,103, stop 3,861", HIST, PAT20],
  bottomScrim=240)

P("more-shapes", "Patterns: triple bottoms, rectangles, wedges, triangles", PS, "blue", "Patterns · more shapes",
  "Wedges. Rectangles.|*Triple bottoms.",
  "Bullish or bearish, each drawn with its stop and its target.",
  "Spot patterns",
  [V("p2-9", 178, 512, w=466, x=64, y=452, r=28), V("p2-33", 178, 512, w=466, x=550, y=452, r=28),
   V("p2-28", 178, 512, w=466, x=64, y=898, r=28), V("p2-22", 178, 512, w=466, x=550, y=898, r=28)],
  "Four H4 gold charts from the app, each with a pattern drawn in blue: a triple bottom, a rectangle, a rising wedge and a descending triangle, each with its stop line and a dotted path to its target.",
  "More shapes than most traders can hold in their head, all checked on every bar.",
  ["Shown: triple bottom, rectangle, rising wedge, descending triangle", PAT20, "Each pattern shows where it confirms, its target and its stop", HIST],
  bottomScrim=250)

P("pattern-forming", "Patterns: Possible to Confirmed", ED, "blue", "Possible · Forming · Confirmed",
  "Dashed is possible.|*Solid is confirmed.",
  "Every pattern carries its status, and the price that would confirm it.",
  "Spot patterns",
  [V("p2-29", 153, 660, w=466, x=64, y=452, r=28), V("p2-27", 153, 660, w=466, x=550, y=452, r=28)],
  "Two H4 gold charts side by side, each with a rising wedge: on the left the wedge is drawn with dashed lines and its card reads 'Possible', confirms at 4,024; on the right the lines are solid and the card reads 'Confirmed', broke at 4,516, with price falling to the target.",
  "The honest part of pattern detection: the app tells you how far along a pattern is, and what has to happen next.",
  ["Possible rising wedge on H4: confirms at 4,024, target 3,838, stop 4,173", "Confirmed rising wedge on H4: broke at 4,516, target 4,393, stop 4,587", "Statuses: Possible, Forming, Confirmed. Possible patterns draw dashed", "A confirmed pattern waits for the bar to close", HIST],
  bottomScrim=240)

P("pattern-alerts", "Pattern alerts", PS, "blue", "Pattern alerts",
  "A pattern forms.|*Your phone tells you.",
  "Switch on H4 patterns, H1 patterns, or both. No chart-watching needed.",
  "Set alerts",
  [V("alerts", 210, 308, y=478), V("p2-24", 178, 506, w=640, y=760, r=32)],
  "The Alerts sheet with the 'H4 patterns' toggle on and the 'H1 patterns' toggle off, above an H4 gold chart with a symmetrical triangle drawn on it in blue and a dotted path to its target.",
  "You do not need to watch the chart to catch a pattern.",
  ["Alerts for H4 patterns and H1 patterns", "Other alerts: the morning Read, regime changes, price near a zone, red news in 15 minutes", "Chart shown: a symmetrical triangle on H4", HIST],
  bottomScrim=280)

# ---------------------------------------------------------------- Macro, positioning
P("macro-for-gold", "Macro for gold", ED, "blue", "Macro",
  "What's pulling|*on gold?",
  "Real yields carry 50% of the macro read, the dollar 30%. Each one marked for gold.",
  "Check the drivers",
  [V("macro-pane", 210, 470, y=478)],
  "The Macro for gold card: 'Headwind for gold', real yields rising at 50% of macro, the dollar edging up at 30%, inflation expectations falling at 10% and oil edging down at 10%, each marked headwind or supportive.",
  "The macro picture weighted by what actually matters for gold.",
  ["Macro: headwind for gold. Real yields are rising, the biggest pull", "Weights: real yields 50%, dollar 30%, inflation expectations 10%, oil 10%"],
  bottomScrim=290)

P("macro-data", "Macro data sheet", PS, "blue", "The data",
  "Real yields to|*funding stress.",
  "The series that move gold, each with its trend. Shown here: the 10-year real yield at 2.78%.",
  "Check the drivers",
  [V("macro-sheet", 153, 600, y=478)],
  "The Macro sheet: the 10-year real yield at 2.78% with its trend chart, then rows with sparklines for the 10y breakeven 2.24%, the 2s10s curve +24 bp, the broad dollar 121.9, Fed funds 3.88%, oil and the 2y yield.",
  "The macro dashboard a gold trader would otherwise build across five websites.",
  ["Real yield 2.78%", "10y breakeven 2.24%, 2s10s curve +24 bp, broad dollar 121.9, Fed funds effective 3.88%", "Also: oil, the 2y yield, gold, oil and rates volatility, funding stress"],
  bottomScrim=300)

P("volatility", "Volatility and stress", ED, "blue", "Volatility",
  "Gold has its own|*volatility index.",
  "The app reads it alongside oil and bond volatility and funding stress. Gold volatility: 25.9.",
  "Check the drivers",
  [V("macro-pane-bottom", 486, 730, y=518)],
  "The Volatility and stress card: gold volatility 25.9, oil volatility 51.7, bond volatility 14.1 and funding stress -0.2, each marked Normal with its change this week and this month.",
  "Volatility tells you what kind of day to expect before it starts.",
  ["Gold volatility 25.9, oil volatility 51.7, bond volatility 14.1, funding stress -0.2", "The app reads gold's volatility index (GVZ) to flag likely trend days and range days"],
  bottomScrim=280)

P("cot-positioning", "COT positioning", ED, "violet", "Positioning",
  "Who's long,|*who's short.",
  "The weekly CFTC report, read for you. On this one, large speculators were net long +171.4k.",
  "See positioning",
  [V("cot", 210, 512, w=860, y=478)],
  "The Speculators in gold card: 'Supportive for gold', large speculators holding a few fewer longs than usual at the 35th percentile of the year, a slider from few longs to crowded, and net long +171.4k, longs 212.6k, shorts 41.2k.",
  "Positioning tells you how much fuel is left in a move.",
  ["Net long +171.4k, longs 212.6k, shorts 41.2k", "35th percentile of the year: not washed out, slight support", "COT covers large speculators, commercials and small traders"],
  bottomScrim=270)

P("cot-six-months", "COT: last six months", PS, "violet", "Positioning",
  "8 weeks of|*cutting longs.",
  "On this report, speculators had cut their net long for 8 weeks in a row. The app counts the streaks.",
  "See positioning",
  [V("cot-50", 256, 506, y=518)],
  "The 'Last six months' chart of speculators' net long in gold, week by week, with notes: net long cut for 8 weeks in a row (-52.5k), shorts grown for 2 weeks (+6.8k), longs closed for 3 weeks (-22.7k).",
  "A single week of COT says little. The trend says a lot.",
  ["Net long cut for 8 weeks in a row (-52.5k)", "Shorts have grown for 2 weeks (+6.8k)", "Longs have been closed for 3 weeks (-22.7k)"],
  bottomScrim=270)

P("cot-other-markets", "COT: other markets", ED, "violet", "Positioning",
  "Crowded long.|*Crowded short.",
  "Positioning in the S&P 500, the yen and Treasuries, for the read across to gold.",
  "See positioning",
  [V("cot-50", 512, 742, y=478)],
  "The Other markets card: S&P 500 -93.9k mid-range, Japanese yen +98.6k crowded long, 10y Treasuries -935.0k crowded short, with a note that the yen haven trade is already full.",
  "Gold does not trade alone. Crowded trades elsewhere change the risk.",
  ["S&P 500 -93.9k, mid-range", "Japanese yen +98.6k, crowded long", "10y Treasuries -935.0k, crowded short"],
  bottomScrim=290)

# ---------------------------------------------------------------- News
P("red-news", "Red news calendar", PS, "red", "News",
  "Red news,|*never a surprise.",
  "The next high-impact release with its time, forecast and previous, and a countdown.",
  "Check the calendar",
  [V("news", 153, 500, y=478)],
  "The News screen: 'Next red news' Core PPI m/m at 13:30 London with forecast 0.3% and previous 0.7% and a countdown, then this week's calendar listing Core PPI and PPI at 13:30.",
  "You know when the market is likely to jump, before you size a trade.",
  ["Core PPI m/m at 13:30 London, forecast 0.3%, previous 0.7%", "The calendar covers USD high-impact releases for the week"],
  bottomScrim=300)

P("geopolitics", "Geopolitics", PS, "red", "Geopolitics",
  "The headlines|*that move gold.",
  "Each thread marked bullish, bearish or mixed for gold, and whether it is priced in yet.",
  "Read the news",
  [V("news-60", 364, 662, w=900, y=478)],
  "Two geopolitics threads in the News tab: one on attacks on Saudi oil infrastructure and the Strait of Hormuz marked Mixed, one on central banks' record gold accumulation marked Bullish, each with chips such as 'Oil: falling, not priced yet'.",
  "Not a news feed. A read on what each story means for gold.",
  ["Threads are marked bullish, bearish or mixed for gold", "Each thread is checked against what markets are doing: priced in or not priced yet"],
  bottomScrim=280)

# ---------------------------------------------------------------- Tools, record, price
P("size", "Position size", PS, "gold", "Size",
  "Risk worked|*out for you.",
  "Account and risk in, lots out. $25,000 at 0.5% risk on this zone is 0.04 lots.",
  "Size it",
  [V("size", 180, 340, w=820, y=478), V("size", 398, 602, w=820, y=830)],
  "The Size sheet for the H4 sell zone 3,957-3,974: 0.04 lots, risk $125, stop 33.5, at target 1 +$232, with the account slider at $25,000 and risk per trade at 0.5%.",
  "The zone's stop sets the size, so the maths is done before the trade.",
  ["0.04 lots for a $25,000 account at 0.5% risk", "Risk $125, stop 33.5 points", "Works in spot lots, MGC or GC"],
  bottomScrim=280)

P("alerts", "Alerts", PS, "gold", "Alerts",
  "Your levels,|*on your lock screen.",
  "The Read, regime changes, patterns, price near a zone and red news in 15 minutes.",
  "Set alerts",
  [V("alerts", 114, 505, w=820, y=478)],
  "The Alerts sheet: toggles for Today's Read is ready, Regime changes, H4 patterns, H1 patterns, Price near a trade zone and Red news in 15 minutes, with a zone distance slider at 0.25 ATR.",
  "Step away from the chart. The app tells you when something needs you.",
  ["Six alerts: the Read, regime changes, H4 patterns, H1 patterns, price near a zone, red news in 15 minutes", "Zone distance from 0.25 ATR"],
  bottomScrim=270)

P("track-record", "Track record", ED, "gold", "The record",
  "It marks its|*own homework.",
  "Every regime flip is settled afterwards as held or faded, and the record stays in the app.",
  "See the record",
  [V("record", 150, 200, y=478), V("record", 440, 740, y=628)],
  "The Track record sheet: tabs for Regime, Bias, Asia tape, Day type, Zones and Legacy, and a list of regime flips by date, each settled with a chip reading Open, Held or Faded.",
  "Analysis that grades itself in public, including the flips that faded.",
  ["Every call is graded after its session and never edited", "Regime flips are settled as held or faded", "Record tabs: regime, bias, Asia tape, day type, zones"],
  bottomScrim=280)

P("frozen", "How it works", ED, "amber", "How it works",
  "Frozen at 06:00.|*Never edited.",
  "The Read is scored at 05:35 London from three pillars, then locked for the day.",
  "Get the Read",
  [V("method", 124, 420, y=478)],
  "The 'How it works' sheet: the Read is scored every weekday at 05:35 London from three pillars, the regime, macro and positioning, shown as a strength out of 100, and frozen at 06:00, never edited.",
  "No hindsight. What the app said in the morning is what it is judged on.",
  ["Scored every weekday at 05:35 London from three pillars: regime, macro, positioning", "Strength out of 100", "The Read can be recomposed until 06:00, then it is frozen and never edited"],
  bottomScrim=290)

P("pulse", "Pulses", PS, "amber", "Pulses",
  "The Read,|*rechecked at 08:05.",
  "Through the day the app checks whether the morning read is holding, and says what moved.",
  "Get the Read",
  [V("today-bottom", 506, 734, y=478)],
  "Rows from Today's context: red news Core PPI m/m at 13:30, geopolitics bullish, and an 'Update 08:05' row reading 'Regime flipped' with what moved.",
  "The morning plan is not left to go stale. It is checked again as London and New York open.",
  ["Update at 08:05", "Red news: Core PPI m/m at 13:30", "Pulses recheck the Read through the day"],
  bottomScrim=280)

P("one-plan", "Gold Monthly", "Offer", "gold", "Gold Monthly",
  "Everything.|*One plan.",
  "The Read, Technicals, Drivers, News and Pulses. £16.99/month, cancel anytime.",
  "Join Gold Monthly",
  [V("paywall", 250, 782, w=760, y=470)],
  "The membership screen: Today's Read, Technicals, Drivers, News and Pulses listed with what each does, and the Gold Monthly plan at £16.99 / month.",
  "One plan unlocks the whole app.",
  ["£16.99/month, cancel anytime", "One plan unlocks everything: Today's Read, Technicals, Drivers, News, Pulses", "On iPhone and iPad"],
  bottomScrim=260)

P("understand-gold", "Positioning statement", "Brand", "gold", "MarketDynamics",
  "Understand what|*moves gold.",
  "From macro down to the chart, every trading day. Areas of interest, not signals.",
  "Get the Read",
  [V("t2-today", 0, 847, w=420, x=600, y=560, x0=0, x1=390, r=62)],
  "A text-led post: the four tabs of the app listed as pills, Today, Technicals, Drivers and News, with what sits in each, beside the Today screen on an iPhone.",
  "The whole picture for gold in one app, built by a trader who uses it every morning.",
  ["Four tabs: Today, Technicals, Drivers, News", PAT20, PRICE],
  pills=[{"x": 64, "y": 560, "w": 500, "items": ["#Today", "The Daily Read", "Day range", "Pulses", "#Technicals", "Zones", "20 patterns", "H4 and H1", "#Drivers", "Regime", "Macro", "COT", "#News", "Red news", "Geopolitics"]}],
  bottomScrim=300)

DROP = {"whats-changed", "gold-direction", "volatility", "cot-other-markets", "pulse"}
posts = [p for p in posts if p["slug"] not in DROP]
for n, p in enumerate(posts, 1): p["id"] = f"{n:02d}"
json.dump({"sources": "sources", "out": "2026-11-launch", "brand": brand, "posts": posts}, open(OUT, "w"), indent=1, ensure_ascii=False)
print(len(posts), "posts")
