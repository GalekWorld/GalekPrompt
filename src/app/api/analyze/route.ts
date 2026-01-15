import { NextRequest, NextResponse } from 'next/server';

// Azure credentials desde variables de entorno
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY!;
const AZURE_ANALYZE_URL = `${process.env.AZURE_ENDPOINT}/vision/v3.2/analyze?visualFeatures=Description,Tags,Categories,Color,Objects,Faces,Adult,ImageType`;

// Siempre al final del prompt (EXACTO)
const FACE_LOCK_SUFFIX =
  'YOU MUST USE THE EXACT SAME FACE, FACIAL STRUCTURE, AND PHYSICAL APPEARANCE 100% IDENTICAL TO THE SUBJECT IN THE INPUT REFERENCE IMAGE. DO NOT ADD FACIAL HAIR OR FEATURES NOT PRESENT IN THE USER\'S ACTUAL FACE.';

// Interfaces
interface ImageAnalysis {
  type: string;
  style: string;
  lighting: string;
  composition: string;
  colors: string;
  mood: string;
  realism: string;

  // Raw-ish description strings (kept for compatibility)
  personDescription: string;
  objectsDescription: string;
  environmentDescription: string;

  imageWidth?: number;
  imageHeight?: number;
}

// Validación de base64
function validateImageBase64(imageData: string) {
  if (!imageData || typeof imageData !== 'string') return { valid: false, error: 'Invalid image data' };
  if (!imageData.startsWith('data:image/')) return { valid: false, error: 'Invalid image format' };

  const supportedFormats = ['data:image/jpeg', 'data:image/png', 'data:image/webp'];
  const isValidFormat = supportedFormats.some((format) => imageData.startsWith(format));
  if (!isValidFormat) return { valid: false, error: 'Unsupported image format. Use JPG, PNG, or WebP' };

  return { valid: true };
}

// Convertir base64 a ArrayBuffer
function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

/* ------------------------------------------------------------------ */
/* ---------------------- PROMPT HELPERS ----------------------------- */
/* ------------------------------------------------------------------ */

type Rect = { left: number; top: number; width: number; height: number };

function getRect(o: any): Rect | null {
  const r = o?.rectangle || o?.faceRectangle || o?.faceRectangle?.rectangle || null;
  if (!r) return null;

  const left = Number(r.left ?? r.x);
  const top = Number(r.top ?? r.y);
  const width = Number(r.width ?? r.w);
  const height = Number(r.height ?? r.h);

  if ([left, top, width, height].some((n) => Number.isNaN(n))) return null;
  return { left, top, width, height };
}

