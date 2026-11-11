# Changelog

Every release that goes live gets a version number here, a matching restore branch (`release/v1.3.0`), and stays
restorable: see *Rolling back* in the README. The preview (`/preview/`, *Fuel Preview*) always runs
the next version before it goes live.

## v1.9.0 — 2026-11-11
- **Workout fuel** on Plan: Before / After picks for your training. After a finished Peak workout (or
  exercise logged in Fuel) it shows After, otherwise Before; tap either. Before: easy carbs, low in fat,
  1–3 hours ahead, about 10% of your target (150–400 cal). After: 20 g+ protein plus carbs within
  2 hours, about 15% (200–550 cal). Chosen from each recipe's nutrition (44 before, 166 after), with your
  eating style, photos first and your portion. Recipe pages show a Before / After a workout tag, and the
  Recipes browser has a row for each.

## v1.8.0 — 2026-11-11
- **Recipe photos:** recipes show a real photo of the dish on Plan, Saved ideas, the Recipes browser and
  the recipe page (freely licensed from Wikimedia Commons, credited and linked). Your own recipes can get
  a photo from the camera or gallery; My created recipes rows show it.
- **404 recipes** (was 10): 108 adapted from 12 Promealplan sample meal plans and 286 from 14 cookbooks,
  duplicates dropped. Ingredients and amounts kept, directions rewritten, nutrition recalculated from the
  food database, source shown on each recipe. 235 have a photo.
- **Picked for you** on Plan: recipes ranked for your goal and calorie target, by meal and eating style
  (vegetarian, vegan, low carb, lactose-free), rotating daily, photos first, each with your portion (½–2 servings).
  The recipe page has a portion − / + that scales nutrition and amounts, and Add to diary logs it.
- **Recipe search** by name or ingredient; browse rows show 12 with a count and View more.
- Fixed: created-recipe rows were missing their name.

## v1.7.0 — 2026-11-11
- **Earlier days:** tap any day in the week strip to see its calories, macros, meals and exercise, with
  "Back to today". Finished days now keep their full log for 3 weeks and can be edited (Log adds to that
  day, removing updates its total). Days saved before this version are view only (names and calories).
- **Meals fold to one line** ("300 kcal · 2 items ⌄"); tap to open the list. Exercise too.

## v1.6.0 — 2026-11-10
- **Progress overview charts rebuilt.** Full-width 7-day bars with the value on each bar, a dashed goal
  line and colours (calories: under / on target ±10% / over; protein: under / hit 90%+; carbs and fat:
  within / over by 15%+). Today is highlighted, days with nothing logged show a dash, and a legend sits
  under each chart. Calories shows the average of the days logged, today's total against the goal and
  how many days are logged. Macros list Protein first with today's amount. The old bars could draw
  empty on some phones.
- The build now refuses screen logic that doesn't compile.

## v1.5.3 — 2026-11-10
- **Fix data loss after reinstalling / signing in.** While signing in, a fresh install saved its empty
  state, which then looked newer than the account and was uploaded over it. Now nothing is saved or
  uploaded until the account's data has loaded, and the phone and account copies are merged (logs,
  days, weigh-ins, foods, recipes, Peak workouts) instead of one replacing the other. Deleted items stay
  deleted. Each logged item has an id.
- **Today is backed up as you go:** today's full log is saved as its own day record in the account, not
  only at midnight, so a lost phone copy can't take the current day with it.
- **Daily backups:** one copy a day of your data in the account (last 7 days).
- **Peak errors stay visible** on the Peak workouts screen instead of flashing past.
- tests/sync.js replays the reinstall with a slow network; it fails on v1.5.2 and passes now.

## v1.5.2 — 2026-11-09
- Welcome screen shows the actual logo image (104 px) instead of a redrawn badge.

## v1.5.1 — 2026-11-09
- **New logo:** lime disc with a black bolt. App icon (web and Android, including adaptive and round
  launcher icons on a lime background), splash screen, browser and iPhone home-screen icons, and the
  welcome screen badge. The Android launcher icon needs the new APK; everything else updates by itself.

## v1.5.0 — 2026-11-09
- **Pace step rebuilt:** goal switch (Lose fat / Recomp / Maintain / Build muscle) right on the step, so
  "Stay lean" is no longer an empty page. Live summary: daily target, weekly change and % of body weight,
  maintenance − deficit = target, protein, and an arrival date from your goal weight.
- **Recommended for you:** a pace from your numbers (about 0.5–1% of body weight a week by BMI, slower near
  your goal and from age 60, never past the safety limit), preselected, with the reasons. 0.5 / 1 / 1.5 / 2 lb
  (0.25–1 kg) and a custom pace stay available, marked Gentler or Harder, each with its calories.
- Safety limit raised from 25% to 30% below maintenance (1,500 / 1,200 kcal floors unchanged).
- 1 lb a week now means exactly 1 lb (500 kcal a day); it was 1.1 lb.

## v1.4.1 — 2026-11-09
- Fix: meal scan showed sample guesses on top of the camera before any photo, hiding Take photo.
  Cause: a broken tag in v1.4.0's photo thumbnail. The build now refuses malformed screens, and the
  plate test checks nothing covers the camera before a photo.

## v1.4.0 — 2026-11-09
- **Plate scan works:** a photo of your plate gives the 5 most likely dishes from Google's free AIY food
  recognizer (2,023 dishes), run on the phone; your photo shows next to the guesses. Pick one to log a
  matching database food (e.g. Pad Thai, 1 typical serving 200 g), then set the amount.
  On test photos: burger, pad thai, pancakes and sushi named first; butter chicken and fried rice in the
  top 3; mixed plates are weaker, so "None of these · search" stays. First use downloads about 30 MB once.
- The label reader, dish recognizer and food database are kept for offline use after first download.

## v1.3.1 — 2026-11-09
- Meal scan: **Take photo** now uses a live camera view inside the frame (like the barcode scanner)
  instead of opening the gallery. **Choose from gallery** is for saved pictures. The camera turns off
  when you leave the screen or after the photo.

## v1.3.0 — 2026-11-09
- **Label scan:** photograph a nutrition panel and Fuel reads it on the phone (Tesseract, no upload),
  then fills in Create a food. Canadian bilingual and US labels read best; UK/EU grid tables are less reliable.
  Plate recognition is not in this version: plate mode says so.
- **34,558 foods** from official national tables: Canadian Nutrient File, UK CoFID, Australian AFCD R3,
  French Ciqual 2025, USDA SR28 and FNDDS, plus BLS and TempoLife. Household portions from the tables.
  Carbs always include fibre. Rows whose calories disagree with their macros are rejected.
- **Search:** home country first, French names and accents, whole words, basic foods before dishes.
- **Weigh your portion:** type grams or ounces on any food; everything updates and logs as "62 g (weighed)".
- **Peak workouts:** finished Peak workouts count as calories burned (MET estimate, eat back 100/75/50%),
  on the right day even when Fuel is opened later.
- **Android app opens the live site:** after installing this APK once, updates arrive by themselves.
- **Sync:** only changed days are fetched; Peak checked at most every 20 minutes.
- **Tests** run on GitHub for every change.

## v1.1.0 — 2026-11-09
- Official Nutri-Score from Open Food Facts; per-serving products converted; nutrition facts table with
  "Fill in missing values"; packaged-product search runs as you type.

## v1.0.0 — 2026-11-09
- First release: onboarding and targets (BMR, adaptive), logging, 15,974 offline foods, barcode scanning
  with Open Food Facts, food rating, progress, weekly digest, accounts and sync, backup.
