import { useState, useRef, useCallback, useEffect } from "react";

/* ════════════════════════════════════════════════════════════════
   SENIOR FITNESS HUB — IMAGE GENERATOR (Production v1.1)
   Per-slide: reference images, variant count, aspect override
   ════════════════════════════════════════════════════════════════ */

/* ─── DEFAULTS ─── */
const DEFAULT_TEMPLATES = [
  { id: "t1", name: "Exercise Photo", category: "exercise", prompt: "Create a clean, well-lit exercise demonstration photo showing a senior adult (age 65+) performing the exercise described. Neutral studio background, soft directional lighting, comfortable athletic clothing. Show proper form clearly. Professional fitness photography style." },
  { id: "t2", name: "Carousel Slide (Light)", category: "carousel", prompt: "Create a clean educational slide image for a senior fitness program. Cream background with navy and crimson accents. Professional, calming, senior-friendly aesthetic. No text overlay needed." },
  { id: "t3", name: "Facebook Ad", category: "ad", prompt: "Create a warm, inviting lifestyle photo for a Facebook ad targeting adults 55+. Confident senior adult in a home or outdoor setting. Natural lighting, genuine expression, aspirational but realistic." },
  { id: "t4", name: "Thumbnail", category: "thumbnail", prompt: "Create a professional thumbnail image for a senior fitness video. Bold, eye-catching composition with a clean background. Show energy and confidence." },
  { id: "t5", name: "Dark Slide (FB Group)", category: "carousel", prompt: "Create a bold, modern slide image with a pure black (#000000) background. Use teal (#14B8A6) accents, white text, and a yellow (#FFD43B) highlight box with navy (#0C115B) text. Clean, text-heavy design with minimal icons." },
];

