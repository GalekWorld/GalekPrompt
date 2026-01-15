import { NextRequest, NextResponse } from 'next/server';

// Azure credentials desde variables de entorno
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY!;
const AZURE_ANALYZE_URL = `${process.env.AZURE_ENDPOINT}/vision/v3.2/analyze?visualFeatures=Description,Tags,Categories,Color,Objects,Faces,Adult,ImageType`;

// Interfaces
interface ImageAnalysis {
  // High-level summary fields
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

  // Extra helpful metadata (optional but improves prompt reliability)
  imageWidth?: number;
  imageHeight?: number;
}

const DEFAULT_TIPS = [
  'In Gemini, upload TWO images: (1) the reference scene image (Pinterest), and (2) a clear face photo of you',
  'Paste the entire prompt as-is, do not edit it',
  'Your face photo is used ONLY as identity reference (not as a background/style reference)',
  'For best results, use a well-lit, front-facing face photo with neutral expression',
  'If results are not perfect, try regenerating the prompt'
];

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
/* ---------------------- PROMPT HELPERS (NEW) ----------------------- */
/* ------------------------------------------------------------------ */

type Rect = { left: number; top: number; width: number; height: number };

function getRect(o: any): Rect | null {
  // Azure sometimes returns {rectangle:{x,y,w,h}} for objects, and {faceRectangle:{left,top,width,height}} for faces.
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

function describeRectPosition(r: Rect, imgW?: number, imgH?: number) {
  // Prefer normalized coordinates if we know image size; otherwise fallback to heuristics.
  const { cx, cy } = rectCenter(r);

  let nx = cx;
  let ny = cy;

  if (imgW && imgH && imgW > 0 && imgH > 0) {
    nx = cx / imgW;
    ny = cy / imgH;
  } else {
    // Fallback heuristic
    nx = Math.max(0, Math.min(1, cx / 1000));
    ny = Math.max(0, Math.min(1, cy / 1000));
  }

  const horiz = nx < 0.33 ? 'left side of the frame' : nx < 0.66 ? 'center of the frame' : 'right side of the frame';
  const vert = ny < 0.33 ? 'upper part of the frame' : ny < 0.66 ? 'middle of the frame' : 'lower part of the frame';

  return `${horiz}, ${vert}`;
}

function extractMainFaceRectFromAzureData(data: any): Rect | null {
  const faces = Array.isArray(data?.faces) ? data.faces : [];
  if (!faces.length) return null;

  let best: { area: number; rect: Rect } | null = null;
  for (const f of faces) {
    const rect = getRect({ faceRectangle: f.faceRectangle });
    if (!rect) continue;
    const area = rect.width * rect.height;
    if (!best || area > best.area) best = { area, rect };
  }
  return best?.rect ?? null;
}

function buildNegativePrompt(extra?: string[]) {
  const base = [
    // Identity / face quality
    'no double face',
    'no duplicated head',
    'no face distortion',
    'no asymmetrical eyes',
    'no cross-eyed',
    'no deformed jaw',
    'no warped facial features',
    'no uncanny skin',
    'no plastic skin',
    'no waxy skin',

    // Hands / anatomy
    'no extra fingers',
    'no missing fingers',
    'no fused fingers',
    'no deformed hands',
    'no broken wrists',
    'no malformed anatomy',

    // Text / logos
    'no gibberish text',
    'no random letters',
    'no invented logos',
    'no fake brand marks',

    // Quality / artifacts
    'no low resolution',
    'no heavy noise',
    'no jpeg artifacts',
    'no oversharpening halos',

    // Unwanted changes (relaxed to allow natural integration)
    'do not change the environment',
    'do not change the overall outfit style or colors (minor fit adjustments allowed if needed for realism)',
    'do not change the overall pose and body posture (minor natural adjustments allowed for realism)',
    'do not change the lighting direction',

    // Style (for realism)
    'no cartoon',
    'no anime',
    'no illustration',
    'no painting'
  ];

  const merged = extra?.length ? base.concat(extra) : base;
  return merged.join(', ');
}

function buildClothingPolicy() {
  return `
Clothing & brands policy:
- Describe clothing, materials, fit, and colors only if they are clearly visible in the image.
- If a logo/brand is NOT clearly readable: write "logo not legible" and DO NOT guess brands or models.
- If you must suggest a vibe: use "style similar to ..." without placing any readable logos.
`.trim();
}

// Generar prompt ultra detallado + negativos (UPDATED)
function generatePromptForGemini(analysis: ImageAnalysis, azureRaw?: any): string {
  const mainFaceRect = azureRaw ? extractMainFaceRectFromAzureData(azureRaw) : null;
  const facePos = mainFaceRect
    ? describeRectPosition(mainFaceRect, analysis.imageWidth, analysis.imageHeight)
    : 'unknown position in the frame';

  const objectsLower = (analysis.objectsDescription || '').toLowerCase();
  const hasVehicle =
    objectsLower.includes('car') ||
    objectsLower.includes('vehicle') ||
    objectsLower.includes('automobile') ||
    objectsLower.includes('truck') ||
    objectsLower.includes('motorcycle') ||
    objectsLower.includes('bike');

  const detailDirectives = `
Detail level requirements (strict):
- Be extremely specific about: pose, head angle, gaze direction, expression, hand placement, body orientation, and subject placement in frame.
- Be extremely specific about environment: 8–15 background elements with relative positions (left/right/behind/foreground).
- Be extremely specific about camera: shot type, lens focal length, depth of field, angle, lighting direction, shadows, reflections, color grading.
- Only state as facts what is visible or strongly supported by the analysis; otherwise mark as "not identifiable" / "not legible".
`.trim();

  const vehicleDirective = hasVehicle
    ? `
Vehicles (if present):
- Describe vehicle type, approximate size, color, cleanliness, and orientation (front/3-4/side) using what is visible.
- Brand/model ONLY if you can read it; otherwise: "brand not identifiable".
`.trim()
    : `
Vehicles:
- If there is no vehicle visible, do not invent one.
`.trim();

  const negative = buildNegativePrompt([
    // Explicit anti-hard-swap constraints
    'no hard face swap look',
    'no pasted-on face',
    'no mismatched skin tone between face and neck',
    'no wrong lighting on the face',
    'no identity drift (keep the user identity consistent)',
    'do not alter other people in the scene'
  ]);

  return `
You will be given:
(1) A reference scene image (Pinterest / target scene).
(2) A separate face photo of the user (identity reference only).

TASK:
Create a new image that matches the reference scene as closely as possible.
Use the user's face photo ONLY to guide the identity of the main subject in the scene.
The final result must look like a real photo taken in the reference scene, not like a pasted face.

MAIN SUBJECT SELECTION:
- The "main subject" is the person whose face is located at: ${facePos}.
- If multiple people are present, apply the user's identity ONLY to the main subject. Do not change other people.

IDENTITY RULES (critical):
- Keep the main subject as the same person as in the user's face photo (identity consistency).
- Do NOT perform a hard face swap. Integrate naturally.
- Preserve key facial structure from the user's face photo (eyes/nose/mouth proportions, jawline, cheekbones), while matching the reference scene’s pose, head orientation, and expression intensity.
- Match lighting direction, shadow falloff, color temperature, skin texture, perspective, and depth of field to the reference scene so the face belongs in the scene.
- The user's face photo must NOT influence background, clothing, camera style, or lighting of the scene—ONLY identity.

SCENE (from analysis):
${analysis.environmentDescription}

PEOPLE / SUBJECT (from analysis):
${analysis.personDescription}

OBJECTS / KEY ELEMENTS (from analysis):
${analysis.objectsDescription}

IMAGE ATTRIBUTES (from analysis):
- Type / Style: ${analysis.type}, ${analysis.style}
- Lighting: ${analysis.lighting}
- Composition: ${analysis.composition}
- Colors: ${analysis.colors}
- Mood: ${analysis.mood}
- Realism: ${analysis.realism}

${detailDirectives}

${buildClothingPolicy()}

SUBJECT DESCRIPTION (must be explicit, do not be vague):
- Subject placement in frame: describe whether subject is left/center/right, close-up/medium/full-body.
- Pose: specify stance/sitting, weight distribution, arm positions, hand positions, shoulder angle.
- Head: specify tilt left/right (degrees if possible), chin up/down, gaze direction, expression intensity.
- Outfit: list each garment (outerwear/top/bottom/shoes), material, fit, color; logos only if legible; otherwise write "logo not legible".

ENVIRONMENT DESCRIPTION (must be explicit, do not be vague):
- List 8–15 environmental elements (foreground/midground/background) and where they are located (left/right/behind/above/below).
- Describe ground/floor texture, reflections, weather conditions, haze/smoke if any.
- Describe light sources and reflections on major surfaces.

CAMERA / PHOTOGRAPHY (must be explicit):
- Shot type: close-up / medium / full body.
- Lens: choose one (24mm / 35mm / 50mm / 85mm) that matches the reference.
- Depth of field: low/medium/high + bokeh description.
- Camera angle: eye-level / high angle / low angle.
- Lighting: key/fill/rim directions consistent with reference.

${vehicleDirective}

NEGATIVE PROMPT:
${negative}
`.trim();
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

  // ----------- PERSON / FACES -----------
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

  // ----------- OBJECTS -----------
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

  // ----------- ENVIRONMENT / SCENE -----------
  const caption = data.description?.captions?.[0]?.text || '';
  const tags = data.tags?.map((t: any) => t.name) || [];
  const tagsText = tags.join(', ').toLowerCase();
  const dominantColors = data.color?.dominantColors || [];

  let environmentDescription = `Scene summary: ${caption}. `;
  if (dominantColors.length) environmentDescription += `Dominant colors: ${dominantColors.join(', ')}. `;
  if (tags.length) environmentDescription += `Tags: ${tagsText}. `;
  if (data.categories?.length) environmentDescription += `Categories: ${data.categories.map((c: any) => c.name).join(', ')}. `;

  // ----------- TYPE, STYLE, LIGHTING, COMPOSITION, MOOD, REALISM -----------
  let type = data.imageType?.clipArtType === 1 ? 'Illustration' : 'Photo';
  if (tagsText.includes('anime') || tagsText.includes('manga')) type = 'Anime';
  else if (type.toLowerCase().includes('digital')) type = 'Digital Art';

  let style = 'Professional photography';
  if (caption.toLowerCase().includes('portrait') || tagsText.includes('portrait')) style = 'Professional portrait photography';
  else if (caption.toLowerCase().includes('studio')) style = 'Studio photography';

  let lighting = 'Balanced natural lighting';
  if (caption.toLowerCase().includes('bright') || caption.toLowerCase().includes('sunny')) lighting = 'Bright and well-lit scene';
  else if (caption.toLowerCase().includes('dark') || caption.toLowerCase().includes('shadowy')) lighting = 'Low light or moody atmosphere';
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
    const prompt = generatePromptForGemini(analysis, raw);

    return NextResponse.json({
      success: true,
      analysis,
      prompt,
      tips: DEFAULT_TIPS
    });
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
