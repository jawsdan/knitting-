# Knit Nook

A knitting companion that installs on your phone like an app. Plain HTML, CSS and JavaScript, no build step.

- **Home / Stash / Projects / Patterns**: track projects with a row counter, your yarn and tools, and saved patterns. Attach a PDF to a pattern and read it inside the app.
- **Studio**: a 3D sweater you can spin with your finger. Tap a part (body, sleeves, collar, cuffs, hem, or a stripe) and pick a color. Change fit, length and neck. Upload a photo of a sweater: its colors and stripes go onto the model, and when you recolor an area the photo itself is recolored to match (and can be saved).

Everything you add is saved on your device (localStorage).

## Put it on your phone

1. On GitHub: **Settings → Pages → Deploy from a branch**, pick the branch and `/ (root)`, save.
2. Open `https://jawsdan.github.io/knitting-/` on your phone.
3. iPhone: Share → **Add to Home Screen**. Android: menu → **Install app**.

## Run locally

```
python3 -m http.server 8000
```
