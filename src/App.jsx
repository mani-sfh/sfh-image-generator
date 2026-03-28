import { useState, useRef, useCallback, useEffect } from "react";

/* ════════════════════════════════════════════════════════════════
   SENIOR FITNESS HUB — IMAGE GENERATOR v1.2
   + Image Library (IndexedDB persistent)
   + Browse & pick library images as slide refs
   + JSON export/import for templates & batch presets
   ════════════════════════════════════════════════════════════════ */

/* ─── CONFIG ─── */
const DEFAULT_TEMPLATES = [
  { id: "t1", name: "Exercise Photo", category: "exercise", prompt: "Create a clean, well-lit exercise demonstration photo showing a senior adult (age 65+) performing the exercise described. Neutral studio background, soft directional lighting, comfortable athletic clothing. Show proper form clearly. Professional fitness photography style." },
  { id: "t2", name: "Carousel Slide (Light)", category: "carousel", prompt: "Create a clean educational slide image for a senior fitness program. Cream background with navy and crimson accents. Professional, calming, senior-friendly aesthetic. No text overlay needed." },
  { id: "t3", name: "Facebook Ad", category: "ad", prompt: "Create a warm, inviting lifestyle photo for a Facebook ad targeting adults 55+. Confident senior adult in a home or outdoor setting. Natural lighting, genuine expression, aspirational but realistic." },
  { id: "t4", name: "Thumbnail", category: "thumbnail", prompt: "Create a professional thumbnail image for a senior fitness video. Bold, eye-catching composition with a clean background. Show energy and confidence." },
  { id: "t5", name: "Dark Slide (FB Group)", category: "carousel", prompt: "Create a bold, modern slide image with a pure black (#000000) background. Use teal (#14B8A6) accents, white text, and a yellow (#FFD43B) highlight box with navy (#0C115B) text. Clean, text-heavy design with minimal icons." },
];
const DEFAULT_BATCH_CTX = [
  { id: "bc1", name: "Dark Carousel (FB)", ctx: "You are creating images for a Facebook Group carousel post for Senior Fitness Hub, a balance training program for adults 55+. Each slide uses a pure black (#000000) background with teal (#14B8A6) accents, white text, and yellow (#FFD43B) highlight boxes with navy (#0C115B) text. Bold, clean, modern, text-heavy with minimal icons. Generate the exact visual layout described." },
  { id: "bc2", name: "Light Carousel (MV)", ctx: "You are creating images for an educational lesson carousel in a senior fitness program. Clean, calming aesthetic with cream/white backgrounds, soft lighting, professional feel. Adults 55+. No text overlays unless specified." },
  { id: "bc3", name: "Exercise Photos", ctx: "You are creating exercise demonstration photos for a senior fitness program. Senior adult (65+), proper form, neutral studio background, soft lighting, athletic clothing. Full body visible." },
  { id: "bc4", name: "Ad Variants", ctx: "You are creating Facebook ad images for Senior Fitness Hub. Warm, inviting, aspirational but realistic. Natural lighting, lifestyle settings. Brand colors navy (#0C115B) and crimson (#A61E51) appear subtly." },
];
const MODELS = [
  { id: "gemini-3-pro-image-preview", label: "Nano Banana Pro", desc: "4K, studio-grade", tier: "paid" },
  { id: "gemini-3.1-flash-image-preview", label: "Nano Banana 2", desc: "Fast + Pro features", tier: "free" },
  { id: "gemini-2.5-flash-preview-image", label: "Nano Banana (2.5)", desc: "Lightweight", tier: "free" },
];
const ASPECTS = [
  { label: "Square 1:1", value: "1:1" }, { label: "Landscape 16:9", value: "16:9" },
  { label: "Landscape 3:2", value: "3:2" }, { label: "Standard 4:3", value: "4:3" },
  { label: "Portrait 9:16", value: "9:16" }, { label: "Portrait 3:4", value: "3:4" },
  { label: "Social 4:5", value: "4:5" },
];
const QUALITY = [
  { label: "Standard", apiSize: "1K", note: "1024px, fastest" },
  { label: "High", apiSize: "2K", note: "2048px, recommended" },
  { label: "Maximum", apiSize: "4K", note: "4096px (Pro only)" },
];
const CATEGORIES = [
  { value: "exercise", label: "Exercise" }, { value: "carousel", label: "Carousel" },
  { value: "ad", label: "Ad" }, { value: "thumbnail", label: "Thumbnail" }, { value: "custom", label: "Custom" },
];
const LIB_TAGS = ["Brand", "Exercise", "Reference", "Style", "Background", "Icon", "Other"];
const REF_LABELS = [
  "Character Reference (photorealistic)",
  "Character Reference (illustration)",
  "Style Reference",
  "Dark Carousel Reference",
  "Light Carousel Reference",
  "Layout Reference",
  "Brand Reference",
  "Background Reference",
  "Color Palette Reference",
  "Exercise Form Reference",
];

/* ─── STORAGE ─── */
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(`sfh_ig_${k}`); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(`sfh_ig_${k}`, JSON.stringify(v)); } catch {} },
};