const DEFAULT_BATCH_CONTEXTS = [
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
  { label: "Square 1:1", value: "1:1" },
  { label: "Landscape 16:9", value: "16:9" },
  { label: "Landscape 3:2", value: "3:2" },
  { label: "Standard 4:3", value: "4:3" },
  { label: "Portrait 9:16", value: "9:16" },
  { label: "Portrait 3:4", value: "3:4" },
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

/* ─── STORAGE ─── */
const LS = {
  get: (k, fb) => { try { const v = localStorage.getItem(`sfh_ig_${k}`); return v ? JSON.parse(v) : fb; } catch { return fb; } },
  set: (k, v) => { try { localStorage.setItem(`sfh_ig_${k}`, JSON.stringify(v)); } catch {} },
};

/* ─── HELPERS ─── */
const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
function base64ToBlob(d) { const [h, b] = d.split(","); const m = (h.match(/:(.*?);/) || [])[1] || "image/png"; const c = atob(b); const a = new Uint8Array(c.length); for (let i = 0; i < c.length; i++) a[i] = c.charCodeAt(i); return new Blob([a], { type: m }); }
function makeBlobUrl(d) { try { return URL.createObjectURL(base64ToBlob(d)); } catch { return d; } }
function sanitize(s) { return s.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").slice(0, 60); }

/* ─── COLORS ─── */
const C = { nv: "#0C115B", cr: "#A61E51", tl: "#14B8A6", cm: "#FAF7F2", bd: "#e8e4de", bl: "#d1cdc6", sc: "#444", mt: "#888", ok: "#1b5e20", okBg: "#e8f5e9", errBg: "#fdf2f5" };
const grad = `linear-gradient(135deg, ${C.nv}, ${C.cr})`;

/* ═══ MAIN ═══ */
export default function App() {
  /* Persisted */
  const [apiKey, setApiKey] = useState(() => LS.get("apiKey", ""));
  const [templates, setTemplates] = useState(() => LS.get("templates", DEFAULT_TEMPLATES));
  const [batchPresets, setBatchPresets] = useState(() => LS.get("batchPresets", []));
  const [history, setHistory] = useState(() => LS.get("history", []));
  useEffect(() => { LS.set("apiKey", apiKey); }, [apiKey]);
  useEffect(() => { LS.set("templates", templates); }, [templates]);
  useEffect(() => { LS.set("batchPresets", batchPresets); }, [batchPresets]);
  useEffect(() => { LS.set("history", history); }, [history]);

  /* Session */
  const [selModel, setSelModel] = useState(1);
  const [selAspect, setSelAspect] = useState(0);
  const [selQuality, setSelQuality] = useState(1);
  const [mode, setMode] = useState("single");
  const [globalErr, setGlobalErr] = useState("");

  // Single
  const [sp, setSp] = useState(0);
  const [sPrompt, setSPrompt] = useState(DEFAULT_TEMPLATES[0].prompt);
  const [sCtx, setSCtx] = useState("");
  const [sName, setSName] = useState("");
  const [sImg, setSImg] = useState(null);
  const [sBlobUrl, setSBlobUrl] = useState(null);
  const [sLoading, setSLoading] = useState(false);
  const [sErr, setSErr] = useState("");

  // Batch
  const [bp, setBp] = useState(0);
  const [bCtx, setBCtx] = useState(DEFAULT_BATCH_CONTEXTS[0].ctx);
  const [slides, setSlides] = useState([mkSlide(1)]);
  const [batchRunning, setBatchRunning] = useState(false);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const idRef = useRef(2);

  // Templates
  const [editingTpl, setEditingTpl] = useState(null);
  const [tplFilter, setTplFilter] = useState("all");
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // Global refs
  const [refImgs, setRefImgs] = useState([]);
  const fileRef = useRef(null);

  /* ─── SLIDE FACTORY ─── */
  function mkSlide(id) {
    return {
      id, name: "", prompt: "",
      variants: [],           // [{image, blobUrl}]
      selectedVariant: 0,     // which variant is "chosen"
      variantCount: 1,        // how many to generate (1-4)
      aspectOverride: null,   // null = use global, or index into ASPECTS
      slideRefImages: [],     // [{name, b64, mime, preview}] per-slide refs
      status: "idle", error: null, collapsed: false, checked: false,
    };
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
  const dupSlide = (id) => {
    const src = slides.find((s) => s.id === id); if (!src) return;
    const idx = slides.findIndex((s) => s.id === id);
    const ns = { ...mkSlide(idRef.current++), name: src.name ? `${src.name} (copy)` : "", prompt: src.prompt, variantCount: src.variantCount, aspectOverride: src.aspectOverride, slideRefImages: [...src.slideRefImages] };
    setSlides((p) => { const n = [...p]; n.splice(idx + 1, 0, ns); return n; });
  };
  const moveSlide = (id, dir) => { setSlides((p) => { const i = p.findIndex((s) => s.id === id); const j = i + dir; if (j < 0 || j >= p.length) return p; const n = [...p]; [n[i], n[j]] = [n[j], n[i]]; return n; }); };

  /* ─── SLIDE REF IMAGE UPLOAD ─── */
  const addSlideRef = (id, file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = { name: file.name, b64: ev.target.result.split(",")[1], mime: file.type, preview: ev.target.result };
      setSlides((p) => p.map((s) => s.id === id ? { ...s, slideRefImages: [...s.slideRefImages, img] } : s));
    };
    reader.readAsDataURL(file);
  };
  const rmSlideRef = (id, idx) => {
    setSlides((p) => p.map((s) => s.id === id ? { ...s, slideRefImages: s.slideRefImages.filter((_, i) => i !== idx) } : s));
  };

  /* ─── GLOBAL UPLOADS ─── */
  const onUpload = useCallback((e) => {
    Array.from(e.target.files).forEach((f) => {
      const r = new FileReader();
      r.onload = (ev) => setRefImgs((p) => [...p, { name: f.name, b64: ev.target.result.split(",")[1], mime: f.type, preview: ev.target.result }]);
      r.readAsDataURL(f);
    });
    e.target.value = "";
  }, []);

  /* ─── API CALL (accepts overrides) ─── */
  const callAPI = async (promptText, { aspectIdx = null, extraRefs = [] } = {}) => {
    const model = MODELS[selModel].id;
    const aIdx = aspectIdx !== null ? aspectIdx : selAspect;
    const aspect = ASPECTS[aIdx].value;
    const aspectLabel = ASPECTS[aIdx].label;
    const imageSize = QUALITY[selQuality].apiSize;

    const override = `\n\nCRITICAL INSTRUCTION: The output image MUST be exactly ${aspect} aspect ratio (${aspectLabel}). IGNORE any other aspect ratio, dimensions, or size instructions in the prompt above. The ${aspect} ratio is mandatory.`;

    const parts = [];
    // Per-slide refs go FIRST (primary reference)
    extraRefs.forEach((img) => parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } }));
    // Global refs go second (secondary reference)
    refImgs.forEach((img) => parts.push({ inline_data: { mime_type: img.mime, data: img.b64 } }));
    parts.push({ text: promptText + override });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: { aspectRatio: aspect, imageSize },
          },
        }),
      }
    );
    const raw = await res.text();
    const data = JSON.parse(raw);
    if (data.error) throw new Error(data.error.message);
    if (!data.candidates?.[0]?.content?.parts) throw new Error("No content returned. Model may have blocked this request.");
    let img = null, txt = "";
    data.candidates[0].content.parts.forEach((p) => {
      const d = p.inlineData || p.inline_data;
      if (d) img = `data:${d.mimeType || d.mime_type || "image/png"};base64,${d.data}`;
      else if (p.text) txt += p.text;
    });
    return { image: img, text: txt };
  };

  /* ─── HISTORY ─── */
  const addHistory = (name, prompt, imageDataUrl) => {
    if (!imageDataUrl) return;
    setHistory((prev) => [{ id: uid(), name: name || "Image", prompt: prompt.slice(0, 300), model: MODELS[selModel].label, aspect: ASPECTS[selAspect].label, quality: QUALITY[selQuality].label, timestamp: new Date().toISOString() }, ...prev].slice(0, 100));
  };

  /* ─── SINGLE GENERATE ─── */
  const genSingle = async () => {
    if (!apiKey.trim()) { setSErr("Enter your API key."); return; }
    if (!sPrompt.trim()) { setSErr("Enter a prompt."); return; }
    setSLoading(true); setSErr(""); setSImg(null);
    if (sBlobUrl) URL.revokeObjectURL(sBlobUrl); setSBlobUrl(null);
    const full = sCtx.trim() ? `${sPrompt}\n\nContext: ${sCtx}` : sPrompt;
    try {
      const r = await callAPI(full);
      if (r.image) { setSImg(r.image); setSBlobUrl(makeBlobUrl(r.image)); addHistory(sName || "Single image", full, r.image); }
      if (!r.image) setSErr("No image returned. Try a different model.");
    } catch (e) { setSErr(e.message); }
    finally { setSLoading(false); }
  };

  /* ─── BATCH: GENERATE ONE SLIDE (with variants) ─── */
  const genOne = async (id) => {
    const sl = slides.find((s) => s.id === id);
    if (!sl?.prompt.trim() || !apiKey.trim()) return;
    const count = sl.variantCount || 1;

    updSlide(id, { status: "generating", error: null, variants: [], selectedVariant: 0 });
    const full = bCtx.trim() ? `${bCtx}\n\nSlide to create:\n${sl.prompt}` : sl.prompt;
    const opts = { aspectIdx: sl.aspectOverride, extraRefs: sl.slideRefImages };

    const newVariants = [];
    for (let v = 0; v < count; v++) {
      try {
        const r = await callAPI(full, opts);
        if (r.image) {
          newVariants.push({ image: r.image, blobUrl: makeBlobUrl(r.image) });
          addHistory(sl.name || `Slide variant ${v + 1}`, full, r.image);
        } else {
          newVariants.push({ image: null, blobUrl: null, error: "No image returned" });
        }
      } catch (e) {
        newVariants.push({ image: null, blobUrl: null, error: e.message });
      }
      // Brief delay between variants
      if (v < count - 1) await new Promise((r) => setTimeout(r, 2000));
      // Update UI progressively
      updSlide(id, { variants: [...newVariants], status: "generating" });
    }

    const hasAny = newVariants.some((v) => v.image);
    updSlide(id, { variants: newVariants, status: hasAny ? "done" : "error", error: hasAny ? null : "No images generated", selectedVariant: 0 });
  };

  /* ─── BATCH: GENERATE ALL ─── */
  const genAll = async () => {
    if (!apiKey.trim()) { setGlobalErr("Enter your API key."); return; }
    const toGen = slides.filter((s) => s.prompt.trim() && s.status !== "done");
    if (!toGen.length) return;
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
  const dlSelected = () => {
    const sel = slides.filter((s) => s.checked && s.variants[s.selectedVariant]?.blobUrl);
    sel.forEach((s, i) => {
      const idx = slides.findIndex((x) => x.id === s.id);
      const fname = s.name ? sanitize(s.name) : `sfh_slide_${String(idx + 1).padStart(2, "0")}`;
      setTimeout(() => { const a = document.createElement("a"); a.href = s.variants[s.selectedVariant].blobUrl; a.download = `${fname}.png`; a.click(); }, i * 600);
    });
  };

  /* ─── TEMPLATE OPS ─── */
  const saveTemplate = (name, cat, prompt) => { setTemplates((p) => [...p, { id: uid(), name, category: cat, prompt }]); };
  const deleteTemplate = (id) => setTemplates((p) => p.filter((t) => t.id !== id));
  const updateTemplate = (id, patch) => setTemplates((p) => p.map((t) => t.id === id ? { ...t, ...patch } : t));

  /* ─── BATCH PRESET OPS ─── */
  const saveBatchPreset = (name) => {
    setBatchPresets((p) => [...p, { id: uid(), name, context: bCtx, slides: slides.map((s) => ({ name: s.name, prompt: s.prompt, variantCount: s.variantCount, aspectOverride: s.aspectOverride })), createdAt: new Date().toISOString() }]);
    setSavingPreset(false); setPresetName("");
  };
  const loadBatchPreset = (preset) => {
    setBCtx(preset.context);
    const ns = preset.slides.map((s) => ({ ...mkSlide(idRef.current++), name: s.name, prompt: s.prompt, variantCount: s.variantCount || 1, aspectOverride: s.aspectOverride ?? null }));
    setSlides(ns.length ? ns : [mkSlide(idRef.current++)]);
  };

  /* ─── COUNTS ─── */
  const checkedWithImg = slides.filter((s) => s.checked && s.variants[s.selectedVariant]?.image).length;
  const doneCount = slides.filter((s) => s.status === "done").length;
  const totalPrompted = slides.filter((s) => s.prompt.trim()).length;
  const filteredTemplates = tplFilter === "all" ? templates : templates.filter((t) => t.category === tplFilter);

  /* ─── STYLES ─── */
  const pill = (a) => ({ padding: "6px 12px", borderRadius: 16, border: a ? `2px solid ${C.nv}` : `1px solid ${C.bl}`, background: a ? C.nv : "#fff", color: a ? "#fff" : "#333", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'Quicksand', sans-serif" });
  const navTab = (a) => ({ padding: "10px 16px", fontSize: 13, fontWeight: 700, fontFamily: "'Petrona', serif", cursor: "pointer", background: "none", border: "none", borderBottom: `3px solid ${a ? C.cr : "transparent"}`, color: a ? C.nv : C.mt, whiteSpace: "nowrap" });
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
  const selStyle = { ...inp, width: "auto", padding: "4px 8px", fontSize: 11, display: "inline-block" };

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
            <span style={{ fontFamily: "'Petrona', serif", fontSize: 12, fontWeight: 700, letterSpacing: 2.5, textTransform: "uppercase", opacity: 0.85 }}>
              SENIOR FITNESS <span style={{ color: "#f8c8d8" }}>HUB</span>
            </span>
            <span style={{ fontSize: 9, fontWeight: 700, background: "rgba(255,255,255,0.15)", padding: "2px 9px", borderRadius: 12 }}>v1.1</span>
          </div>
          <h1 style={{ fontFamily: "'Petrona', serif", fontSize: 20, fontWeight: 700, margin: 0 }}>Image Generator</h1>
          <p style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>Single, Bulk, Variants — Google Nano Banana</p>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "14px 14px 40px" }}>

        {/* ─── SETTINGS ─── */}
        <div style={secBox}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" }}>
            <div style={{ flex: "2 1 260px" }}>
              <span style={lbl}>API Key:</span>
              <input type="password" placeholder="Google AI Studio key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} style={{ ...inp }} />
              {apiKey ? <span style={{ fontSize: 9, color: C.ok }}>Saved automatically</span> : <span style={{ fontSize: 9, color: C.mt }}>Free: <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" style={{ color: C.nv }}>aistudio.google.com/apikey</a></span>}
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <span style={lbl}>Model:</span>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {MODELS.map((m, i) => (
                  <div key={m.id} onClick={() => setSelModel(i)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, border: i === selModel ? `2px solid ${m.tier === "free" ? C.ok : C.cr}` : `1px solid ${C.bl}`, background: i === selModel ? (m.tier === "free" ? C.okBg : C.errBg) : "#fff" }}>{m.label}</div>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 120px" }}>
              <span style={lbl}>Default Aspect:</span>
              <select style={selStyle} value={selAspect} onChange={(e) => setSelAspect(Number(e.target.value))}>
                {ASPECTS.map((a, i) => <option key={a.value} value={i}>{a.label}</option>)}
              </select>
            </div>
            <div style={{ flex: "1 1 100px" }}>
              <span style={lbl}>Quality:</span>
              <div style={{ display: "flex", gap: 4 }}>
                {QUALITY.map((q, i) => (
                  <div key={q.label} onClick={() => setSelQuality(i)} style={{ padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600, border: i === selQuality ? `2px solid ${C.nv}` : `1px solid ${C.bl}`, background: i === selQuality ? "#f0f0ff" : "#fff" }}>{q.label}</div>
                ))}
              </div>
              <span style={{ fontSize: 9, color: C.mt }}>{QUALITY[selQuality].note}</span>
            </div>
          </div>
          {/* Global ref images */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.bd}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ ...lbl, marginBottom: 0 }}>Global reference images:</span>
              <button style={btnSm} onClick={() => fileRef.current?.click()}>+ Upload</button>
              {refImgs.length > 0 && <span style={{ fontSize: 10, color: C.mt }}>{refImgs.length} uploaded (apply to all)</span>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" multiple onChange={onUpload} style={{ display: "none" }} />
            {refImgs.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {refImgs.map((img, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <img src={img.preview} style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4, border: `1px solid ${C.bl}` }} />
                    <button onClick={() => setRefImgs((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: "50%", background: C.cr, color: "#fff", border: "none", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.bd}`, marginBottom: 13, overflowX: "auto" }}>
          {[["single", "Single"], ["batch", "Batch / Bulk"], ["templates", "Templates"], ["history", "History"]].map(([k, l]) => (
            <button key={k} style={navTab(mode === k)} onClick={() => setMode(k)}>{l}</button>
          ))}
        </div>

        {/* ═══ SINGLE ═══ */}
        {mode === "single" && (
          <>
            <div style={secBox}>
              {templates.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={lbl}>Load template:</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {templates.slice(0, 8).map((t) => <button key={t.id} style={btnSm} onClick={() => { setSPrompt(t.prompt); setSName(t.name); }}>{t.name}</button>)}
                  </div>
                </div>
              )}
              <div style={{ marginBottom: 6 }}>
                <span style={lbl}>Image name:</span>
                <input style={inp} value={sName} onChange={(e) => setSName(e.target.value)} placeholder='e.g. "Standing-Calf-Stretch"' />
              </div>
              <span style={lbl}>Prompt:</span>
              <textarea style={{ ...ta, minHeight: 90 }} value={sPrompt} onChange={(e) => setSPrompt(e.target.value)} placeholder="Describe the image..." />
              <div style={{ marginTop: 6 }}>
                <span style={lbl}>Additional context:</span>
                <textarea style={{ ...ta, minHeight: 40 }} value={sCtx} onChange={(e) => setSCtx(e.target.value)} placeholder="Exercise name, details..." />
              </div>
              {sPrompt.trim() && <button style={{ ...btnSm, marginTop: 6, color: C.nv, borderColor: C.nv }} onClick={() => saveTemplate(sName || `Template ${templates.length + 1}`, "custom", sPrompt)}>Save as template</button>}
            </div>
            {sErr && <div style={errBox}>{sErr}</div>}
            <button style={{ ...btnP, opacity: sLoading ? 0.7 : 1 }} onClick={genSingle} disabled={sLoading}>
              {sLoading ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span style={spin} />Generating...</span> : "Generate Image"}
            </button>
            {sImg && (
              <div style={{ ...secBox, marginTop: 14 }}>
                <img src={sImg} style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.bd}`, display: "block" }} />
                <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center" }}>
                  {sBlobUrl && <a href={sBlobUrl} download={`${sName ? sanitize(sName) : "sfh_image"}.png`} style={btn2}>Download PNG</a>}
                  <span style={{ fontSize: 10, color: C.mt }}>or right-click → Save</span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ BATCH ═══ */}
        {mode === "batch" && (
          <>
            {/* Context */}
            <div style={secBox}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={secT}>Shared Context</div>
                {!savingPreset ? (
                  <button style={{ ...btnSm, color: C.nv, borderColor: C.nv }} onClick={() => setSavingPreset(true)}>Save as Preset</button>
                ) : (
                  <div style={{ display: "flex", gap: 4 }}>
                    <input style={{ ...inp, width: 140, padding: "4px 8px", fontSize: 11 }} value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Preset name..." autoFocus />
                    <button style={{ ...btnSm, background: C.nv, color: "#fff", border: "none" }} onClick={() => saveBatchPreset(presetName || `Preset ${batchPresets.length + 1}`)}>Save</button>
                    <button style={btnSm} onClick={() => { setSavingPreset(false); setPresetName(""); }}>Cancel</button>
                  </div>
                )}
              </div>
              {batchPresets.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <span style={lbl}>Saved presets:</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {batchPresets.map((bp) => (
                      <div key={bp.id} style={{ display: "flex", gap: 2 }}>
                        <button style={{ ...btnSm, color: C.nv, borderColor: C.nv }} onClick={() => loadBatchPreset(bp)}>{bp.name} ({bp.slides.length})</button>
                        <button style={{ ...btnSm, color: C.cr, padding: "4px 6px" }} onClick={() => setBatchPresets((p) => p.filter((x) => x.id !== bp.id))}>×</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <span style={lbl}>Quick contexts:</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                {DEFAULT_BATCH_CONTEXTS.map((p) => <button key={p.id} style={btnSm} onClick={() => setBCtx(p.ctx)}>{p.name}</button>)}
              </div>
              <textarea style={{ ...ta, minHeight: 55 }} value={bCtx} onChange={(e) => setBCtx(e.target.value)} placeholder="Style for every slide..." />
            </div>

            {/* Toolbar */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", marginBottom: 8, padding: "7px 10px", background: "#fff", borderRadius: 8, border: `1px solid ${C.bd}` }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.nv, fontFamily: "'Petrona', serif" }}>{slides.length} Slides</span>
              <span style={{ width: 1, height: 16, background: C.bl }} />
              <button style={btnSm} onClick={() => addSlides(1)}>+1</button>
              <button style={btnSm} onClick={() => addSlides(5)}>+5</button>
              <button style={btnSm} onClick={() => addSlides(10)}>+10</button>
              <span style={{ width: 1, height: 16, background: C.bl }} />
              <button style={btnSm} onClick={collapseAll}>Collapse</button>
              <button style={btnSm} onClick={expandAll}>Expand</button>
              <div style={{ flex: 1 }} />
              <button style={btnSm} onClick={checkAll}>All</button>
              <button style={btnSm} onClick={checkDone}>Done</button>
              <button style={btnSm} onClick={uncheckAll}>None</button>
              {checkedWithImg > 0 && <button style={{ ...btnSm, background: C.nv, color: "#fff", border: "none", fontWeight: 700 }} onClick={dlSelected}>Download {checkedWithImg}</button>}
            </div>

            {/* ─── SLIDE CARDS ─── */}
            {slides.map((sl, idx) => (
              <div key={sl.id} style={{ background: "#fff", borderRadius: 9, marginBottom: 7, overflow: "hidden", border: `1px solid ${sl.checked ? C.nv : sl.status === "error" ? C.cr : sl.status === "done" ? C.ok : C.bd}`, boxShadow: sl.checked ? `0 0 0 1px ${C.nv}` : "none" }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", cursor: "pointer", background: sl.status === "done" ? "#f0faf0" : sl.status === "generating" ? "#e3f2fd" : sl.status === "error" ? C.errBg : "#fafafa" }}
                  onClick={() => updSlide(sl.id, { collapsed: !sl.collapsed })}>
                  <input type="checkbox" checked={sl.checked} onChange={() => toggleCheck(sl.id)} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, cursor: "pointer", accentColor: C.nv }} />
                  <span style={{ fontFamily: "'Petrona', serif", fontSize: 12, fontWeight: 700, color: C.nv }}>{idx + 1}</span>
                  {sl.name && <span style={{ fontSize: 11, fontWeight: 600, color: C.sc }}>{sl.name}</span>}
                  <span style={badgeS(sl.status)}>{sl.status === "idle" ? "ready" : sl.status}</span>
                  {sl.status === "generating" && <span style={spinD} />}
                  {sl.variantCount > 1 && <span style={{ fontSize: 9, color: C.tl, fontWeight: 700 }}>{sl.variants.length}/{sl.variantCount} variants</span>}
                  {sl.aspectOverride !== null && <span style={{ fontSize: 9, color: C.nv, fontWeight: 600 }}>{ASPECTS[sl.aspectOverride].label}</span>}
                  {sl.collapsed && sl.prompt && !sl.name && <span style={{ fontSize: 10, color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{sl.prompt.split("\n")[0].slice(0, 40)}...</span>}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 2 }} onClick={(e) => e.stopPropagation()}>
                    <button style={btnSm} onClick={() => moveSlide(sl.id, -1)} disabled={idx === 0}>↑</button>
                    <button style={btnSm} onClick={() => moveSlide(sl.id, 1)} disabled={idx === slides.length - 1}>↓</button>
                    <button style={btnSm} onClick={() => dupSlide(sl.id)}>Copy</button>
                    {slides.length > 1 && <button style={{ ...btnSm, color: C.cr }} onClick={() => rmSlide(sl.id)}>×</button>}
                  </div>
                  <span style={{ fontSize: 12, color: C.mt }}>{sl.collapsed ? "▸" : "▾"}</span>
                </div>

                {/* Body */}
                {!sl.collapsed && (
                  <div style={{ padding: "10px 12px" }}>
                    {/* Row 1: Name + Settings */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                      <div style={{ flex: "2 1 200px" }}>
                        <span style={lbl}>Slide name / tag:</span>
                        <input style={inp} value={sl.name} onChange={(e) => updSlide(sl.id, { name: e.target.value })} placeholder={`e.g. "GRP-P1-SAT-S${idx + 1}-DK"`} />
                      </div>
                      <div style={{ flex: "0 0 auto" }}>
                        <span style={lbl}>Variants:</span>
                        <div style={{ display: "flex", gap: 3 }}>
                          {[1, 2, 3, 4].map((n) => (
                            <div key={n} onClick={() => updSlide(sl.id, { variantCount: n })} style={{
                              width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 13, fontWeight: 700, cursor: "pointer",
                              border: sl.variantCount === n ? `2px solid ${C.nv}` : `1px solid ${C.bl}`,
                              background: sl.variantCount === n ? "#f0f0ff" : "#fff", color: sl.variantCount === n ? C.nv : C.sc
                            }}>{n}</div>
                          ))}
                        </div>
                      </div>
                      <div style={{ flex: "0 0 auto" }}>
                        <span style={lbl}>Aspect:</span>
                        <select style={selStyle} value={sl.aspectOverride ?? "global"} onChange={(e) => updSlide(sl.id, { aspectOverride: e.target.value === "global" ? null : Number(e.target.value) })}>
                          <option value="global">Global ({ASPECTS[selAspect].label})</option>
                          {ASPECTS.map((a, i) => <option key={a.value} value={i}>{a.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Row 2: Slide reference images */}
                    <div style={{ marginBottom: 8, padding: "8px 10px", background: "#fafafa", borderRadius: 7, border: `1px solid ${C.bd}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: sl.slideRefImages.length > 0 ? 6 : 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.sc }}>Slide reference images</span>
                        <span style={{ fontSize: 9, color: C.mt }}>(primary — overrides global)</span>
                        <label style={{ ...btnSm, cursor: "pointer", marginLeft: "auto" }}>
                          + Add
                          <input type="file" accept="image/*" multiple style={{ display: "none" }}
                            onChange={(e) => { Array.from(e.target.files).forEach((f) => addSlideRef(sl.id, f)); e.target.value = ""; }} />
                        </label>
                      </div>
                      {sl.slideRefImages.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {sl.slideRefImages.map((img, ri) => (
                            <div key={ri} style={{ position: "relative" }}>
                              <img src={img.preview} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, border: `2px solid ${C.tl}` }} />
                              <button onClick={() => rmSlideRef(sl.id, ri)} style={{ position: "absolute", top: -3, right: -3, width: 14, height: 14, borderRadius: "50%", background: C.cr, color: "#fff", border: "none", fontSize: 9, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Row 3: Prompt + Results */}
                    {sl.variants.length > 0 && sl.variants.some((v) => v.image) ? (
                      <>
                        {/* Variant gallery */}
                        <div style={{ marginBottom: 8 }}>
                          <span style={lbl}>Generated variants — click to select:</span>
                          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(sl.variants.length, 4)}, 1fr)`, gap: 8 }}>
                            {sl.variants.map((v, vi) => (
                              <div key={vi} style={{ borderRadius: 7, overflow: "hidden", border: vi === sl.selectedVariant ? `3px solid ${C.nv}` : `1px solid ${C.bd}`, cursor: v.image ? "pointer" : "default", opacity: v.image ? 1 : 0.5 }}
                                onClick={() => { if (v.image) updSlide(sl.id, { selectedVariant: vi }); }}>
                                {v.image ? (
                                  <img src={v.image} style={{ width: "100%", display: "block" }} />
                                ) : (
                                  <div style={{ padding: 12, textAlign: "center", fontSize: 10, color: C.cr, background: C.errBg }}>
                                    {v.error || "No image"}
                                  </div>
                                )}
                                <div style={{ padding: "4px 6px", background: vi === sl.selectedVariant ? C.nv : "#fafafa", textAlign: "center" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: vi === sl.selectedVariant ? "#fff" : C.sc }}>
                                    {vi === sl.selectedVariant ? "Selected" : `Variant ${vi + 1}`}
                                  </span>
                                </div>
                                {v.blobUrl && (
                                  <div style={{ padding: "2px 6px 4px", textAlign: "center" }}>
                                    <a href={v.blobUrl} download={`${sl.name ? sanitize(sl.name) : `slide_${idx + 1}`}_v${vi + 1}.png`}
                                      style={{ fontSize: 10, color: C.nv, fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>Download</a>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                        {/* Prompt (editable for regeneration) */}
                        <span style={lbl}>Prompt:</span>
                        <textarea style={{ ...ta, minHeight: 80 }} value={sl.prompt} onChange={(e) => updSlide(sl.id, { prompt: e.target.value })} />
                        <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
                          <button style={{ ...btn2, fontSize: 11 }} onClick={() => genOne(sl.id)}>Regenerate ({sl.variantCount} variant{sl.variantCount > 1 ? "s" : ""})</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span style={lbl}>Image prompt:</span>
                        <textarea style={{ ...ta, minHeight: 90 }} value={sl.prompt} onChange={(e) => updSlide(sl.id, { prompt: e.target.value })}
                          placeholder={`Describe Slide ${idx + 1} in full detail...\n\nPure black background (#000000).\nTeal heading...\netc.`} />
                        {sl.error && <p style={{ fontSize: 11, color: C.cr, margin: "4px 0" }}>{sl.error}</p>}
                        <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <button style={{ ...btn2, fontSize: 11 }} onClick={() => genOne(sl.id)}
                            disabled={!sl.prompt.trim() || sl.status === "generating"}>
                            {sl.status === "generating" ? `Generating...` : `Generate ${sl.variantCount > 1 ? `${sl.variantCount} variants` : ""}`}
                          </button>
                          {templates.length > 0 && (
                            <select style={selStyle} onChange={(e) => { if (e.target.value) { const t = templates.find((x) => x.id === e.target.value); if (t) updSlide(sl.id, { prompt: t.prompt }); e.target.value = ""; } }}>
                              <option value="">Load template...</option>
                              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}

            <div style={{ textAlign: "center", padding: "8px 0" }}>
              <button style={{ ...btn2, padding: "8px 22px" }} onClick={() => addSlides(1)}>+ Add Slide</button>
            </div>

            {globalErr && <div style={errBox}>{globalErr}</div>}

            {!batchRunning ? (
              <button style={{ ...btnP, opacity: totalPrompted === 0 ? 0.5 : 1 }} onClick={genAll} disabled={totalPrompted === 0}>
                Generate All ({totalPrompted - doneCount} remaining)
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btn2, flex: 1, justifyContent: "center" }} onClick={() => { if (paused) { pauseRef.current = false; setPaused(false); } else { pauseRef.current = true; setPaused(true); } }}>{paused ? "Resume" : "Pause"}</button>
                <button style={{ ...btn2, flex: 1, justifyContent: "center", borderColor: C.cr, color: C.cr }} onClick={() => { cancelRef.current = true; setBatchRunning(false); }}>Cancel</button>
              </div>
            )}

            {slides.some((s) => s.status !== "idle") && (
              <div style={{ marginTop: 6, display: "flex", gap: 10, fontSize: 11, fontWeight: 600 }}>
                <span style={{ color: C.ok }}>{doneCount} done</span>
                <span style={{ color: C.cr }}>{slides.filter((s) => s.status === "error").length} failed</span>
                <span style={{ color: "#0d47a1" }}>{slides.filter((s) => s.status === "generating").length} generating</span>
              </div>
            )}
          </>
        )}

        {/* ═══ TEMPLATES ═══ */}
        {mode === "templates" && (
          <div style={secBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={secT}>Template Library</div>
              <button style={{ ...btn2, fontSize: 11 }} onClick={() => setEditingTpl({ id: null, name: "", category: "custom", prompt: "" })}>+ New</button>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
              <button style={pill(tplFilter === "all")} onClick={() => setTplFilter("all")}>All ({templates.length})</button>
              {CATEGORIES.map((cat) => { const c = templates.filter((t) => t.category === cat.value).length; return c ? <button key={cat.value} style={pill(tplFilter === cat.value)} onClick={() => setTplFilter(cat.value)}>{cat.label} ({c})</button> : null; })}
            </div>
            {filteredTemplates.map((t) => (
              <div key={t.id} style={{ padding: "10px 12px", border: `1px solid ${C.bd}`, borderRadius: 8, marginBottom: 6, background: "#fafafa" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.nv }}>{t.name}</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button style={btnSm} onClick={() => { setSPrompt(t.prompt); setSName(t.name); setMode("single"); }}>Use</button>
                    <button style={btnSm} onClick={() => setEditingTpl({ ...t })}>Edit</button>
                    <button style={{ ...btnSm, color: C.cr }} onClick={() => deleteTemplate(t.id)}>Delete</button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: C.sc, margin: 0, lineHeight: 1.3 }}>{t.prompt.slice(0, 120)}...</p>
              </div>
            ))}
            {editingTpl && (
              <div style={{ ...secBox, border: `2px solid ${C.nv}`, marginTop: 10 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 2 }}><span style={lbl}>Name:</span><input style={inp} value={editingTpl.name} onChange={(e) => setEditingTpl({ ...editingTpl, name: e.target.value })} /></div>
                  <div style={{ flex: 1 }}><span style={lbl}>Category:</span><select style={{ ...inp, padding: "7px 8px" }} value={editingTpl.category} onChange={(e) => setEditingTpl({ ...editingTpl, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                </div>
                <span style={lbl}>Prompt:</span>
                <textarea style={{ ...ta, minHeight: 100 }} value={editingTpl.prompt} onChange={(e) => setEditingTpl({ ...editingTpl, prompt: e.target.value })} />
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button style={{ ...btn2, background: C.nv, color: "#fff", border: "none" }} onClick={() => { if (editingTpl.id) updateTemplate(editingTpl.id, editingTpl); else saveTemplate(editingTpl.name || "Untitled", editingTpl.category, editingTpl.prompt); setEditingTpl(null); }}>Save</button>
                  <button style={btn2} onClick={() => setEditingTpl(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ HISTORY ═══ */}
        {mode === "history" && (
          <div style={secBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={secT}>History</div>
              {history.length > 0 && <button style={{ ...btnSm, color: C.cr }} onClick={() => setHistory([])}>Clear</button>}
            </div>
            {history.length === 0 && <p style={{ fontSize: 12, color: C.mt }}>No history yet.</p>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8 }}>
              {history.map((h) => (
                <div key={h.id} style={{ padding: "8px", border: `1px solid ${C.bd}`, borderRadius: 7, background: "#fafafa" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: C.nv }}>{h.name}</span>
                    <span style={{ fontSize: 9, color: C.mt }}>{new Date(h.timestamp).toLocaleDateString()}</span>
                  </div>
                  <p style={{ fontSize: 10, color: C.sc, margin: 0, lineHeight: 1.3 }}>{h.prompt.slice(0, 80)}...</p>
                  <div style={{ display: "flex", gap: 6, fontSize: 9, color: C.mt, marginTop: 3 }}><span>{h.model}</span><span>{h.aspect}</span></div>
                  <button style={{ ...btnSm, marginTop: 4, fontSize: 10 }} onClick={() => { setSPrompt(h.prompt); setSName(h.name); setMode("single"); }}>Reuse</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
