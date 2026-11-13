#!/bin/zsh
S="${1:?work folder holding udid, the built app under dd/, and patterns.json}"; : "${MD_OWNER:?set MD_OWNER to the owner code}"
UD=$(cat $S/udid); B=com.vibecode.marketdynamics.u2mnmk; OUT=$S/raw; mkdir -p $OUT
xcrun simctl install $UD $S/dd/Build/Products/Debug-iphonesimulator/MarketDynamics.app || exit 1
shoot() { name=$1; shift; xcrun simctl terminate $UD $B 2>/dev/null; xcrun simctl launch $UD $B -owner "$MD_OWNER" -store "$@" >/dev/null 2>&1; sleep 11; xcrun simctl io $UD screenshot "$OUT/$name.png" >/dev/null 2>&1 && echo "· $name"; }
for i in $(seq 0 52); do shoot pat-$i -pattern-gallery $S/patterns.json -gallery-index $i; done
for s in 15 28 40 52 64 76 88; do shoot today-$s -scroll:0.$s; done
shoot today-bottom -scroll-bottom
shoot today
for s in 12 20 30 40 50 60 70 80 90; do shoot levels-$s -open-levels -scroll:0.$s; done
shoot levels-h1 -open-levels -chart-h1
for s in 12 20 30; do shoot levels-h1-$s -open-levels -chart-h1 -scroll:0.$s; done
shoot levels -open-levels
for s in 30 55 80; do shoot drivers-$s -open-drivers -scroll:0.$s; done
shoot drivers-bottom -open-drivers -scroll-bottom
for s in 40 75; do shoot macro-pane-$s -open-macro-pane -scroll:0.$s; done
shoot macro-pane-bottom -open-macro-pane -scroll-bottom
shoot cot-bottom -open-cot -scroll-bottom
for s in 35 60 85; do shoot news-$s -open-news -scroll:0.$s; done
shoot news -open-news
shoot event -open-event
shoot alerts -open-alerts
shoot paywall -open-paywall
shoot size -open-size
shoot you -open-you
shoot structure -open-structure
shoot record -open-record
shoot method -open-method
shoot regime -open-regime