/* ─── IndexedDB for Image Library ─── */
const DB_NAME = "sfh_image_library";
const DB_VERSION = 1;
const DB_STORE = "images";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGetAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const store = tx.objectStore(DB_STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function dbPut(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    const store = tx.objectStore(DB_STORE);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ─── HELPERS ─── */
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
function base64ToBlob(d) { const [h, b] = d.split(","); const m = (h.match(/:(.*?);/) || [])[1] || "image/png"; const c = atob(b); const a = new Uint8Array(c.length); for (let i = 0; i < c.length; i++) a[i] = c.charCodeAt(i); return new Blob([a], { type: m }); }
function makeBlobUrl(d) { try { return URL.createObjectURL(base64ToBlob(d)); } catch { return d; } }
function sanitize(s) { return s.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").slice(0, 60); }
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function uploadJSON() {
  return new Promise((resolve) => {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".json";
    inp.onchange = (e) => {
      const file = e.target.files[0]; if (!file) { resolve(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => { try { resolve(JSON.parse(ev.target.result)); } catch { resolve(null); } };
      reader.readAsText(file);
    };
    inp.click();
  });
}

/* ─── SUPABASE STORAGE ─── */
const SB_DEFAULTS = {
  url: "https://ikctvstnfzgzxdmtxlui.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrY3R2c3RuZnpnenhkbXR4bHVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTk3NTgsImV4cCI6MjA5MDAzNTc1OH0.HDa_TWDlQZYmjAv4sMWSDOu0EbxVGTPkxF4q6SOIRDg",
  bucket: "Generated-Images",
};

async function uploadToSupabase(dataUrl, filename, sbUrl, sbKey, bucket) {
  const blob = base64ToBlob(dataUrl);
  const cleanName = sanitize(filename) + "_" + Date.now() + ".png";
  const uploadUrl = `${sbUrl}/storage/v1/object/${bucket}/${cleanName}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${sbKey}`,
      "apikey": sbKey,
      "Content-Type": blob.type,
      "x-upsert": "true",
    },
    body: blob,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${errText.slice(0, 200)}`);
  }
  const publicUrl = `${sbUrl}/storage/v1/object/public/${bucket}/${cleanName}`;
  return { publicUrl, fileName: cleanName };
}

/* ─── COLORS ─── */
const C = { nv: "#0C115B", cr: "#A61E51", tl: "#14B8A6", cm: "#FAF7F2", bd: "#e8e4de", bl: "#d1cdc6", sc: "#444", mt: "#888", ok: "#1b5e20", okBg: "#e8f5e9", errBg: "#fdf2f5" };
const grad = `linear-gradient(135deg, ${C.nv}, ${C.cr})`;

/* ═══════════════════════════════════════════════════════════════ */
export default function App() {
  /* Persisted (localStorage) */
  const [apiKey, setApiKey] = useState(() => LS.get("apiKey", ""));
  const [templates, setTemplates] = useState(() => LS.get("templates", DEFAULT_TEMPLATES));
  const [batchPresets, setBatchPresets] = useState(() => LS.get("batchPresets", []));
  const [history, setHistory] = useState(() => LS.get("history", []));
  const [sbUrl, setSbUrl] = useState(() => LS.get("sbUrl", SB_DEFAULTS.url));
  const [sbKey, setSbKey] = useState(() => LS.get("sbKey", SB_DEFAULTS.anonKey));
  const [sbBucket, setSbBucket] = useState(() => LS.get("sbBucket", SB_DEFAULTS.bucket));
  const [autoUpload, setAutoUpload] = useState(() => LS.get("autoUpload", true));
  useEffect(() => { LS.set("apiKey", apiKey); }, [apiKey]);
  useEffect(() => { LS.set("templates", templates); }, [templates]);
  useEffect(() => { LS.set("batchPresets", batchPresets); }, [batchPresets]);
  useEffect(() => { LS.set("history", history); }, [history]);
  useEffect(() => { LS.set("sbUrl", sbUrl); }, [sbUrl]);
  useEffect(() => { LS.set("sbKey", sbKey); }, [sbKey]);
  useEffect(() => { LS.set("sbBucket", sbBucket); }, [sbBucket]);
  useEffect(() => { LS.set("autoUpload", autoUpload); }, [autoUpload]);

  /* Image Library (IndexedDB) */
  const [library, setLibrary] = useState([]);
  const [libLoaded, setLibLoaded] = useState(false);
  const [libFilter, setLibFilter] = useState("All");
  useEffect(() => { dbGetAll().then((imgs) => { setLibrary(imgs); setLibLoaded(true); }).catch(() => setLibLoaded(true)); }, []);

  /* Library picker modal */
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState(null); // {type: "slide", id} or {type: "global"}
  const [pickerFilter, setPickerFilter] = useState("All");
  const [pickerSelected, setPickerSelected] = useState([]); // array of library item IDs

  /* Session */
  const [selModel, setSelModel] = useState(1);
  const [selAspect, setSelAspect] = useState(0);
  const [selQuality, setSelQuality] = useState(1);
  const [mode, setMode] = useState("single");
  const [globalErr, setGlobalErr] = useState("");

  // Single
  const [sPrompt, setSPrompt] = useState(DEFAULT_TEMPLATES[0].prompt);
  const [sCtx, setSCtx] = useState("");
  const [sName, setSName] = useState("");
  const [sImg, setSImg] = useState(null);
  const [sBlobUrl, setSBlobUrl] = useState(null);
  const [sLoading, setSLoading] = useState(false);
  const [sErr, setSErr] = useState("");
  const [sPublicUrl, setSPublicUrl] = useState(null);

  // Batch
  const [bCtx, setBCtx] = useState(DEFAULT_BATCH_CTX[0].ctx);
  const [slides, setSlides] = useState([mkSlide(1)]);
  const [batchRunning, setBatchRunning] = useState(false);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const idRef = useRef(2);

  // Templates/presets editor
  const [editingTpl, setEditingTpl] = useState(null);
  const [tplFilter, setTplFilter] = useState("all");
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Global refs
  const [refImgs, setRefImgs] = useState([]);
  const fileRef = useRef(null);
  const libUploadRef = useRef(null);

  /* ─── SLIDE FACTORY ─── */
  function mkSlide(id) {
    return { id, name: "", prompt: "", variants: [], selectedVariant: 0, variantCount: 1, aspectOverride: null, slideRefImages: [], status: "idle", error: null, collapsed: false, checked: false };
  }

  /* ─── SLIDE OPS ─── */
  const addSlides = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(mkSlide(idRef.current++)); setSlides((p) => [...p, ...a]); };
  const rmSlide = (id) => setSlides((p) => p.length > 1 ? p.filter((s) => s.id !== id) : p);
  const updSlide = (id, patch) => setSlides((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
  const toggleCheck = (id) => { const sl = slides.find((s) => s.id === id); if (sl) updSlide(id, { checked: !sl.checked }); };
  const checkAll = () => setSlides((p) => p.map((s) => ({ ...s, checked: true })));
  const uncheckAll = () => setSlides((p) => p.map((s) => ({ ...s, checked: false })));
  const checkDone = () => setSlides((p) => p.map((s) => ({ ...s, checked: s.status === "done" })));
  const collapseAll = () => setSlides((p) => p.map((s) => ({ ...s, collapsed: true })));
  const expandAll = () => setSlides((p) => p.map((s) => ({ ...s, collapsed: false })));
  const dupSlide = (id) => { const src = slides.find((s) => s.id === id); if (!src) return; const idx = slides.findIndex((s) => s.id === id); const ns = { ...mkSlide(idRef.current++), name: src.name ? `${src.name} (copy)` : "", prompt: src.prompt, variantCount: src.variantCount, aspectOverride: src.aspectOverride, slideRefImages: [...src.slideRefImages] }; setSlides((p) => { const n = [...p]; n.splice(idx + 1, 0, ns); return n; }); };
  const moveSlide = (id, dir) => { setSlides((p) => { const i = p.findIndex((s) => s.id === id); const j = i + dir; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; }); };

  /* ─── LIBRARY OPS ─── */
  const addToLibrary = async (file) => {
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const item = { id: uid(), name: file.name.replace(/\.[^.]+$/, ""), tag: "Other", b64: ev.target.result.split(",")[1], mime: file.type, preview: ev.target.result, addedAt: new Date().toISOString() };
      await dbPut(item);
      setLibrary((p) => [...p, item]);
    };
    reader.readAsDataURL(file);
  };
  const removeFromLibrary = async (id) => { await dbDelete(id); setLibrary((p) => p.filter((x) => x.id !== id)); };
  const updateLibraryItem = async (id, patch) => {
    setLibrary((p) => p.map((x) => {
      if (x.id !== id) return x;
      const updated = { ...x, ...patch };
      dbPut(updated);
      return updated;
    }));
  };

  /* ─── PICK FROM LIBRARY ─── */
  const openPicker = (target) => { setPickerTarget(target); setPickerFilter("All"); setPickerSelected([]); setPickerOpen(true); };
  const togglePickerItem = (id) => { setPickerSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]); };
  const confirmPicker = () => {
    const selectedItems = library.filter((x) => pickerSelected.includes(x.id));
    const imgDataArr = selectedItems.map((item) => ({ name: item.name, b64: item.b64, mime: item.mime, preview: item.preview }));
    if (pickerTarget?.type === "slide") {
      setSlides((p) => p.map((s) => s.id === pickerTarget.id ? { ...s, slideRefImages: [...s.slideRefImages, ...imgDataArr] } : s));
    } else if (pickerTarget?.type === "global") {
      setRefImgs((p) => [...p, ...imgDataArr]);
    }
    setPickerOpen(false);
    setPickerSelected([]);
  };

  /* ─── UPLOADS (also auto-save to Library) ─── */
  const onUpload = useCallback((e) => {
    Array.from(e.target.files).forEach((f) => {
      const r = new FileReader();
      r.onload = (ev) => {
        const b64 = ev.target.result.split(",")[1];
        const imgData = { name: f.name, b64, mime: f.type, preview: ev.target.result };
        setRefImgs((p) => [...p, imgData]);
        // Also save to Library (IndexedDB) so Browse Library always has it
        const libItem = { id: uid(), name: f.name.replace(/\.[^.]+$/, ""), tag: "Other", b64, mime: f.type, preview: ev.target.result, addedAt: new Date().toISOString() };
        dbPut(libItem).then(() => setLibrary((p) => [...p, libItem])).catch(() => {});
      };
      r.readAsDataURL(f);
    });
    e.target.value = "";
  }, []);
  const addSlideRef = (id, file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(",")[1];
      const img = { name: file.name, b64, mime: file.type, preview: ev.target.result };
      setSlides((p) => p.map((s) => s.id === id ? { ...s, slideRefImages: [...s.slideRefImages, img] } : s));
      // Also save to Library
      const libItem = { id: uid(), name: file.name.replace(/\.[^.]+$/, ""), tag: "Other", b64, mime: file.type, preview: ev.target.result, addedAt: new Date().toISOString() };
      dbPut(libItem).then(() => setLibrary((p) => [...p, libItem])).catch(() => {});
    };
    reader.readAsDataURL(file);
  };

  /* ─── PASTE URL AS REFERENCE ─── */
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlErr, setUrlErr] = useState("");

  const fetchImageUrl = async (url, target) => {
    if (!url.trim()) return;
    setUrlLoading(true); setUrlErr("");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch (${res.status})`);
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) throw new Error("URL is not an image");
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result.split(",")[1];
        const name = url.split("/").pop().split("?")[0].replace(/\.[^.]+$/, "") || "url_ref";
        const imgData = { name, b64, mime: blob.type, preview: ev.target.result };
        if (target?.type === "slide") {
          setSlides((p) => p.map((s) => s.id === target.id ? { ...s, slideRefImages: [...s.slideRefImages, imgData] } : s));
        } else {
          setRefImgs((p) => [...p, imgData]);
        }
        const libItem = { id: uid(), name, tag: "Reference", b64, mime: blob.type, preview: ev.target.result, addedAt: new Date().toISOString() };
        dbPut(libItem).then(() => setLibrary((p) => [...p, libItem])).catch(() => {});
        setUrlInput("");
      };
      reader.readAsDataURL(blob);
    } catch (e) { setUrlErr(e.message); }
    finally { setUrlLoading(false); }
  };

  /* ─── API ─── */
  const callAPI = async (promptText, { aspectIdx = null, extraRefs = [], seed = null } = {}) => {
    const model = MODELS[selModel].id;
    const aIdx = aspectIdx !== null ? aspectIdx : selAspect;
    const aspect = ASPECTS[aIdx].value;
    const aspectLabel = ASPECTS[aIdx].label;
    const imageSize = QUALITY[selQuality].apiSize;
    const useSeed = seed !== null ? seed : Math.floor(Math.random() * 2147483647);
    const override = `\n\nCRITICAL INSTRUCTION: The output image MUST be exactly ${aspect} aspect ratio (${aspectLabel}). IGNORE any other aspect ratio, dimensions, or size instructions in the prompt above. The ${aspect} ratio is mandatory.`;
    const parts = [];
    extraRefs.forEach((img) => {
      if (img.label) parts.push({ text: `[${img.label}]:` });
      parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
    });
    refImgs.forEach((img) => {
      if (img.label) parts.push({ text: `[${img.label}]:` });
      parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } });
    });
    parts.push({ text: promptText + override });
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseModalities: ["TEXT", "IMAGE"], seed: useSeed, imageConfig: { aspectRatio: aspect, imageSize } } }) });
    if (!res.ok && res.status === 429) throw new Error("Rate limited — wait a minute and try again.");
    if (!res.ok && res.status === 413) throw new Error("Request too large — try removing reference images or shortening prompt.");
    const raw = await res.text();
    let data;
    try { data = JSON.parse(raw); } catch { throw new Error(`API returned non-JSON (HTTP ${res.status}): ${raw.slice(0, 200)}`); }
    if (data.error) throw new Error(`${data.error.message} (${data.error.status || res.status})`);
    if (data.promptFeedback?.blockReason) throw new Error(`Prompt blocked: ${data.promptFeedback.blockReason}. Try rephrasing.`);
    if (!data.candidates?.length) throw new Error("No candidates returned — content may have been filtered.");
    const candidate = data.candidates[0];
    if (candidate.finishReason === "SAFETY") throw new Error("Blocked by safety filter. Try a different prompt.");
    if (candidate.finishReason === "RECITATION") throw new Error("Blocked due to recitation policy.");
    if (!candidate.content?.parts) throw new Error(`No content (finishReason: ${candidate.finishReason || "unknown"}).`);
    let img = null, txt = "";
    candidate.content.parts.forEach((p) => { const d = p.inlineData || p.inline_data; if (d) img = `data:${d.mimeType || d.mime_type || "image/png"};base64,${d.data}`; else if (p.text) txt += p.text; });
    return { image: img, text: txt, seed: useSeed, model, aspect, quality: imageSize };
  };

  /* ─── SAVE TO SUPABASE DB ─── */
  const saveRecipe = async (data) => {
    if (!sbUrl || !sbKey) return;
    try {
      await fetch(`${sbUrl}/rest/v1/generated_images`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${sbKey}`,
          "apikey": sbKey,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          filename: data.filename || "untitled",
          public_url: data.publicUrl || null,
          seed: data.seed || null,
          prompt: data.prompt || "",
          shared_context: data.sharedContext || null,
          model: data.model || null,
          aspect_ratio: data.aspect || null,
          quality: data.quality || null,
          ref_labels: data.refLabels || [],
          slide_name: data.slideName || null,
        }),
      });
    } catch (e) { console.warn("Recipe save failed:", e.message); }
  };

  /* ─── LOAD RECIPES FROM SUPABASE ─── */
  const [sbHistory, setSbHistory] = useState([]);
  const [sbHistoryLoaded, setSbHistoryLoaded] = useState(false);
  const loadSbHistory = async () => {
    if (!sbUrl || !sbKey) return;
    try {
      const res = await fetch(`${sbUrl}/rest/v1/generated_images?order=created_at.desc&limit=200`, {
        headers: { "Authorization": `Bearer ${sbKey}`, "apikey": sbKey },
      });
      if (res.ok) { const data = await res.json(); setSbHistory(data); setSbHistoryLoaded(true); }
    } catch (e) { console.warn("Load history failed:", e.message); }
  };
  useEffect(() => { if (sbUrl && sbKey && mode === "history") loadSbHistory(); }, [mode, sbUrl, sbKey]);

  const addHistory = (name, prompt, img) => { if (!img) return; setHistory((p) => [{ id: uid(), name: name || "Image", prompt: prompt.slice(0, 300), model: MODELS[selModel].label, aspect: ASPECTS[selAspect].label, quality: QUALITY[selQuality].label, timestamp: new Date().toISOString() }, ...p].slice(0, 100)); };

  /* ─── SINGLE ─── */
  const [lastSeed, setLastSeed] = useState(null);
  const genSingle = async () => {
    if (!apiKey.trim()) { setSErr("Enter your API key."); return; }
    if (!sPrompt.trim()) { setSErr("Enter a prompt."); return; }
    setSLoading(true); setSErr(""); setSImg(null); setSPublicUrl(null); setLastSeed(null); if (sBlobUrl) URL.revokeObjectURL(sBlobUrl); setSBlobUrl(null);
    const full = sCtx.trim() ? `${sPrompt}\n\nContext: ${sCtx}` : sPrompt;
    try {
      const r = await callAPI(full);
      if (r.image) {
        setSImg(r.image); setSBlobUrl(makeBlobUrl(r.image)); setLastSeed(r.seed);
        addHistory(sName || "Single", full, r.image);
        let pubUrl = null;
        if (autoUpload && sbUrl && sbKey && sbBucket) {
          try {
            const up = await uploadToSupabase(r.image, sName || "sfh_image", sbUrl, sbKey, sbBucket);
            setSPublicUrl(up.publicUrl);
            pubUrl = up.publicUrl;
          } catch (ue) { setSErr("Image generated but Supabase upload failed: " + ue.message); }
        }
        // Save recipe to Supabase DB
        const refLabels = [...refImgs.filter((x) => x.label).map((x) => x.label)];
        saveRecipe({ filename: sName || "sfh_image", publicUrl: pubUrl, seed: r.seed, prompt: full, model: r.model, aspect: r.aspect, quality: r.quality, refLabels, slideName: sName });
      }
      if (!r.image) setSErr("No image returned.");
    } catch (e) { setSErr(e.message); } finally { setSLoading(false); }
  };

  /* ─── BATCH ONE ─── */
  const genOne = async (id) => {
    const sl = slides.find((s) => s.id === id); if (!sl?.prompt.trim() || !apiKey.trim()) return;
    const count = sl.variantCount || 1;
    updSlide(id, { status: "generating", error: null, variants: [], selectedVariant: 0 });
    const full = bCtx.trim() ? `${bCtx}\n\nSlide to create:\n${sl.prompt}` : sl.prompt;
    const opts = { aspectIdx: sl.aspectOverride, extraRefs: sl.slideRefImages };
    const nv = [];
    for (let v = 0; v < count; v++) {
      try {
        const r = await callAPI(full, opts);
        if (r.image) {
          const variant = { image: r.image, blobUrl: makeBlobUrl(r.image), publicUrl: null, seed: r.seed };
          if (autoUpload && sbUrl && sbKey && sbBucket) {
            try {
              const vLabel = count > 1 ? `_v${v + 1}` : "";
              const up = await uploadToSupabase(r.image, (sl.name || `slide_${id}`) + vLabel, sbUrl, sbKey, sbBucket);
              variant.publicUrl = up.publicUrl;
            } catch (ue) { variant.uploadError = "Supabase: " + ue.message; }
          }
          // Save recipe to DB
          const refLabels = [...sl.slideRefImages.filter((x) => x.label).map((x) => x.label), ...refImgs.filter((x) => x.label).map((x) => x.label)];
          saveRecipe({ filename: (sl.name || `slide_${id}`) + (count > 1 ? `_v${v + 1}` : ""), publicUrl: variant.publicUrl, seed: r.seed, prompt: sl.prompt, sharedContext: bCtx, model: r.model, aspect: r.aspect, quality: r.quality, refLabels, slideName: sl.name });
          nv.push(variant);
          addHistory(sl.name || `Slide v${v + 1}`, full, r.image);
        } else {
          nv.push({ image: null, blobUrl: null, publicUrl: null, seed: null, error: "No image" });
        }
      } catch (e) { nv.push({ image: null, blobUrl: null, publicUrl: null, seed: null, error: e.message }); }
      if (v < count - 1) await new Promise((r) => setTimeout(r, 2000));
      updSlide(id, { variants: [...nv], status: "generating" });
    }
    updSlide(id, { variants: nv, status: nv.some((v) => v.image) ? "done" : "error", error: nv.some((v) => v.image) ? null : (nv[0]?.error || "No images generated"), selectedVariant: 0 });
  };

  /* ─── BATCH ALL ─── */
  const genAll = async () => {
    if (!apiKey.trim()) { setGlobalErr("Enter your API key."); return; }
    const toGen = slides.filter((s) => s.prompt.trim() && s.status !== "done"); if (!toGen.length) return;
    setBatchRunning(true); cancelRef.current = false; pauseRef.current = false; setPaused(false); setGlobalErr("");
    for (let i = 0; i < toGen.length; i++) {
      if (cancelRef.current) break;
      while (pauseRef.current) { await new Promise((r) => setTimeout(r, 500)); if (cancelRef.current) break; }
      if (cancelRef.current) break;
      await genOne(toGen[i].id);
      if (i < toGen.length - 1 && !cancelRef.current) await new Promise((r) => setTimeout(r, 2000));
    }
    setBatchRunning(false);
  };

  /* ─── DOWNLOAD ─── */
  const dlSelected = () => { slides.filter((s) => s.checked && s.variants[s.selectedVariant]?.blobUrl).forEach((s, i) => { const idx = slides.findIndex((x) => x.id === s.id); setTimeout(() => { const a = document.createElement("a"); a.href = s.variants[s.selectedVariant].blobUrl; a.download = `${s.name ? sanitize(s.name) : `sfh_slide_${String(idx + 1).padStart(2, "0")}`}.png`; a.click(); }, i * 600); }); };

  /* ─── TEMPLATE OPS ─── */
  const saveTemplate = (n, cat, p) => setTemplates((prev) => [...prev, { id: uid(), name: n, category: cat, prompt: p }]);
  const deleteTemplate = (id) => setTemplates((p) => p.filter((t) => t.id !== id));
  const updateTemplate = (id, patch) => setTemplates((p) => p.map((t) => t.id === id ? { ...t, ...patch } : t));

  /* ─── PRESET OPS ─── */
  const saveBatchPreset = (name) => { setBatchPresets((p) => [...p, { id: uid(), name, context: bCtx, slides: slides.map((s) => ({ name: s.name, prompt: s.prompt, variantCount: s.variantCount, aspectOverride: s.aspectOverride })), createdAt: new Date().toISOString() }]); setSavingPreset(false); setPresetName(""); };
  const loadBatchPreset = (pr) => { setBCtx(pr.context); const ns = pr.slides.map((s) => ({ ...mkSlide(idRef.current++), ...s })); setSlides(ns.length ? ns : [mkSlide(idRef.current++)]); };

  /* ─── JSON EXPORT/IMPORT ─── */
  const exportTemplates = () => downloadJSON(templates, "sfh_templates.json");
  const importTemplates = async () => { const d = await uploadJSON(); if (d && Array.isArray(d)) { setTemplates((p) => [...p, ...d.map((t) => ({ ...t, id: uid() }))]); } };
  const exportPresets = () => downloadJSON(batchPresets, "sfh_batch_presets.json");
  const importPresets = async () => { const d = await uploadJSON(); if (d && Array.isArray(d)) { setBatchPresets((p) => [...p, ...d.map((bp) => ({ ...bp, id: uid() }))]); } };

  /* ─── COUNTS ─── */
  const checkedWithImg = slides.filter((s) => s.checked && s.variants[s.selectedVariant]?.image).length;
  const doneCount = slides.filter((s) => s.status === "done").length;
  const totalPrompted = slides.filter((s) => s.prompt.trim()).length;
  const filteredTemplates = tplFilter === "all" ? templates : templates.filter((t) => t.category === tplFilter);
  const filteredLib = libFilter === "All" ? library : library.filter((x) => x.tag === libFilter);
  const pickerLib = pickerFilter === "All" ? library : library.filter((x) => x.tag === pickerFilter);

  /* ─── STYLES ─── */
  const pill = (a) => ({ padding: "6px 12px", borderRadius: 16, border: a ? `2px solid ${C.nv}` : `1px solid ${C.bl}`, background: a ? C.nv : "#fff", color: a ? "#fff" : "#333", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Quicksand', sans-serif" });
  const navTab = (a) => ({ padding: "10px 14px", fontSize: 13, fontWeight: 700, fontFamily: "'Petrona', serif", cursor: "pointer", background: "none", border: "none", borderBottom: `3px solid ${a ? C.cr : "transparent"}`, color: a ? C.nv : C.mt, whiteSpace: "nowrap" });
  const secBox = { background: "#fff", borderRadius: 11, padding: "15px 18px", marginBottom: 13, border: `1px solid ${C.bd}` };
  const secT = { fontFamily: "'Petrona', serif", fontSize: 14, fontWeight: 700, color: C.nv, marginBottom: 10, display: "flex", alignItems: "center", gap: 7 };
  const stepN = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: "50%", background: C.nv, color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 };
  const lbl = { fontSize: 12, fontWeight: 600, color: C.sc, marginBottom: 4, display: "block" };
  const inp = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.bl}`, fontSize: 13, fontFamily: "'Quicksand', sans-serif", fontWeight: 500, background: "#FFFBF7", outline: "none", boxSizing: "border-box" };
  const ta = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.bl}`, fontSize: 13, fontFamily: "'Quicksand', sans-serif", fontWeight: 500, background: "#FFFBF7", outline: "none", resize: "vertical", minHeight: 65, lineHeight: 1.4, boxSizing: "border-box" };
  const btnP = { padding: "12px 24px", borderRadius: 9, border: "none", background: grad, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: "'Quicksand', sans-serif", cursor: "pointer", width: "100%", textAlign: "center" };
  const btn2 = { padding: "7px 14px", borderRadius: 7, border: `2px solid ${C.nv}`, background: "#fff", color: C.nv, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Quicksand', sans-serif", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 };
  const btnSm = { padding: "4px 9px", borderRadius: 5, border: `1px solid ${C.bl}`, background: "#fff", color: C.sc, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "'Quicksand', sans-serif" };
  const errBox = { background: C.errBg, border: `1px solid ${C.cr}`, borderRadius: 7, padding: "8px 12px", color: C.cr, fontSize: 12, fontWeight: 600, marginBottom: 10 };
  const spin = { display: "inline-block", width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "sfh-spin 0.8s linear infinite" };
  const spinD = { display: "inline-block", width: 13, height: 13, border: "2px solid #ddd", borderTop: `2px solid ${C.nv}`, borderRadius: "50%", animation: "sfh-spin 0.8s linear infinite" };
  const badgeS = (st) => { const m = { idle: [C.bd, "#999"], generating: ["#e3f2fd", "#0d47a1"], done: [C.okBg, C.ok], error: [C.errBg, C.cr], "no-image": ["#fff3e0", "#bf360c"] }; const [bg, c] = m[st] || m.idle; return { fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 5, background: bg, color: c, textTransform: "uppercase" }; };
  const selS = { ...inp, width: "auto", padding: "4px 8px", fontSize: 11, display: "inline-block" };
  const modal = { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 };
  const modalBox = { background: "#fff", borderRadius: 14, padding: "20px 24px", maxWidth: 700, width: "90%", maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };

  /* ─── COPY BUTTON WITH FEEDBACK ─── */
  const CopyBtn = ({ text, label = "Copy", size = "sm", style: extraStyle = {} }) => {
    const [copied, setCopied] = useState(false);
    const handleCopy = (e) => {
      if (e) e.stopPropagation();
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    };
    const base = size === "sm" ? btnSm : btn2;
    return (
      <button onClick={handleCopy} style={{
        ...base, ...extraStyle,
        color: copied ? C.ok : (extraStyle.color || base.color),
        borderColor: copied ? C.ok : (extraStyle.borderColor || base.borderColor || C.bl),
        background: copied ? C.okBg : (extraStyle.background || base.background),
        transition: "all 0.2s ease",
      }}>
        {copied ? "Copied!" : label}
      </button>
    );
  };

  /* ═══ RENDER ═══ */
  return (
    <div style={{ fontFamily: "'Quicksand', sans-serif", background: C.cm, minHeight: "100vh", color: "#1a1a1a" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Petrona:wght@400;500;600;700&family=Quicksand:wght@400;500;600;700&display=swap');
        @keyframes sfh-spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        a[download] { cursor: pointer; }
        textarea:focus, input:focus { border-color: ${C.nv} !important; }
      `}</style>

      {/* HEADER */}
      <div style={{ background: grad, padding: "18px 22px 14px", color: "#fff" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
            <span style={{ fontFamily: "'Petrona', serif", fontSize: 12, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", opacity: 0.85 }}>SENIOR FITNESS <span style={{ color: "#f8c8d8" }}>HUB</span></span>
            <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(255,255,255,0.15)", padding: "2px 9px", borderRadius: 12 }}>v1.2</span>
          </div>
          <h1 style={{ fontFamily: "'Petrona', serif", fontSize: 20, fontWeight: 700, margin: 0 }}>Image Generator</h1>
          <p style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Single, Bulk, Library — Google Nano Banana</p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 14px 40px" }}>

        {/* SETTINGS */}
        <div style={secBox}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: "2 1 240px" }}>
              <span style={lbl}>API Key:</span>
              <input type="password" placeholder="Google AI Studio key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={inp} />
              {apiKey ? <span style={{ fontSize: 9, color: C.ok }}>Saved automatically</span> : <span style={{ fontSize: 9, color: C.mt }}>Free: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: C.nv }}>aistudio.google.com/apikey</a></span>}
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <span style={lbl}>Model:</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {MODELS.map((m, i) => (<div key={m.id} onClick={() => setSelModel(i)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, border: i === selModel ? `2px solid ${m.tier === "free" ? C.ok : C.cr}` : `1px solid ${C.bl}`, background: i === selModel ? (m.tier === "free" ? C.okBg : C.errBg) : "#fff" }}>{m.label}</div>))}
              </div>
            </div>
            <div style={{ flex: "1 1 110px" }}>
              <span style={lbl}>Default Aspect:</span>
              <select style={selS} value={selAspect} onChange={(e) => setSelAspect(Number(e.target.value))}>{ASPECTS.map((a, i) => <option key={a.value} value={i}>{a.label}</option>)}</select>
            </div>
            <div style={{ flex: "1 1 90px" }}>
              <span style={lbl}>Quality:</span>
              <div style={{ display: "flex", gap: 3 }}>
                {QUALITY.map((q, i) => (<div key={q.label} onClick={() => setSelQuality(i)} style={{ padding: "5px 7px", borderRadius: 5, cursor: "pointer", fontSize: 10, fontWeight: 600, border: i === selQuality ? `2px solid ${C.nv}` : `1px solid ${C.bl}`, background: i === selQuality ? "#f0f0ff" : "#fff" }}>{q.label}</div>))}
              </div>
            </div>
          </div>
          {/* Global refs */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...lbl, marginBottom: 0 }}>Global refs:</span>
              <button style={btnSm} onClick={() => fileRef.current?.click()}>Upload</button>
              <button style={{ ...btnSm, color: C.tl, borderColor: C.tl }} onClick={() => openPicker({ type: "global" })}>Browse Library</button>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={onUpload} style={{ display: "none" }} />
              {refImgs.length > 0 && <button style={{ ...btnSm, color: C.cr, borderColor: C.cr }} onClick={() => setRefImgs([])}>Clear All ({refImgs.length})</button>}
            </div>
            {/* Ref images with labels */}
            {refImgs.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {refImgs.map((img, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 90, padding: 4, background: "#fafafa", borderRadius: 6, border: `1px solid ${C.bd}` }}>
                    <div style={{ position: "relative" }}>
                      <img src={img.preview} style={{ width: 50, height: 50, objectFit: "cover", borderRadius: 4, border: `1px solid ${C.bl}` }} />
                      <button onClick={() => setRefImgs((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -5, right: -5, width: 20, height: 20, borderRadius: "50%", background: C.cr, color: "#fff", border: "2px solid #fff", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>×</button>
                    </div>
                    <input list={`ref-labels-${i}`} style={{ width: "100%", fontSize: 8, padding: "2px 4px", borderRadius: 4, border: `1px solid ${C.bl}`, fontFamily: "'Quicksand', sans-serif", background: img.label ? "#f0f0ff" : "#fff", color: img.label ? C.nv : C.mt, outline: "none" }}
                      placeholder="Add label..."
                      value={img.label || ""} onChange={(e) => setRefImgs((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                    <datalist id={`ref-labels-${i}`}>
                      {REF_LABELS.map((l) => <option key={l} value={l} />)}
                    </datalist>
                    <button onClick={() => setRefImgs((p) => p.filter((_, j) => j !== i))} style={{ fontSize: 9, color: C.cr, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Remove</button>
                  </div>
                ))}
              </div>
            )}
            {/* Paste URL */}
            <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
              <input style={{ ...inp, flex: 1, fontSize: 11, padding: "5px 8px" }} placeholder="Paste image URL to add as reference..." value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") fetchImageUrl(urlInput, { type: "global" }); }} />
              <button style={{ ...btnSm, color: C.nv, borderColor: C.nv }} onClick={() => fetchImageUrl(urlInput, { type: "global" })} disabled={urlLoading}>
                {urlLoading ? "Loading..." : "Add URL"}
              </button>
            </div>
            {urlErr && <span style={{ fontSize: 10, color: C.cr }}>{urlErr}</span>}
          </div>
          {/* Supabase Storage */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ ...lbl, marginBottom: 0 }}>Supabase Storage:</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontSize: 11, fontWeight: 600, color: autoUpload ? C.ok : C.mt }}>
                <input type="checkbox" checked={autoUpload} onChange={(e) => setAutoUpload(e.target.checked)} style={{ accentColor: C.nv }} />
                Auto-upload {autoUpload ? "ON" : "OFF"}
              </label>
              {autoUpload && sbUrl && sbKey && <span style={{ fontSize: 9, color: C.ok }}>Connected — images get permanent URLs</span>}
              {autoUpload && (!sbUrl || !sbKey) && <span style={{ fontSize: 9, color: C.cr }}>Missing Supabase credentials below</span>}
            </div>
            {autoUpload && (
              <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                <div style={{ flex: "2 1 200px" }}><input style={{ ...inp, fontSize: 10, padding: "4px 8px" }} placeholder="Supabase URL" value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} /></div>
                <div style={{ flex: "1 1 120px" }}><input style={{ ...inp, fontSize: 10, padding: "4px 8px" }} placeholder="Bucket name" value={sbBucket} onChange={(e) => setSbBucket(e.target.value)} /></div>
                <div style={{ flex: "2 1 200px" }}><input type="password" style={{ ...inp, fontSize: 10, padding: "4px 8px" }} placeholder="Anon key" value={sbKey} onChange={(e) => setSbKey(e.target.value)} /></div>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.bd}`, marginBottom: 13, overflowX: "auto" }}>
          {[["single", "Single"], ["batch", "Batch"], ["library", `Library (${library.length})`], ["templates", "Templates"], ["history", "History"]].map(([k, l]) => (
            <button key={k} style={navTab(mode === k)} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>

        {/* ═══ SINGLE ═══ */}
        {mode === "single" && (<>
          <div style={secBox}>
            {templates.length > 0 && (<div style={{ marginBottom: 8 }}><span style={lbl}>Load template:</span><div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{templates.slice(0, 8).map((t) => <button key={t.id} style={btnSm} onClick={() => { setSPrompt(t.prompt); setSName(t.name); }}>{t.name}</button>)}</div></div>)}
            <div style={{ marginBottom: 6 }}><span style={lbl}>Image name:</span><input style={inp} value={sName} onChange={(e) => setSName(e.target.value)} placeholder='e.g. "Standing-Calf-Stretch"' /></div>
            <span style={lbl}>Prompt:</span>
            <textarea style={{ ...ta, minHeight: 90 }} value={sPrompt} onChange={(e) => setSPrompt(e.target.value)} placeholder="Describe the image..." />
            <div style={{ marginTop: 6 }}><span style={lbl}>Context:</span><textarea style={{ ...ta, minHeight: 40 }} value={sCtx} onChange={(e) => setSCtx(e.target.value)} placeholder="Exercise name, details..." /></div>
            {sPrompt.trim() && <button style={{ ...btnSm, marginTop: 6, color: C.nv, borderColor: C.nv }} onClick={() => saveTemplate(sName || `Template ${templates.length + 1}`, "custom", sPrompt)}>Save as template</button>}
          </div>
          {sErr && <div style={errBox}>{sErr}</div>}
          <button style={{ ...btnP, opacity: sLoading ? 0.7 : 1 }} onClick={genSingle} disabled={sLoading}>
            {sLoading ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span style={spin} />Generating...</span> : "Generate Image"}
          </button>
          {sImg && (<div style={{ ...secBox, marginTop: 14 }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
              <img src={sImg} style={{ width: 200, borderRadius: 8, border: `1px solid ${C.bd}`, display: "block" }} />
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  {sBlobUrl && <a href={sBlobUrl} download={`${sName ? sanitize(sName) : "sfh_image"}.png`} style={btn2}>Download PNG</a>}
                  <span style={{ fontSize: 10, color: C.mt }}>or right-click → Save</span>
                </div>
                {sPublicUrl && (<div style={{ padding: "8px 10px", background: C.okBg, borderRadius: 7, border: `1px solid ${C.ok}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.ok }}>Uploaded to Supabase</span>
                    <CopyBtn text={sPublicUrl} label="Copy URL" style={{ color: C.nv, borderColor: C.nv }} />
                  </div>
                  <input style={{ ...inp, fontSize: 11, padding: "4px 8px", color: C.sc, background: "#fff" }} value={sPublicUrl} readOnly onClick={(e) => { e.target.select(); navigator.clipboard.writeText(sPublicUrl); }} />
                </div>)}
                {lastSeed && (<div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.tl }}>Seed: {lastSeed}</span>
                  <CopyBtn text={String(lastSeed)} label="Copy Seed" size="sm" style={{ fontSize: 9 }} />
                </div>)}
              </div>
            </div>
          </div>)}
        </>)}

        {/* ═══ BATCH ═══ */}
        {mode === "batch" && (<>
          <div style={secBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={secT}>Shared Context</div>
              <div style={{ display: "flex", gap: 4 }}>
                {!savingPreset ? <button style={{ ...btnSm, color: C.nv, borderColor: C.nv }} onClick={() => setSavingPreset(true)}>Save Preset</button> : (<>
                  <input style={{ ...inp, width: 130, padding: "4px 8px", fontSize: 11 }} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Name..." autoFocus />
                  <button style={{ ...btnSm, background: C.nv, color: "#fff", border: "none" }} onClick={() => saveBatchPreset(presetName || `Preset ${batchPresets.length + 1}`)}>Save</button>
                  <button style={btnSm} onClick={() => { setSavingPreset(false); setPresetName(""); }}>Cancel</button>
                </>)}
              </div>
            </div>
            {batchPresets.length > 0 && (<div style={{ marginBottom: 8 }}><span style={lbl}>Saved presets:</span><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{batchPresets.map((bp) => (<div key={bp.id} style={{ display: "flex", gap: 2 }}><button style={{ ...btnSm, color: C.nv, borderColor: C.nv }} onClick={() => loadBatchPreset(bp)}>{bp.name} ({bp.slides.length})</button><button style={{ ...btnSm, color: C.cr, padding: "4px 6px" }} onClick={() => setBatchPresets((p) => p.filter((x) => x.id !== bp.id))}>×</button></div>))}</div></div>)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
              {DEFAULT_BATCH_CTX.map((p) => <button key={p.id} style={btnSm} onClick={() => setBCtx(p.ctx)}>{p.name}</button>)}
            </div>
            {/* User templates as shared context */}
            {templates.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.tl }}>My Templates:</span>
                {templates.map((t) => (
                  <button key={t.id} style={{ ...btnSm, color: C.tl, borderColor: C.tl }} onClick={() => setBCtx(t.prompt)}>{t.name}</button>
                ))}
              </div>
            )}
            <textarea style={{ ...ta, minHeight: 55 }} value={bCtx} onChange={(e) => setBCtx(e.target.value)} placeholder="Style for every slide..." />
          </div>

          {/* Toolbar */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 8, padding: "7px 10px", background: "#fff", borderRadius: 8, border: `1px solid ${C.bd}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.nv, fontFamily: "'Petrona', serif" }}>{slides.length} Slides</span>
            <span style={{ width: 1, height: 16, background: C.bl }} />
            <button style={btnSm} onClick={() => addSlides(1)}>+1</button><button style={btnSm} onClick={() => addSlides(5)}>+5</button><button style={btnSm} onClick={() => addSlides(10)}>+10</button>
            <span style={{ width: 1, height: 16, background: C.bl }} />
            <button style={btnSm} onClick={collapseAll}>Collapse</button><button style={btnSm} onClick={expandAll}>Expand</button>
            <div style={{ flex: 1 }} />
            <button style={btnSm} onClick={checkAll}>All</button><button style={btnSm} onClick={checkDone}>Done</button><button style={btnSm} onClick={uncheckAll}>None</button>
            {checkedWithImg > 0 && <button style={{ ...btnSm, background: C.nv, color: "#fff", border: "none", fontWeight: 700 }} onClick={dlSelected}>Download {checkedWithImg}</button>}
          </div>

          {/* SLIDES */}
          {slides.map((sl, idx) => (
            <div key={sl.id} style={{ background: "#fff", borderRadius: 9, marginBottom: 7, overflow: "hidden", border: `1px solid ${sl.checked ? C.nv : sl.status === "error" ? C.cr : sl.status === "done" ? C.ok : C.bd}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", cursor: "pointer", background: sl.status === "done" ? "#f0faf0" : sl.status === "generating" ? "#e3f2fd" : sl.status === "error" ? C.errBg : "#fafafa" }}
                onClick={() => updSlide(sl.id, { collapsed: !sl.collapsed })}>
                <input type="checkbox" checked={sl.checked} onChange={() => toggleCheck(sl.id)} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.nv }} />
                <span style={{ fontFamily: "'Petrona', serif", fontSize: 12, fontWeight: 700, color: C.nv }}>{idx + 1}</span>
                {sl.name && <span style={{ fontSize: 11, fontWeight: 600, color: C.sc }}>{sl.name}</span>}
                <span style={badgeS(sl.status)}>{sl.status === "idle" ? "ready" : sl.status}</span>
                {sl.status === "generating" && <span style={spinD} />}
                {sl.slideRefImages.length > 0 && <span style={{ fontSize: 9, color: C.tl, fontWeight: 700 }}>{sl.slideRefImages.length} ref</span>}
                {sl.collapsed && sl.prompt && !sl.name && <span style={{ fontSize: 10, color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{sl.prompt.split("\n")[0].slice(0, 40)}...</span>}
                <div style={{ marginLeft: "auto", display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                  <button style={btnSm} onClick={() => moveSlide(sl.id, -1)} disabled={idx === 0}>↑</button>
                  <button style={btnSm} onClick={() => moveSlide(sl.id, 1)} disabled={idx === slides.length - 1}>↓</button>
                  <button style={btnSm} onClick={() => dupSlide(sl.id)}>Copy</button>
                  {slides.length > 1 && <button style={{ ...btnSm, color: C.cr }} onClick={() => rmSlide(sl.id)}>×</button>}
                </div>
                <span style={{ fontSize: 12, color: C.mt }}>{sl.collapsed ? "▸" : "▾"}</span>
              </div>

              {!sl.collapsed && (<div style={{ padding: "10px 12px" }}>
                {/* Settings row */}
                <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: "2 1 200px" }}><span style={lbl}>Name/tag:</span><input style={inp} value={sl.name} onChange={(e) => updSlide(sl.id, { name: e.target.value })} placeholder={`GRP-P1-S${idx + 1}`} /></div>
                  <div style={{ flex: "0 0 auto" }}><span style={lbl}>Variants:</span><div style={{ display: "flex", gap: 3 }}>{[1, 2, 3, 4].map((n) => (<div key={n} onClick={() => updSlide(sl.id, { variantCount: n })} style={{ width: 28, height: 28, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, cursor: "pointer", border: sl.variantCount === n ? `2px solid ${C.nv}` : `1px solid ${C.bl}`, background: sl.variantCount === n ? "#f0f0ff" : "#fff" }}>{n}</div>))}</div></div>
                  <div style={{ flex: "0 0 auto" }}><span style={lbl}>Aspect:</span><select style={selS} value={sl.aspectOverride ?? "global"} onChange={(e) => updSlide(sl.id, { aspectOverride: e.target.value === "global" ? null : Number(e.target.value) })}><option value="global">Global ({ASPECTS[selAspect].label})</option>{ASPECTS.map((a, i) => <option key={a.value} value={i}>{a.label}</option>)}</select></div>
                </div>

                {/* Slide ref images */}
                <div style={{ marginBottom: 8, padding: "8px 10px", background: "#fafafa", borderRadius: 7, border: `1px solid ${C.bd}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: sl.slideRefImages.length > 0 ? 6 : 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: C.sc }}>Slide references</span>
                    <span style={{ fontSize: 9, color: C.mt }}>(primary)</span>
                    <label style={{ ...btnSm, cursor: "pointer" }}>Upload<input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { Array.from(e.target.files).forEach((f) => addSlideRef(sl.id, f)); e.target.value = ""; }} /></label>
                    {library.length > 0 && <button style={{ ...btnSm, color: C.tl, borderColor: C.tl }} onClick={() => openPicker({ type: "slide", id: sl.id })}>Browse Library</button>}
                  </div>
                  {sl.slideRefImages.length > 0 && (<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {sl.slideRefImages.map((img, ri) => (<div key={ri} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, width: 80 }}>
                      <div style={{ position: "relative" }}>
                        <img src={img.preview} style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 4, border: `2px solid ${C.tl}` }} />
                        <button onClick={() => setSlides((p) => p.map((s) => s.id === sl.id ? { ...s, slideRefImages: s.slideRefImages.filter((_, i) => i !== ri) } : s))} style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: "50%", background: C.cr, color: "#fff", border: "none", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                      </div>
                      <input list={`slide-ref-label-${sl.id}-${ri}`} style={{ width: "100%", fontSize: 7, padding: "1px 4px", borderRadius: 3, border: `1px solid ${C.bl}`, fontFamily: "'Quicksand', sans-serif", background: img.label ? "#f0f0ff" : "#fff", color: img.label ? C.nv : C.mt, outline: "none" }}
                        placeholder="Add label..."
                        value={img.label || ""} onChange={(e) => {
                          const newLabel = e.target.value;
                          setSlides((p) => p.map((s) => s.id === sl.id ? { ...s, slideRefImages: s.slideRefImages.map((x, j) => j === ri ? { ...x, label: newLabel } : x) } : s));
                        }} />
                      <datalist id={`slide-ref-label-${sl.id}-${ri}`}>
                        {REF_LABELS.map((l) => <option key={l} value={l} />)}
                      </datalist>
                    </div>))}
                  </div>)}
                  {/* Paste URL for slide ref */}
                  <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}>
                    <input style={{ ...inp, flex: 1, fontSize: 10, padding: "4px 6px" }} placeholder="Paste image URL..."
                      onKeyDown={(e) => { if (e.key === "Enter" && e.target.value) { fetchImageUrl(e.target.value, { type: "slide", id: sl.id }); e.target.value = ""; } }} />
                    <button style={{ ...btnSm, fontSize: 10 }} onClick={(e) => { const input = e.target.previousElementSibling; if (input?.value) { fetchImageUrl(input.value, { type: "slide", id: sl.id }); input.value = ""; } }}>Add URL</button>
                  </div>
                </div>

                {/* Error display - always visible */}
                {sl.error && <div style={{ padding: "8px 12px", background: C.errBg, border: `1px solid ${C.cr}`, borderRadius: 7, marginBottom: 8, fontSize: 12, color: C.cr, fontWeight: 600, lineHeight: 1.4, wordBreak: "break-word" }}>Error: {sl.error}</div>}

                {/* Variants display */}
                {sl.variants.length > 0 && sl.variants.some((v) => v.image) ? (<>
                  <div style={{ marginBottom: 8 }}>
                    <span style={lbl}>Variants — click to select:</span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {sl.variants.map((v, vi) => (<div key={vi} style={{ width: sl.variants.length === 1 ? 200 : 160, flexShrink: 0, borderRadius: 7, overflow: "hidden", border: vi === sl.selectedVariant ? `3px solid ${C.nv}` : `1px solid ${C.bd}`, cursor: v.image ? "pointer" : "default", opacity: v.image ? 1 : 0.5 }} onClick={() => { if (v.image) updSlide(sl.id, { selectedVariant: vi }); }}>
                        {v.image ? <img src={v.image} style={{ width: "100%", display: "block" }} /> : <div style={{ padding: 10, textAlign: "center", fontSize: 10, color: C.cr, background: C.errBg }}>{v.error || "No image"}</div>}
                        <div style={{ padding: "3px 6px", background: vi === sl.selectedVariant ? C.nv : "#fafafa", textAlign: "center" }}><span style={{ fontSize: 10, fontWeight: 700, color: vi === sl.selectedVariant ? "#fff" : C.sc }}>{vi === sl.selectedVariant ? "Selected" : `V${vi + 1}`}</span></div>
                        {v.blobUrl && <div style={{ padding: "2px 6px", textAlign: "center" }}><a href={v.blobUrl} download={`${sl.name ? sanitize(sl.name) : `slide_${idx + 1}`}_v${vi + 1}.png`} style={{ fontSize: 10, color: C.nv, fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>Download</a></div>}
                        {v.publicUrl && <div style={{ padding: "0 6px 4px", textAlign: "center" }}><CopyBtn text={v.publicUrl} label="Copy URL" size="sm" style={{ fontSize: 9, color: C.tl, border: "none", padding: "2px 4px" }} /></div>}
                        {v.seed && <div style={{ padding: "0 6px 2px", textAlign: "center" }}><span style={{ fontSize: 8, color: C.mt }}>Seed: {v.seed}</span></div>}
                        {v.uploadError && <div style={{ padding: "2px 6px 4px", textAlign: "center" }}><span style={{ fontSize: 8, color: C.cr }}>{v.uploadError}</span></div>}
                      </div>))}
                    </div>
                  </div>
                  {/* Selected variant URL */}
                  {sl.variants[sl.selectedVariant]?.publicUrl && (
                    <div style={{ marginBottom: 8, padding: "6px 10px", background: C.okBg, borderRadius: 6, border: `1px solid ${C.ok}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.ok }}>Image URL:</span>
                        <CopyBtn text={sl.variants[sl.selectedVariant].publicUrl} label="Copy" size="sm" style={{ fontSize: 10, color: C.nv }} />
                      </div>
                      <input style={{ ...inp, fontSize: 10, padding: "3px 6px", marginTop: 3, color: C.sc, background: "#fff" }}
                        value={sl.variants[sl.selectedVariant].publicUrl} readOnly
                        onClick={(e) => { e.target.select(); navigator.clipboard.writeText(sl.variants[sl.selectedVariant].publicUrl); }} />
                    </div>
                  )}
                  <span style={lbl}>Prompt:</span>
                  <textarea style={{ ...ta, minHeight: 80 }} value={sl.prompt} onChange={(e) => updSlide(sl.id, { prompt: e.target.value })} />
                  <button style={{ ...btn2, fontSize: 11, marginTop: 6 }} onClick={() => genOne(sl.id)}>Regenerate</button>
                </>) : (<>
                  <span style={lbl}>Image prompt:</span>
                  <textarea style={{ ...ta, minHeight: 90 }} value={sl.prompt} onChange={(e) => updSlide(sl.id, { prompt: e.target.value })} placeholder={`Describe Slide ${idx + 1}...`} />
                  {sl.error && <p style={{ fontSize: 11, color: C.cr, margin: "4px 0" }}>{sl.error}</p>}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <button style={{ ...btn2, fontSize: 11 }} onClick={() => genOne(sl.id)} disabled={!sl.prompt.trim() || sl.status === "generating"}>{sl.status === "generating" ? "Generating..." : `Generate${sl.variantCount > 1 ? ` ${sl.variantCount} variants` : ""}`}</button>
                  </div>
                </>)}
              </div>)}
            </div>
          ))}

          <div style={{ textAlign: "center", padding: "8px 0" }}><button style={{ ...btn2, padding: "8px 22px" }} onClick={() => addSlides(1)}>+ Add Slide</button></div>
          {globalErr && <div style={errBox}>{globalErr}</div>}
          {!batchRunning ? (
            <button style={{ ...btnP, opacity: totalPrompted === 0 ? 0.5 : 1 }} onClick={genAll} disabled={totalPrompted === 0}>Generate All ({totalPrompted - doneCount} remaining)</button>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ ...btn2, flex: 1, justifyContent: "center" }} onClick={() => { if (paused) { pauseRef.current = false; setPaused(false); } else { pauseRef.current = true; setPaused(true); } }}>{paused ? "Resume" : "Pause"}</button>
              <button style={{ ...btn2, flex: 1, justifyContent: "center", borderColor: C.cr, color: C.cr }} onClick={() => { cancelRef.current = true; setBatchRunning(false); }}>Cancel</button>
            </div>
          )}
          {slides.some((s) => s.status !== "idle") && <div style={{ marginTop: 6, display: "flex", gap: 10, fontSize: 11, fontWeight: 600 }}><span style={{ color: C.ok }}>{doneCount} done</span><span style={{ color: C.cr }}>{slides.filter((s) => s.status === "error").length} failed</span><span style={{ color: "#0d47a1" }}>{slides.filter((s) => s.status === "generating").length} generating</span></div>}

          {/* ─── RESULTS GALLERY (compact view of all generated images) ─── */}
          {doneCount > 0 && (
            <div style={{ ...secBox, marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={secT}>Results Gallery</div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btnSm} onClick={checkAll}>Select All</button>
                  <button style={btnSm} onClick={checkDone}>Select Done</button>
                  <button style={btnSm} onClick={uncheckAll}>Deselect</button>
                  {checkedWithImg > 0 && <button style={{ ...btnSm, background: C.nv, color: "#fff", border: "none", fontWeight: 700 }} onClick={dlSelected}>Download {checkedWithImg}</button>}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
                {slides.map((sl, idx) => {
                  const v = sl.variants[sl.selectedVariant];
                  if (!v?.image) return null;
                  return (
                    <div key={sl.id} onClick={() => toggleCheck(sl.id)} style={{
                      borderRadius: 8, overflow: "hidden", cursor: "pointer", position: "relative",
                      border: sl.checked ? `3px solid ${C.nv}` : `1px solid ${C.bd}`,
                      boxShadow: sl.checked ? `0 0 0 1px ${C.nv}` : "none",
                    }}>
                      {/* Checkbox */}
                      <div style={{
                        position: "absolute", top: 4, left: 4, width: 20, height: 20, borderRadius: 4, zIndex: 2,
                        background: sl.checked ? C.nv : "rgba(255,255,255,0.85)",
                        border: sl.checked ? "none" : `2px solid ${C.bl}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {sl.checked && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                      </div>
                      <img src={v.image} style={{ width: "100%", display: "block" }} />
                      <div style={{ padding: "4px 6px", background: sl.checked ? "#f0f0ff" : "#fafafa" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: C.nv, display: "block" }}>{sl.name || `Slide ${idx + 1}`}</span>
                        <div style={{ display: "flex", gap: 4, marginTop: 2 }}>
                          {v.blobUrl && <a href={v.blobUrl} download={`${sl.name ? sanitize(sl.name) : `slide_${idx + 1}`}.png`} style={{ fontSize: 9, color: C.nv, fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>Download</a>}
                          {v.publicUrl && <CopyBtn text={v.publicUrl} label="Copy URL" size="sm" style={{ fontSize: 9, color: C.tl, border: "none", padding: 0 }} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>)}

        {/* ═══ LIBRARY ═══ */}
        {mode === "library" && (<div style={secBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={secT}>Image Library</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ ...btn2, fontSize: 11 }} onClick={() => libUploadRef.current?.click()}>+ Upload Images</button>
              <input ref={libUploadRef} type="file" accept="image/*" multiple onChange={(e) => { Array.from(e.target.files).forEach((f) => addToLibrary(f)); e.target.value = ""; }} style={{ display: "none" }} />
            </div>
          </div>
          <p style={{ fontSize: 11, color: C.mt, margin: "0 0 10px" }}>Upload reference images here once. Then browse and pick them for any slide — no re-uploading needed. Images persist across sessions.</p>

          {/* Tag filter */}
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            <button style={pill(libFilter === "All")} onClick={() => setLibFilter("All")}>All ({library.length})</button>
            {LIB_TAGS.map((tag) => { const c = library.filter((x) => x.tag === tag).length; return c ? <button key={tag} style={pill(libFilter === tag)} onClick={() => setLibFilter(tag)}>{tag} ({c})</button> : null; })}
          </div>

          {filteredLib.length === 0 && <p style={{ fontSize: 12, color: C.mt }}>No images yet. Upload some reference images to get started.</p>}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {filteredLib.map((item) => (
              <div key={item.id} style={{ borderRadius: 8, border: `1px solid ${C.bd}`, overflow: "hidden", background: "#fafafa" }}>
                <img src={item.preview} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                <div style={{ padding: "6px 8px" }}>
                  <input style={{ ...inp, fontSize: 11, padding: "4px 6px", marginBottom: 4 }} value={item.name}
                    onChange={(e) => updateLibraryItem(item.id, { name: e.target.value })} placeholder="Name..." />
                  <select style={{ ...selS, width: "100%", marginBottom: 4 }} value={item.tag}
                    onChange={(e) => updateLibraryItem(item.id, { tag: e.target.value })}>
                    {LIB_TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <button style={{ ...btnSm, color: C.cr, width: "100%" }} onClick={() => removeFromLibrary(item.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>)}

        {/* ═══ TEMPLATES ═══ */}
        {mode === "templates" && (<div style={secBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={secT}>Templates</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ ...btn2, fontSize: 11 }} onClick={() => setEditingTpl({ id: null, name: "", category: "custom", prompt: "" })}>+ New</button>
              <button style={{ ...btnSm, color: C.tl }} onClick={exportTemplates}>Export JSON</button>
              <button style={{ ...btnSm, color: C.tl }} onClick={importTemplates}>Import JSON</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
            <button style={pill(tplFilter === "all")} onClick={() => setTplFilter("all")}>All ({templates.length})</button>
            {CATEGORIES.map((cat) => { const c = templates.filter((t) => t.category === cat.value).length; return c ? <button key={cat.value} style={pill(tplFilter === cat.value)} onClick={() => setTplFilter(cat.value)}>{cat.label} ({c})</button> : null; })}
          </div>

          {/* Also show batch preset export/import */}
          {batchPresets.length > 0 && (<div style={{ marginBottom: 10, padding: "8px 10px", background: "#fafafa", borderRadius: 7, border: `1px solid ${C.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.nv }}>Batch Presets ({batchPresets.length})</span>
              <button style={{ ...btnSm, color: C.tl }} onClick={exportPresets}>Export JSON</button>
              <button style={{ ...btnSm, color: C.tl }} onClick={importPresets}>Import JSON</button>
            </div>
          </div>)}

          {filteredTemplates.map((t) => (
            <div key={t.id} style={{ padding: "10px 12px", border: `1px solid ${C.bd}`, borderRadius: 8, marginBottom: 6, background: "#fafafa" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.nv }}>{t.name} <span style={{ fontSize: 9, color: C.mt }}>({t.category})</span></span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button style={btnSm} onClick={() => { setSPrompt(t.prompt); setSName(t.name); setMode("single"); }}>Use</button>
                  <button style={btnSm} onClick={() => setEditingTpl({ ...t })}>Edit</button>
                  <button style={{ ...btnSm, color: C.cr }} onClick={() => deleteTemplate(t.id)}>Del</button>
                </div>
              </div>
              <p style={{ fontSize: 11, color: C.sc, margin: 0, lineHeight: 1.3 }}>{t.prompt.slice(0, 120)}...</p>
            </div>
          ))}
          {editingTpl && (<div style={{ ...secBox, border: `2px solid ${C.nv}`, marginTop: 10 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 2 }}><span style={lbl}>Name:</span><input style={inp} value={editingTpl.name} onChange={(e) => setEditingTpl({ ...editingTpl, name: e.target.value })} /></div>
              <div style={{ flex: 1 }}><span style={lbl}>Category:</span><select style={{ ...inp, padding: "7px 8px" }} value={editingTpl.category} onChange={(e) => setEditingTpl({ ...editingTpl, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
            </div>
            <span style={lbl}>Prompt:</span><textarea style={{ ...ta, minHeight: 100 }} value={editingTpl.prompt} onChange={(e) => setEditingTpl({ ...editingTpl, prompt: e.target.value })} />
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              <button style={{ ...btn2, background: C.nv, color: "#fff", border: "none" }} onClick={() => { if (editingTpl.id) updateTemplate(editingTpl.id, editingTpl); else saveTemplate(editingTpl.name || "Untitled", editingTpl.category, editingTpl.prompt); setEditingTpl(null); }}>Save</button>
              <button style={btn2} onClick={() => setEditingTpl(null)}>Cancel</button>
            </div>
          </div>)}
        </div>)}

        {/* ═══ HISTORY ═══ */}
        {mode === "history" && (<div style={secBox}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={secT}>Generated Images (Supabase)</div>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ ...btnSm, color: C.nv, borderColor: C.nv }} onClick={loadSbHistory}>Refresh</button>
              {history.length > 0 && <button style={{ ...btnSm, color: C.cr }} onClick={() => setHistory([])}>Clear Local</button>}
            </div>
          </div>

          {/* Supabase recipes */}
          {sbHistory.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
              {sbHistory.map((h) => (
                <div key={h.id} style={{ borderRadius: 8, border: `1px solid ${C.bd}`, overflow: "hidden", background: "#fafafa" }}>
                  {h.public_url && <img src={h.public_url} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} onError={(e) => { e.target.style.display = "none"; }} />}
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.nv }}>{h.slide_name || h.filename}</span>
                      <span style={{ fontSize: 9, color: C.mt }}>{new Date(h.created_at).toLocaleDateString()}</span>
                    </div>
                    {h.seed && <div style={{ fontSize: 9, color: C.tl, fontWeight: 700, marginBottom: 2 }}>Seed: {h.seed}</div>}
                    <p style={{ fontSize: 10, color: C.sc, margin: "0 0 3px", lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{h.prompt}</p>
                    <div style={{ display: "flex", gap: 6, fontSize: 9, color: C.mt, marginBottom: 4, flexWrap: "wrap" }}>
                      <span>{h.model}</span>
                      <span>{h.aspect_ratio}</span>
                      <span>{h.quality}</span>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      <button style={{ ...btnSm, fontSize: 10, color: C.nv, borderColor: C.nv }} onClick={() => {
                        setSPrompt(h.prompt); setSName(h.slide_name || h.filename);
                        // Find matching model
                        const mIdx = MODELS.findIndex((m) => m.id === h.model);
                        if (mIdx >= 0) setSelModel(mIdx);
                        const aIdx = ASPECTS.findIndex((a) => a.value === h.aspect_ratio);
                        if (aIdx >= 0) setSelAspect(aIdx);
                        const qIdx = QUALITY.findIndex((q) => q.apiSize === h.quality);
                        if (qIdx >= 0) setSelQuality(qIdx);
                        setMode("single");
                      }}>Reuse Settings</button>
                      {h.public_url && <CopyBtn text={h.public_url} label="Copy URL" size="sm" style={{ fontSize: 10, color: C.tl }} />}
                      {h.seed && <CopyBtn text={String(h.seed)} label="Copy Seed" size="sm" style={{ fontSize: 10 }} />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: C.mt }}>{sbHistoryLoaded ? "No images in Supabase yet. Generate some images and they'll appear here." : "Loading..."}</p>
          )}

          {/* Local session history (fallback) */}
          {history.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C.bd}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.mt, display: "block", marginBottom: 8 }}>Local session history:</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 6 }}>
                {history.map((h) => (<div key={h.id} style={{ padding: "6px 8px", border: `1px solid ${C.bd}`, borderRadius: 6, background: "#fff" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.nv }}>{h.name}</span>
                  <p style={{ fontSize: 9, color: C.sc, margin: "2px 0", lineHeight: 1.3 }}>{h.prompt.slice(0, 60)}...</p>
                  <button style={{ ...btnSm, fontSize: 9 }} onClick={() => { setSPrompt(h.prompt); setSName(h.name); setMode("single"); }}>Reuse</button>
                </div>))}
              </div>
            </div>
          )}
        </div>)}

        {/* ═══ LIBRARY PICKER MODAL ═══ */}
        {pickerOpen && (<div style={modal} onClick={() => setPickerOpen(false)}>
          <div style={modalBox} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={secT}>Select Reference Images</div>
              <button style={{ ...btnSm, fontSize: 14, padding: "4px 10px" }} onClick={() => setPickerOpen(false)}>✕</button>
            </div>
            <p style={{ fontSize: 11, color: C.mt, margin: "0 0 10px" }}>
              Click images to select them. Then click "Add Selected" to use them as references.
              {pickerTarget?.type === "slide" && " (These will be primary references for this slide.)"}
              {pickerTarget?.type === "global" && " (These will apply to all slides.)"}
            </p>

            {/* Tag filters */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
              <button style={pill(pickerFilter === "All")} onClick={() => setPickerFilter("All")}>All ({library.length})</button>
              {LIB_TAGS.map((tag) => { const c = library.filter((x) => x.tag === tag).length; return c ? <button key={tag} style={pill(pickerFilter === tag)} onClick={() => setPickerFilter(tag)}>{tag} ({c})</button> : null; })}
            </div>

            {/* Quick select buttons */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
              <button style={btnSm} onClick={() => setPickerSelected(pickerLib.map((x) => x.id))}>Select All Visible</button>
              <button style={btnSm} onClick={() => setPickerSelected([])}>Deselect All</button>
              {pickerSelected.length > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: C.nv, alignSelf: "center" }}>{pickerSelected.length} selected</span>}
            </div>

            {pickerLib.length === 0 && <p style={{ fontSize: 12, color: C.mt }}>No images in library. Go to the Library tab to upload some first.</p>}

            {/* Image grid with selection */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 8, marginBottom: 14 }}>
              {pickerLib.map((item) => {
                const isSel = pickerSelected.includes(item.id);
                return (
                  <div key={item.id} onClick={() => togglePickerItem(item.id)} style={{
                    borderRadius: 7, overflow: "hidden", cursor: "pointer", position: "relative",
                    border: isSel ? `3px solid ${C.nv}` : `1px solid ${C.bd}`,
                    boxShadow: isSel ? `0 0 0 1px ${C.nv}` : "none",
                    opacity: isSel ? 1 : 0.8,
                    transition: "all 0.15s",
                  }}>
                    {/* Checkbox overlay */}
                    <div style={{
                      position: "absolute", top: 4, left: 4, width: 22, height: 22, borderRadius: 4,
                      background: isSel ? C.nv : "rgba(255,255,255,0.85)",
                      border: isSel ? "none" : `2px solid ${C.bl}`,
                      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2,
                    }}>
                      {isSel && <span style={{ color: "#fff", fontSize: 14, fontWeight: 700 }}>✓</span>}
                    </div>
                    <img src={item.preview} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
                    <div style={{ padding: "4px 6px", textAlign: "center", background: isSel ? "#f0f0ff" : "#fafafa" }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: isSel ? C.nv : C.sc }}>{item.name}</span>
                      {item.tag !== "Other" && <span style={{ fontSize: 8, color: C.mt, display: "block" }}>{item.tag}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Confirm button - sticky at bottom */}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
              <button style={btn2} onClick={() => setPickerOpen(false)}>Cancel</button>
              <button style={{
                ...btnP, width: "auto", padding: "10px 24px",
                opacity: pickerSelected.length === 0 ? 0.5 : 1,
              }} onClick={confirmPicker} disabled={pickerSelected.length === 0}>
                Add {pickerSelected.length} Selected
              </button>
            </div>
          </div>
        </div>)}

      </div>
    </div>
  );
}
