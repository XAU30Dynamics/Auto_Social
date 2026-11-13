#!/bin/zsh
# shoot.sh <name> <delay> <args...>          launch, wait for the first drawn frame, wait <delay>, screenshot (retries if black)
# shoot.sh -burst <name> <seconds> <args...> the same, then frames as fast as they come for <seconds>
SIM="iPhone 17 Pro"; APP=com.seanburke.sealed
OUT=~/Seans_Projects/Auto_Social/visuals/sealed/sources/app; mkdir -p $OUT
TMP=$(mktemp -d)
lit() { python3 -c "from PIL import Image; print(Image.open('$1').convert('L').crop((0,300,1206,2622)).resize((60,116)).getextrema()[1])" 2>/dev/null || echo 0 }
burst=0; [[ "$1" == "-burst" ]] && { burst=1; shift; }
name=$1; delay=$2; shift 2
for try in 1 2 3; do
  xcrun simctl terminate "$SIM" $APP 2>/dev/null
  sleep 1
  xcrun simctl launch "$SIM" $APP "$@" >/dev/null
  for i in {1..30}; do
    sleep 2
    xcrun simctl io "$SIM" screenshot $TMP/p.png 2>/dev/null
    (( $(lit $TMP/p.png) > 40 )) && break
  done
  if (( burst )); then
    end=$(( $(date +%s) + delay )); n=0
    while (( $(date +%s) < end )); do n=$((n+1)); xcrun simctl io "$SIM" screenshot "$OUT/$name-$(printf %02d $n).png" 2>/dev/null; done
    break
  fi
  sleep $delay
  xcrun simctl io "$SIM" screenshot "$OUT/$name.png" 2>/dev/null
  (( $(lit "$OUT/$name.png") > 40 )) && break
  echo "retry $name"
done
echo "$name"
