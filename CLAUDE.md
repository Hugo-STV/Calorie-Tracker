# Working on Fuel

- Nothing goes live without the owner's approval. Every change is mocked up (design canvas, new version frame) and put in `preview/` with `tools/make_preview.py` first. Merge to `main` (root files) only when the owner says to go live.
- Pushing root files to `main` releases to everyone immediately: GitHub Pages serves them and the Android app loads them.
- Don't commit the keystore or any password; `*.jks` and `*.keystore` are ignored.
- The app must not depend on Claude or any AI service at runtime.
