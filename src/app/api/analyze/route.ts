import { NextRequest, NextResponse } from 'next/server';

// -------------------- Azure Vision (v3.2) --------------------
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY!;
const AZURE_ANALYZE_URL = `${process.env.AZURE_ENDPOINT}/vision/v3.2/analyze?visualFeatures=Description,Tags,Categories,Color,Objects,Faces,Adult,ImageType`;

// -------------------- Azure OpenAI (Vision) --------------------
// Docs: vision-enabled chat models via /openai/v1/chat/completions in Azure OpenAI
// https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/gpt-with-vision?view=foundry-classic   [oai_citation:3‡Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/gpt-with-vision?view=foundry-classic&utm_source=chatgpt.com)
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT!; // e.g. https://{resource}.openai.azure.com
const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY!;
const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT!; // your deployed vision-capable model

const FACE_LOCK_SUFFIX =
  "YOU MUST USE THE EXACT SAME FACE, FACIAL STRUCTURE, AND PHYSICAL APPEARANCE 100% IDENTICAL TO THE SUBJECT IN THE INPUT REFERENCE IMAGE. DO NOT ADD FACIAL HAIR OR FEATURES NOT PRESENT IN THE USER'S ACTUAL FACE.";

const DEFAULT_TIPS = [
  'Paste the full prompt as-is into your image model',
  'If the output looks too clean, add more grain / Smart HDR / smartphone artifacts',
  'If the output invents brands/logos, add “logo not legible” and “no invented logos”',
  'If scene elements drift, regenerate or tighten object descriptions'
];

interface ImageAnalysis {
  type: string;
  style: string;
  lighting: string;
  composition: string;
  colors: string;
  mood: string;
  realism: string;

  personDescription: string;
  objectsDescription: string;
  environmentDescription: string;

  imageWidth?: number;
  imageHeight?: number;

  tags?: string[];
  categories?: string[];
  dominantColors?: string[];
  objects?: Array<{ name: string; confidence?: number }>;
  faces?: Array<{ age?: number; gender?: string; left?: number; top?: number; width?: number; height?: number }>;
}

// -------------------- utils --------------------

function validateImageBase64(imageData: string) {
  if (!imageData || typeof imageData !== 'string') return { valid: false, error: 'Invalid image data' };
  if (!imageData.startsWith('data:image/')) return { valid: false, error: 'Invalid image format' };

  const supportedFormats = ['data:image/jpeg', 'data:image/png', 'data:image/webp'];
  const isValidFormat = supportedFormats.some((format) => imageData.startsWith(format));
  if (!isValidFormat) return { valid: false, error: 'Unsupported image format. Use JPG, PNG, or WebP' };

  return { valid: true };
}

function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

function cleanSentence(s: string) {
  return (s || '').trim().replace(/\s+/g, ' ').replace(/^\.*|\.*$/g, '');
}

function safeJoin(parts: string[]) {
  return parts.map(cleanSentence).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
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
  return best.label;
}

// -------------------- Azure Vision analyze --------------------

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

  const tagsArr: string[] = Array.isArray(data?.tags) ? data.tags.map((t: any) => String(t?.name || '')).filter(Boolean) : [];
  const categoriesArr: string[] = Array.isArray(data?.categories) ? data.categories.map((c: any) => String(c?.name || '')).filter(Boolean) : [];
  const dominantColorsArr: string[] = Array.isArray(data?.color?.dominantColors) ? data.color.dominantColors.map((c: any) => String(c)) : [];

  const objectsArr: Array<{ name: string; confidence?: number }> = Array.isArray(data?.objects)
    ? data.objects.map((o: any) => ({
        name: String(o?.object || 'object'),
        confidence: typeof o?.confidence === 'number' ? o.confidence : undefined
      }))
    : [];

  const facesArr: Array<{ age?: number; gender?: string; left?: number; top?: number; width?: number; height?: number }> = Array.isArray(data?.faces)
    ? data.faces.map((f: any) => ({
        age: typeof f?.age === 'number' ? f.age : undefined,
        gender: f?.gender ? String(f.gender) : undefined,
        left: typeof f?.faceRectangle?.left === 'number' ? f.faceRectangle.left : undefined,
        top: typeof f?.faceRectangle?.top === 'number' ? f.faceRectangle.top : undefined,
        width: typeof f?.faceRectangle?.width === 'number' ? f.faceRectangle.width : undefined,
        height: typeof f?.faceRectangle?.height === 'number' ? f.faceRectangle.height : undefined
      }))
    : [];

  const caption = data.description?.captions?.[0]?.text || '';

  const personDescription =
    (data.faces || [])
      .map((f: any, i: number) => {
        const fr = f.faceRectangle;
        const rectStr = fr ? `[${fr.left},${fr.top},${fr.width},${fr.height}]` : '[unknown]';
        return `Person ${i + 1}: Age ${f.age}, ${f.gender}, face rectangle ${rectStr}`;
      })
      .join('\n') || 'No faces detected';

  const objectsDescription =
    (data.objects || [])
      .map((o: any) => {
        const r = o.rectangle || {};
        const left = r.left ?? r.x ?? 0;
        const top = r.top ?? r.y ?? 0;
        const w = r.w ?? r.width ?? 0;
        const h = r.h ?? r.height ?? 0;
        return `${o.object} located at [${left},${top},${w},${h}]`;
      })
      .join('\n') || 'No prominent objects detected';

  let environmentDescription = `Scene summary: ${caption}. `;
  if (dominantColorsArr.length) environmentDescription += `Dominant colors: ${dominantColorsArr.join(', ')}. `;
  if (tagsArr.length) environmentDescription += `Tags: ${tagsArr.join(', ').toLowerCase()}. `;
  if (categoriesArr.length) environmentDescription += `Categories: ${categoriesArr.join(', ')}. `;

  // Heurísticas looks (lo mínimo)
  const tagsText = tagsArr.join(', ').toLowerCase();
  let type = data.imageType?.clipArtType === 1 ? 'Illustration' : 'Photo';
  if (tagsText.includes('anime') || tagsText.includes('manga')) type = 'Anime';

  let style = 'Smartphone photography';
  if (caption.toLowerCase().includes('portrait') || tagsText.includes('portrait')) style = 'Portrait smartphone photography';

  let lighting = 'Natural lighting';
  if (caption.toLowerCase().includes('night') || caption.toLowerCase().includes('dark') || tagsText.includes('night')) lighting = 'Low light / night lighting';

  let composition = 'Candid snapshot composition';
  let colors = dominantColorsArr.length ? `Color palette featuring: ${dominantColorsArr.join(', ')}` : 'Natural color palette';
  let mood = 'Neutral';
  let realism = 'High realism (photo)';

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
    imageHeight: Number.isFinite(imageHeight) ? imageHeight : undefined,
    tags: tagsArr,
    categories: categoriesArr,
    dominantColors: dominantColorsArr,
    objects: objectsArr,
    faces: facesArr
  };

  return { analysis, raw: data };
}

