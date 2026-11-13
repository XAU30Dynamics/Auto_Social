#!/bin/zsh
# Every capture used for the 2026-11-launch set. Later lines with the same name replaced earlier ones.
s=${0:a:h}/shoot.sh
$s home 4 -demo -store
$s home-pact 4 -demo -store -demo-pact
$s -burst press 9 -demo -store -demo-press
$s home-sealed 6 -demo-sealed -store
$s train 4 -demo -store -open-train
$s train-midway 4 -demo -store -demo-midway -open-train
$s train-grab 4 -demo -store -demo-midway -open-train -demo-grab
$s train-rest 4 -demo -store -demo-midway -open-train -demo-rest
$s train-rated 5 -demo -store -demo-rated -open-train -train-scroll-rating
$s train-locked 4 -demo -store -demo-locked -open-train
$s fuel 4 -demo -store -open-fuel
$s fuel-half 4 -demo -store -demo-fuel-half -open-fuel
$s macros 4 -demo -store -open-macros
$s maths 5 -demo -store -open-maths
$s scanned 5 -demo -store -open-maths -macros-scanned
$s base 4 -demo -store -open-base
$s base-week 4 -demo -store -open-base -base-period:week
$s base-month 4 -demo -store -open-base -base-period:month
$s sleep 4 -demo -store -open-base -open-sleep
$s readiness 4 -demo -store -open-base -open-readiness
$s wall 4 -demo -store -open-wall
$s wall-pact 4 -demo -store -demo-pact -open-wall
$s day 5 -demo -store -open-wall -open-day
$s week 4 -demo -store -open-week
$s progress 4 -demo -store -open-progress
$s progress-habit 5 -demo -store -open-progress -progress-scroll-habit
$s progress-work 5 -demo -store -open-progress -progress-scroll-work
$s pact 4 -demo -store -demo-pact -open-pact
$s risk 4 -demo -store -demo-risk
$s fx 5 -demo -store -open-settings -open-fx
$s lava 6 -demo-sealed -store -fx:lava
$s liquid 6 -demo-sealed -store -fx:liquid -tone:BLUE
$s ocean 6 -demo-sealed -store -wax:ocean
$s milestone 5 -demo -store -demo-milestone
$s paywall 4 -demo -store -open-paywall -paywall-trial
$s plan-train 5 -demo -store -open-plan-train -open-days
$s streak 4 -demo -store -open-streak-lab
$s streak2 4 -demo -store -open-streak-lab -streak-lab-page:2
$s settings 4 -demo -store -open-settings
$s suggest 5 -demo -store -open-plan-fuel -open-suggest
$s setup-day 4 -demo -store -open-setup -setup-step:1 -day-lesson-t:0.55
$s home-sealed 6 -demo -demo-sealed -store
$s risk 4 -demo -store -demo-risk
$s fuel-half 4 -demo -store -demo-fuel-half -open-fuel
$s macros 4 -demo -store -open-fuel -open-macros
$s maths 5 -demo -store -open-fuel -open-maths
$s scanned 5 -demo -store -open-fuel -open-maths -macros-scanned
$s sleep 4 -demo -store -open-base -open-sleep
$s readiness 4 -demo -store -open-base -open-readiness
$s wall 4 -demo -store -open-wall
$s wall-pact 4 -demo -store -demo-pact -open-wall
$s day 5 -demo -store -open-wall -open-day
$s week 4 -demo -store -open-week
$s week-pact 4 -demo -store -demo-pact -open-week
$s progress 4 -demo -store -open-progress
$s progress-habit 5 -demo -store -open-progress -progress-scroll-habit
$s progress-work 5 -demo -store -open-progress -progress-scroll-work
$s progress-lift 5 -demo -store -open-progress -progress-scroll-work -progress-lift:Deadlift -progress-all
$s pact 4 -demo -store -demo-pact -open-pact
$s fx 5 -demo -store -open-settings -open-fx
$s settings 4 -demo -store -open-settings
$s lava 6 -demo -demo-sealed -store -fx:lava
$s liquid 6 -demo -demo-sealed -store -fx:liquid -tone:BLUE
$s ocean 6 -demo -demo-sealed -store -wax:ocean
$s home-lava 5 -demo -store -fx:lava
$s home-liquid 5 -demo -store -fx:liquid -tone:BLUE
$s plan-grab 5 -demo -store -open-plan-train -open-days -demo-grab
$s train-end 5 -demo -store -demo-midway -open-train -train-scroll-end
$s risk-spent 4 -demo -store -demo-risk-spent -open-wall
$s plan-fuel 4 -demo -store -open-plan-fuel
$s plan-base 4 -demo -store -open-plan-base
$s plan 4 -demo -store -open-plan
$s notes 5 -demo -store -demo-rated -open-plan-train -open-notes
$s base-all 4 -demo -store -open-base -base-period:all
$s setup-sealed 4 -demo -store -open-setup -setup-step:1 -day-lesson-sealed
$s paywall 9 -demo -store -open-paywall -paywall-trial
$s maths 10 -demo -store -open-fuel -open-maths
$s scanned 10 -demo -store -open-fuel -open-maths -macros-scanned
$s progress-month 5 -demo -store -open-progress -progress-month
$s progress-all 5 -demo -store -open-progress -progress-all
$s work-month 6 -demo -store -open-progress -progress-month -progress-scroll-work
$s work-all 6 -demo -store -open-progress -progress-all -progress-scroll-work
$s work-row 6 -demo -store -open-progress -progress-all -progress-scroll-work "-progress-lift:Barbell Row"
$s work-bench 6 -demo -store -open-progress -progress-all -progress-scroll-work "-progress-lift:Bench Press"
$s habit-all 6 -demo -store -open-progress -progress-all -progress-scroll-habit
$s tape 6 -demo -store -open-progress -open-tape
$s home-pact 5 -demo -store -demo-pact
$s widgets 8 -demo -store -demo-pact -render-widgets -render-cards
$s widgets-sealed 8 -demo -demo-sealed -store -render-widgets
$s fx-liquid-OIL-molten 5 -demo -store -fx:liquid -tone:OIL
$s fx-liquid-OIL-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:OIL
$s fx-liquid-GOLD-molten 5 -demo -store -fx:liquid -tone:GOLD
$s fx-liquid-GOLD-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:GOLD
$s fx-liquid-COPPER-molten 5 -demo -store -fx:liquid -tone:COPPER
$s fx-liquid-COPPER-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:COPPER
$s fx-liquid-GUNMETAL-molten 5 -demo -store -fx:liquid -tone:GUNMETAL
$s fx-liquid-GUNMETAL-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:GUNMETAL
$s fx-liquid-GLASS-molten 5 -demo -store -fx:liquid -tone:GLASS
$s fx-liquid-GLASS-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:GLASS
$s fx-liquid-SMOKE-molten 5 -demo -store -fx:liquid -tone:SMOKE
$s fx-liquid-SMOKE-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:SMOKE
$s fx-liquid-ROSE-molten 5 -demo -store -fx:liquid -tone:ROSE
$s fx-liquid-ROSE-sealed 6 -demo -demo-sealed -store -fx:liquid -tone:ROSE
$s fx-lava-BLUE-molten 5 -demo -store -fx:lava -tone:BLUE
$s fx-lava-BLUE-sealed 6 -demo -demo-sealed -store -fx:lava -tone:BLUE
$s fx-lava-ACID-molten 5 -demo -store -fx:lava -tone:ACID
$s fx-lava-ACID-sealed 6 -demo -demo-sealed -store -fx:lava -tone:ACID
$s fx-lava-VIOLET-molten 5 -demo -store -fx:lava -tone:VIOLET
$s fx-lava-VIOLET-sealed 6 -demo -demo-sealed -store -fx:lava -tone:VIOLET
$s fx-lava-GOLD-molten 5 -demo -store -fx:lava -tone:GOLD
$s fx-lava-GOLD-sealed 6 -demo -demo-sealed -store -fx:lava -tone:GOLD
$s fx-wax-ember-molten 5 -demo -store -wax:ember
$s fx-wax-ember-sealed 6 -demo -demo-sealed -store -wax:ember
$s fx-wax-forest-molten 5 -demo -store -wax:forest
$s fx-wax-forest-sealed 6 -demo -demo-sealed -store -wax:forest
$s fx-wax-violet-molten 5 -demo -store -wax:violet
$s fx-wax-violet-sealed 6 -demo -demo-sealed -store -wax:violet
$s fx-wax-plum-molten 5 -demo -store -wax:plum
$s fx-wax-plum-sealed 6 -demo -demo-sealed -store -wax:plum
$s fx-wax-brass-molten 5 -demo -store -wax:brass
$s fx-wax-brass-sealed 6 -demo -demo-sealed -store -wax:brass
$s fx-wax-slate-molten 5 -demo -store -wax:slate
$s fx-wax-slate-sealed 6 -demo -demo-sealed -store -wax:slate
