# Changelog

Every release that goes live gets a version number here, a matching restore branch (`release/v1.3.0`), and stays
restorable: see *Rolling back* in the README. The preview (`/preview/`, *Fuel Preview*) always runs
the next version before it goes live.

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