function rectCenter(r: Rect) {
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function arFromDims(w?: number, h?: number): string {
  if (!w || !h || w <= 0 || h <= 0) return '1:1';

  const r = w / h;

  const candidates: Array<{ label: string; value: number }> = [
    { label: '9:16', value: 9 / 16 },
    { label: '3:4', value: 3 / 4 },
    { label: '4:5', value: 4 / 5 },
    { label: '1:1', value: 1 },
    { label: '5:4', value: 5 / 4 },
    { label: '4:3', value: 4 / 3 },
    { label: '16:9', value: 16 / 9 }
  ];

  let best = candidates[0];
  let bestDiff = Infinity;

  for (const c of candidates) {
    const diff = Math.abs(r - c.value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = c;
    }
  }

  if (bestDiff > 0.08) {
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
    const gw = Math.round(w);
    const gh = Math.round(h);
    const g = gcd(gw, gh);
    const rw = Math.max(1, Math.round(gw / g));
    const rh = Math.max(1, Math.round(gh / g));
    return `${rw}:${rh}`;
  }

  return best.label;
}

function bucketPosition(r: Rect, imgW?: number, imgH?: number) {
  const { cx, cy } = rectCenter(r);
  const nx = imgW && imgH ? clamp01(cx / imgW) : clamp01(cx / 1000);
  const ny = imgW && imgH ? clamp01(cy / imgH) : clamp01(cy / 1000);

  const horiz = nx < 0.33 ? 'left' : nx < 0.66 ? 'center' : 'right';
  const vert = ny < 0.33 ? 'upper' : ny < 0.66 ? 'middle' : 'lower';
  return { horiz, vert };
}

function cleanSentence(s: string) {
  return (s || '').trim().replace(/\s+/g, ' ').replace(/^\.*|\.*$/g, '');
}

function safeJoinSentences(parts: string[]) {
  return parts
    .map((p) => cleanSentence(p))
    .filter(Boolean)
    .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------------ */
/* ------------------- PROMPT GENERATION (SIMPLIFIED) ---------------- */
/* ------------------------------------------------------------------ */

/**
 * Objetivo: un único prompt final, “Shot on iPhone...”,
 * centrado en describir la foto fielmente con artefactos realistas.
 * NO devuelve tips, NO devuelve analysis al cliente, solo prompt.
 *
 * Importante:
 * - No inventar marcas/logos no confirmables. (Se evita añadir marcas.)
 * - El mensaje FACE_LOCK_SUFFIX debe ir SIEMPRE AL FINAL del prompt.
 * - --ar se coloca ANTES del mensaje final para que el mensaje sea lo último.
 */
function generatePrompt(analysis: ImageAnalysis, azureRaw?: any): string {
  const w = analysis.imageWidth;
  const h = analysis.imageHeight;
  const ar = arFromDims(w, h);

  const caption = cleanSentence(azureRaw?.description?.captions?.[0]?.text || '');
  const tags: string[] = Array.isArray(azureRaw?.tags) ? azureRaw.tags.map((t: any) => String(t?.name || '')).filter(Boolean) : [];
  const tagsLower = tags.join(', ').toLowerCase();

  // Vertical/horizontal hint (como tus ejemplos)
  const orientationHint =
    ar === '9:16' ? 'A candid, vertical smartphone photo.' : ar === '16:9' ? 'A candid, horizontal smartphone photo.' : 'A candid smartphone photo.';

  // “Shot on iPhone...” constante (tus ejemplos) — sin inventar más metadata.
  const cameraLine = 'Shot on iPhone 15 Pro.';

  // Heurísticas simples (sin inventar escena; solo “look & feel”)
  const isLowLight =
    analysis.lighting.toLowerCase().includes('low') ||
    analysis.lighting.toLowerCase().includes('dark') ||
    caption.toLowerCase().includes('night') ||
    tagsLower.includes('night');

  const lightingArtifacts = isLowLight
    ? safeJoinSentences([
        'Visible high-ISO grain and noisy shadows typical of a smartphone in low light',
        'Deep contrast with crushed blacks in the darkest areas',
        'Slight motion blur on small fast-moving details consistent with handheld capture'
      ])
    : safeJoinSentences([
        'Natural smartphone sharpening and micro-contrast on fine textures',
        'Specular highlights can clip slightly in the brightest areas',
        'Subtle lens flare or glare may appear if strong light hits the lens'
      ]);

  // Subject (sin rasgos inventados)
  const faces = Array.isArray(azureRaw?.faces) ? azureRaw.faces : [];
  let subjectSentence = 'The main subject is a person.';
  if (faces.length > 0) {
    // Elegir cara “principal” por tamaño
    let best = faces[0];
    let bestArea = -1;
    for (const f of faces) {
      const fr = f?.faceRectangle;
      const area = fr ? Number(fr.width) * Number(fr.height) : 0;
      if (area > bestArea) {
        bestArea = area;
        best = f;
      }
    }
    const age = best?.age != null ? `approx. age ${best.age}` : null;
    const gender = best?.gender ? String(best.gender) : null;
    const meta = [age, gender].filter(Boolean).join(', ');
    subjectSentence = meta ? `The main subject is a person (${meta}).` : 'The main subject is a person.';
  }

  // Objects (máximo 10, con posición; sin marcas)
  const rawObjects = Array.isArray(azureRaw?.objects) ? azureRaw.objects : [];
  const objectsTop = rawObjects.slice(0, 10).map((o: any) => {
    const rect = getRect(o);
    const pos = rect ? bucketPosition(rect, w, h) : null;
    const name = o?.object ? String(o.object) : 'object';
    const where = pos ? `${pos.horiz} ${pos.vert}` : 'unknown position';
    return `${name} in the ${where} of the frame`;
  });

  const objectsSentence =
    objectsTop.length > 0
      ? `Key elements visible: ${objectsTop.join(', ')}.`
      : 'Key elements are not clearly identifiable beyond the main subject.';

  // Scene context (caption + environmentDescription; limpiando duplicaciones)
  const env = cleanSentence(analysis.environmentDescription);
  const sceneSentence = safeJoinSentences([
    caption ? `Scene: ${caption}` : '',
    env ? `Additional scene context: ${env}` : ''
  ]);

  // Style block (sin adornos raros)
  const styleSentence = safeJoinSentences([
    orientationHint,
    cleanSentence(analysis.style),
    `Lighting: ${cleanSentence(analysis.lighting)}`,
    `Composition: ${cleanSentence(analysis.composition)}`,
    `Color palette: ${cleanSentence(analysis.colors)}`,
    `Mood: ${cleanSentence(analysis.mood)}`,
    `Realism: ${cleanSentence(analysis.realism)}`
  ]);

  // No inventar logos
  const noLogoLine = 'If any logos or text are present, keep them not legible and do not invent any new logos or brand marks.';

  // Construcción final (mensaje SIEMPRE al final)
  const body = [
    cameraLine,
    styleSentence,
    subjectSentence,
    sceneSentence,
    objectsSentence,
    `Smartphone look: ${lightingArtifacts}`,
    noLogoLine,
    `--ar ${ar}`
  ]
    .map((s) => cleanSentence(s))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return `${body} ${FACE_LOCK_SUFFIX}`.trim();
}

/* ------------------------------------------------------------------ */
/* ----------------------- AZURE ANALYZE (EXISTING) ------------------- */
/* ------------------------------------------------------------------ */

async function analyzeImageWithAzureVision(imageBase64: string): Promise<{ analysis: ImageAnalysis; raw: any }> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const imageBuffer = base64ToArrayBuffer(base64Data);

  const response = await fetch(AZURE_ANALYZE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Ocp-Apim-Subscription-Key': AZURE_VISION_KEY
    },
    body: imageBuffer
  });

  if (!response.ok) {
    const text = await response.text();
    console.error('[Vision] Azure API error:', text);
    throw new Error(`Azure Vision API failed with status ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (!data) throw new Error('Azure Vision API returned empty response');

  const imageWidth = Number(data?.metadata?.width);
  const imageHeight = Number(data?.metadata?.height);

  const faces = data.faces || [];
  const personDescription =
    faces
      .map((f: any, i: number) => {
        const emotions = f.emotion
          ? Object.entries(f.emotion).sort((a, b) => (b[1] as number) - (a[1] as number))[0][0]
          : '';
        const fr = f.faceRectangle;
        const rectStr = fr ? `[${fr.left},${fr.top},${fr.width},${fr.height}]` : '[unknown]';
        return `Person ${i + 1}: Age ${f.age}, ${f.gender}, emotion: ${emotions || 'unknown'}, face rectangle ${rectStr}`;
      })
      .join('\n') || 'No faces detected';

  const objects = data.objects || [];
  const objectsDescription =
    objects
      .map((o: any) => {
        const r = o.rectangle || {};
        const left = r.left ?? r.x ?? 0;
        const top = r.top ?? r.y ?? 0;
        const w = r.w ?? r.width ?? 0;
        const h = r.h ?? r.height ?? 0;
        return `${o.object} located at [${left},${top},${w},${h}]`;
      })
      .join('\n') || 'No prominent objects detected';

  const caption = data.description?.captions?.[0]?.text || '';
  const tags = data.tags?.map((t: any) => t.name) || [];
  const tagsText = tags.join(', ').toLowerCase();
  const dominantColors = data.color?.dominantColors || [];

  let environmentDescription = `Scene summary: ${caption}. `;
  if (dominantColors.length) environmentDescription += `Dominant colors: ${dominantColors.join(', ')}. `;
  if (tags.length) environmentDescription += `Tags: ${tagsText}. `;
  if (data.categories?.length) environmentDescription += `Categories: ${data.categories.map((c: any) => c.name).join(', ')}. `;

  let type = data.imageType?.clipArtType === 1 ? 'Illustration' : 'Photo';
  if (tagsText.includes('anime') || tagsText.includes('manga')) type = 'Anime';
  else if (type.toLowerCase().includes('digital')) type = 'Digital Art';

  let style = 'Professional photography';
  if (caption.toLowerCase().includes('portrait') || tagsText.includes('portrait')) style = 'Professional portrait photography';
  else if (caption.toLowerCase().includes('studio')) style = 'Studio photography';

  let lighting = 'Balanced natural lighting';
  if (caption.toLowerCase().includes('bright') || caption.toLowerCase().includes('sunny')) lighting = 'Bright and well-lit scene';
  else if (caption.toLowerCase().includes('dark') || caption.toLowerCase().includes('shadowy') || caption.toLowerCase().includes('night'))
    lighting = 'Low light or moody atmosphere';
  else if (caption.toLowerCase().includes('studio')) lighting = 'Studio lighting with controlled shadows';

  let composition = 'Well-composed with balanced elements';
  if (caption.toLowerCase().includes('close-up') || tagsText.includes('close-up')) composition = 'Close-up shot';
  else if (caption.toLowerCase().includes('centered') || caption.toLowerCase().includes('center')) composition = 'Centered subject with balanced framing';

  let colors = 'Natural and balanced color palette';
  if (dominantColors.length) colors = `Color palette featuring: ${dominantColors.join(', ')}`;

  let mood = 'Neutral and balanced';
  if (caption.toLowerCase().includes('happy') || caption.toLowerCase().includes('smile')) mood = 'Cheerful and positive';
  else if (caption.toLowerCase().includes('sad') || caption.toLowerCase().includes('melancholic')) mood = 'Moody and melancholic';

  let realism = 'High realism with natural textures';
  if (type === 'Illustration') realism = 'Medium realism - digital illustration';
  else if (type === 'Digital Art') realism = 'Highly detailed digital artwork';
  else if (type === 'Anime') realism = 'Stylized anime aesthetic';

  const analysis: ImageAnalysis = {
    type,
    style,
    lighting,
    composition,
    colors,
    mood,
    realism,
    personDescription,
    objectsDescription,
    environmentDescription,
    imageWidth: Number.isFinite(imageWidth) ? imageWidth : undefined,
    imageHeight: Number.isFinite(imageHeight) ? imageHeight : undefined
  };

  return { analysis, raw: data };
}

// POST handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    const validation = validateImageBase64(image);
    if (!validation.valid) return NextResponse.json({ success: false, error: validation.error }, { status: 400 });

    const { analysis, raw } = await analyzeImageWithAzureVision(image);
    const prompt = generatePrompt(analysis, raw);

    // ÚNICA salida: prompt
    return NextResponse.json({ success: true, prompt });
  } catch (error: any) {
    console.error('[POST] Error:', error.message || error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

// OPTIONS handler (CORS)
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
