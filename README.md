# Fuel

A free, private macro and calorie tracker. It runs in your browser and as an Android app, scans barcodes, rates foods, and syncs through your own Firebase project. Nothing in it depends on Claude or any AI service.

- **Web app:** https://hugo-stv.github.io/Calorie-Tracker/ (add it to your home screen; works offline)
- **Android:** download the latest `Fuel-*.apk` from [Releases](../../releases)

## What it does

- **Targets from your goal:** BMR (Mifflin-St Jeor) × activity, adjusted from your real intake and weigh-ins after 14 days, then your goal (cut, recomp, lean bulk) and macro style. *More → How your target is set* shows every step.
- **15,974 foods offline:** USDA SR28, the German BLS 4.0, TempoLife, plus Canadian, UK, Australian and French staples. Search understands *vegemite*, *prawn*, *crisps*, *courgette*, *poulet*.
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
| `foods-db.json` | The offline food database. Rebuild with `tools/mkdb.mjs`. |
| `sw.js`, `manifest.json` | Offline cache and install info. |
| `.github/workflows/android.yml` | Builds the APK on every push and publishes it to Releases. |

### Updating the app

Push a change to `main`. GitHub Pages serves the new web version within a minute or two, and the workflow builds a new APK into Releases (about 5–8 minutes). Phones pick up the web update the next time the app is opened.

### Android signing (one time)

So that each new APK installs as an update, add three repository secrets under **Settings → Secrets and variables → Actions**: `KEYSTORE_B64`, `KEYSTORE_PASSWORD` and `KEY_ALIAS`. Without them the workflow builds a debug APK that works but can't update an installed copy. Keep a private backup of the keystore: if it's lost, the app has to be uninstalled and reinstalled to update.

### Switching database provider

All cloud calls go through one object, `CLOUD`, in `app/fuel.js` (`signUp`, `signIn`, `refresh`, `get`, `put`, `list`, `resetPassword`). To move to Supabase, PocketBase or anything else, write an object with those methods and set `CLOUD` to it. To move your data: *Export a backup* while signed in to the old provider, then *Import a backup* after signing in to the new one.

Firestore paths used: `users/{uid}/fuel/profile` and `users/{uid}/fuelDays/{yyyy-mm-dd}`. The Firestore rules must let each user read and write only `users/{uid}/**`.

## Credits

- Food data: USDA National Nutrient Database for Standard Reference, Release 28 (public domain); Bundeslebensmittelschlüssel (BLS) 4.0, Max Rubner-Institut, via [@thereforejs/foods](https://github.com/thereforejs/foods), CC BY 4.0 (not published by the Max Rubner-Institut); Food nutrition data from TempoLife (tempolife.app), CC BY 4.0. Regional staples are typical estimates.
- Packaged products: [Open Food Facts](https://openfoodfacts.org), Open Database License; product images CC BY-SA.
- Libraries: [Preact](https://preactjs.com) (MIT), [zxing-wasm](https://github.com/Sec-ant/zxing-wasm) (MIT).
- Additive risk levels are a starter list based on EFSA and IARC reviews, not medical advice.