// -------------------- Azure OpenAI Vision: detailed prompt --------------------

async function generatePromptWithVisionModel(params: {
  imageDataUrl: string;
  analysis: ImageAnalysis;
}): Promise<string> {
  const { imageDataUrl, analysis } = params;
  const ar = arFromDims(analysis.imageWidth, analysis.imageHeight);

  // Instrucciones para que describa TODO (ropa, postura, fondo, etc.) sin inventar marcas
  const system = [
    'You are generating a single image-generation prompt that replicates the input photo as faithfully as possible.',
    'Be extremely specific about: subject position, posture, clothing, accessories, background setting, time of day, lighting direction/quality, camera artifacts, and composition.',
    'Do NOT invent brands, logos, or readable text. If present but unclear, say "logo not legible" / "text not legible".',
    'If unsure about a detail, describe it generically rather than guessing.',
    'Output ONLY the final prompt text (no JSON, no headings, no bullet points).'
  ].join(' ');

  // Damos algo de “estructura” con Azure Vision para orientar, pero el modelo VE la imagen.
  const userText = safeJoin([
    'Generate a prompt in the style of: "Shot on iPhone 15 Pro..." candid snapshot, like high-detail photography prompts.',
    `Aspect ratio must end with: --ar ${ar}`,
    `High-level hints from detector (may be incomplete): ${analysis.environmentDescription}`,
    `Detected objects (may be incomplete): ${analysis.objects?.map((o) => o.name).join(', ') || 'none'}`,
    `Detected face count: ${analysis.faces?.length ?? 0}`
  ]);

  const payload = {
    model: AZURE_OPENAI_DEPLOYMENT,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageDataUrl } }
        ]
      }
    ],
    temperature: 0.2
  };

  const url = `${AZURE_OPENAI_ENDPOINT}/openai/v1/chat/completions`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': AZURE_OPENAI_KEY
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error('[Azure OpenAI] Error:', t);
    throw new Error(`Azure OpenAI failed with status ${resp.status}: ${t}`);
  }

  const json = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content || typeof content !== 'string') throw new Error('Azure OpenAI returned empty content');

  // Garantías:
  // - poner --ar si el modelo se lo “olvida” (por robustez)
  // - poner el FACE_LOCK_SUFFIX SIEMPRE AL FINAL, EXACTO
  let out = content.trim();

  if (!/--ar\s+\S+/.test(out)) out = `${out} --ar ${ar}`.trim();

  // Asegura que el suffix sea lo último, sin duplicarlo
  const suffixEscaped = FACE_LOCK_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  out = out.replace(new RegExp(`${suffixEscaped}\\s*$`), '').trim();
  out = `${out} ${FACE_LOCK_SUFFIX}`.trim();

  return out;
}

// -------------------- handlers --------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    const validation = validateImageBase64(image);
    if (!validation.valid) return NextResponse.json({ success: false, error: validation.error }, { status: 400 });

    // 1) Azure Vision (estructura / compatibilidad)
    const { analysis } = await analyzeImageWithAzureVision(image);

    // 2) Modelo con visión (detalle real: ropa, fondo, posición, etc.)
    const prompt = await generatePromptWithVisionModel({ imageDataUrl: image, analysis });

    return NextResponse.json({
      success: true,
      prompt,
      analysis, // compatibilidad UI
      tips: DEFAULT_TIPS
    });
  } catch (error: any) {
    console.error('[POST] Error:', error.message || error);
    return NextResponse.json({ success: false, error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

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
