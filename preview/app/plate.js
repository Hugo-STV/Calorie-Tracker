// Plate scan: guesses the dish in a photo, on the phone.
// Google's AIY food classifier (2,023 dishes, Apache 2.0) run with TensorFlow Lite for the web.
// Downloaded once (about 30 MB with the runner), then cached; photos never leave the phone.
(function (root) {
  if (typeof document === 'undefined') return;
  const base = '../'; const _unused = document.currentScript && /app\/plate\.js/.test(document.currentScript.src) ? document.currentScript.src.replace(/app\/plate\.js.*$/, '') : location.href.replace(/[^/]*$/, '');
  const V = base + 'vendor/';
  let ready = null;
  const script = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('plate-load ' + src)); document.head.appendChild(s); });

  function load(onStatus) {
    if (ready) return ready;
    ready = (async () => {
      onStatus && onStatus('Getting the dish recognizer ready (first time only)…');
      if (!root.tf) { await script(V + 'tflite/tf-core.min.js'); await script(V + 'tflite/tf-backend-cpu.min.js'); }
      if (!root.tflite) await script(V + 'tflite/tf-tflite.min.js');
      root.tflite.setWasmPath(V + 'tflite/');
      const [model, csv] = await Promise.all([root.tflite.loadTFLiteModel(V + 'foodmodel/food_v1.tflite'), fetch(V + 'foodmodel/labelmap.csv').then((r) => r.text())]);
      const labels = []; csv.split('\n').slice(1).forEach((l) => { const i = l.indexOf(','); if (i > 0) labels[+l.slice(0, i)] = l.slice(i + 1).trim(); });
      return { model, labels };
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  // centre square of the photo at the model's input size
  async function toInput(file, size) {
    const img = await createImageBitmap(file);
    const s = Math.min(img.width, img.height), c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
    return c;
  }

  // top guesses: [{ name, p }], best first
  async function guessDish(file, onStatus, n) {
    const { model, labels } = await load(onStatus);
    onStatus && onStatus('Looking at your plate…');
    const inp = model.inputs[0], size = inp.shape[1] || 192, dtype = inp.dtype;
    const canvas = await toInput(file, size);
    const out = root.tf.tidy(() => {
      let x = root.tf.browser.fromPixels(canvas);
      x = dtype === 'float32' ? root.tf.div(root.tf.cast(x, 'float32'), 255) : root.tf.cast(x, 'int32');
      const y = model.predict(root.tf.expandDims(x, 0));
      return (Array.isArray(y) ? y[0] : (y.dataSync ? y : Object.values(y)[0])).dataSync();
    });
    let probs = Array.from(out);
    if (probs.some((v) => v > 1.0001)) { const max = Math.max(...probs); probs = probs.map((v) => v / (max || 1)); } // quantized scores
    const sum = probs.reduce((a, b) => a + b, 0) || 1;
    return probs.map((p, i) => ({ i, p: p / sum })).filter((x) => x.i > 0 && labels[x.i] && labels[x.i] !== '__background__')
      .sort((a, b) => b.p - a.p).slice(0, n || 5).map((x) => ({ name: labels[x.i], p: x.p }));
  }

  root.guessDish = guessDish;
})(typeof window !== 'undefined' ? window : globalThis);
