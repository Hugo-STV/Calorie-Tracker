# Fuel

A free, private macro and calorie tracker. It runs in your browser and as an Android app, scans barcodes, rates foods, and syncs through your own Firebase project. Nothing in it depends on Claude or any AI service.

- **Web app:** https://hugo-stv.github.io/Calorie-Tracker/ (add it to your home screen; works offline)
- **Android:** download the latest `Fuel-*.apk` from [Releases](../../releases)

## What it does

- **Targets from your goal:** BMR (Mifflin-St Jeor) × activity, adjusted from your real intake and weigh-ins after 14 days, then your goal (cut, recomp, lean bulk) and macro style. *More → How your target is set* shows every step.
- **34,500+ foods offline, from official national tables:** Canada (Canadian Nutrient File), the US (USDA SR28 and FNDDS mixed dishes as eaten), the UK (McCance and Widdowson's CoFID), Australia (AFCD Release 3) and France (Ciqual 2025), plus the German BLS 4.0 and TempoLife. Household portions come from the tables themselves (1 large egg, 1 cup, 1 typical serving). Foods from your home country rank first; French names are searchable (*poulet rôti*, *jambon*). Carbohydrate is always counted with fibre included, as on Canadian and US labels, so foods from every country add up the same way.
- **Barcode scanning:** phone camera → Open Food Facts (about 3 million products, strong in France, the UK, the US, Canada and Australia). Scanned products are saved on the device for offline use. Unknown codes go straight to *Create a food* with the barcode filled in.
- **Food rating (0–100):** Nutri-Score method for nutrition, additives with risk levels, organic bonus, processing level (NOVA), protein per 100 kcal, and better choices.
- **Logging:** meals, quick add, my foods, saved meals, recipes (with a cookbook builder), water, weight, exercise (cardio, strength, routines).
- **Progress:** calories, nutrients, macros, weight and steps charts, weekly digest.
- **Accounts:** email and password, shared with Peak. Each account only sees its own data.
- **Backup:** *More → Export a backup / Import a backup* (one JSON file with everything).

## How it is built

| Path | What it is |
|---|---|
| `mockup/fuel.dc.html` | The design mockup: every screen and its logic. Source of truth for the UI. |
| `tools/build.py` | Turns the mockup into `index.html` and applies the production changes. Run `python3 tools/build.py` after changing the mockup. |
| `app/runtime.js` | Renders the mockup's screens with Preact. |
| `app/fuel.js` | Production layer: saving, new log each day, accounts and sync, camera scanner, Open Food Facts, backup. |
| `foods-db.json` | The offline food database (format v2: per 100 g, portions in `u`, French name in `a`). |
| `tools/mkdb.mjs`, `tools/staples.json` | Builds `foods-db.json` from the official tables. Regional estimates in `staples.json` are only used where no official table has the food. `tools/mkdb-report.txt` lists rejected rows. |
| `.github/workflows/food-sources.yml` | Downloads the official tables and converts them to CSV on the `food-sources` branch. |
| `tests/`, `.github/workflows/test.yml` | End-to-end tests, run on every push. |
| `sw.js`, `manifest.json` | Offline cache and install info. |
| `.github/workflows/android.yml` | Builds the APK on every push and publishes it to Releases. |

### Updating the app

Push a change to `main`. GitHub Pages serves the new web version within a minute or two, and the workflow builds a new APK into Releases (about 5–8 minutes). Phones pick up the web update the next time the app is opened.

### Android signing (one time)

So that each new APK installs as an update, add three repository secrets under **Settings → Secrets and variables → Actions**: `KEYSTORE_B64`, `KEYSTORE_PASSWORD` and `KEY_ALIAS`. Without them the workflow builds a debug APK that works but can't update an installed copy. Keep a private backup of the keystore: if it's lost, the app has to be uninstalled and reinstalled to update.

### Switching database provider

All cloud calls go through one object, `CLOUD`, in `app/fuel.js` (`signUp`, `signIn`, `refresh`, `get`, `put`, `list`, `resetPassword`). To move to Supabase, PocketBase or anything else, write an object with those methods and set `CLOUD` to it. To move your data: *Export a backup* while signed in to the old provider, then *Import a backup* after signing in to the new one.

Firestore paths used: `users/{uid}/fuel/profile` and `users/{uid}/fuelDays/{yyyy-mm-dd}`. The Firestore rules must let each user read and write only `users/{uid}/**`.

### Rebuilding the food database

1. Run the *Fetch food sources* workflow (push to the `data-sources` branch, or run it from Actions). It fills the `food-sources` branch.
2. `git worktree add ../food-sources origin/food-sources`, and unpack the npm packages `fda-nutrient-database@1.0.2`, `@thereforejs/foods@0.0.3` and `tempo-food-db@1.0.0` into one folder.
3. `node tools/mkdb.mjs <packages folder> ../food-sources`, then check `tools/mkdb-report.txt`.

Every row is checked: stated calories must agree with protein, carbs and fat (alcohol, polyols and seaweeds excepted); a single missing macro is worked out from the calories.

## Credits

- Canadian Nutrient File 2015, Health Canada. Contains information licensed under the Open Government Licence – Canada.
- McCance and Widdowson's The Composition of Foods Integrated Dataset 2021, Public Health England / Office for Health Improvement and Disparities. Contains public sector information licensed under the Open Government Licence v3.0.
- Australian Food Composition Database – Release 3, © Food Standards Australia New Zealand, licensed under Creative Commons Attribution 2.5 Australia.
- Ciqual French food composition table 2025, ANSES (Licence Ouverte / Open Licence, Etalab).
- USDA National Nutrient Database for Standard Reference, Release 28, and Food and Nutrient Database for Dietary Studies 2021-2023, USDA Agricultural Research Service (public domain).
- Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut, via [@thereforejs/foods](https://github.com/thereforejs/foods), CC BY 4.0 (not published by the Max Rubner-Institut); food nutrition data from TempoLife (tempolife.app), CC BY 4.0.
- A few regional dishes no official table covers are typical estimates and are labelled *Estimate* in the app.
- Packaged products: [Open Food Facts](https://openfoodfacts.org), Open Database License; product images CC BY-SA.
- Libraries: [Preact](https://preactjs.com) (MIT), [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT).
- Additive risk levels are a starter list based on EFSA and IARC reviews, not medical advice.
