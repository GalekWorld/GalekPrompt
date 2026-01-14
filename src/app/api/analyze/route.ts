import { NextRequest, NextResponse } from 'next/server';

// Azure credentials desde variables de entorno
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY!;
const AZURE_ANALYZE_URL = `${process.env.AZURE_ENDPOINT}/vision/v3.2/analyze?visualFeatures=Description,Tags,Categories,Color,Objects,Faces,Adult,ImageType`;

// Interfaces
interface ImageAnalysis {
  type: string;
  style: string;
  lighting: string;
  composition: string;
  colors: string;
  mood: string;
  realism: string;
  detailedDescription: string;
}

const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder - Gemini will use your uploaded photo',
  'Paste entire prompt as-is, do not edit it',
  'If results are not perfect, try regenerating the prompt',
  'For best results, use a well-lit, front-facing photo of your face'
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

// Función que llama a Azure Vision usando base64
async function analyzeImageWithAzureVision(imageBase64: string): Promise<ImageAnalysis> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
  const imageBuffer = base64ToArrayBuffer(base64Data);

  console.log('[Vision] Sending image to Azure...');

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

  // ---------- Análisis detallado ----------
  const caption = data.description?.captions?.[0]?.text || '';
  const tags = data.tags?.map((t: any) => t.name) || [];
  const tagsText = tags.join(', ').toLowerCase();
  const dominantColors = data.color?.dominantColors || [];
  const imageTypeRaw = data.imageType?.clipArtType === 1 ? 'Illustration' : 'Photo';

  // Rostros y expresión
  const faces = data.faces || [];
  const faceDescription = faces.map((f: any) => {
    const emotions = f.emotion ? Object.entries(f.emotion).sort((a,b)=>b[1]-a[1])[0][0] : '';
    return `Age ${f.age}, ${f.gender}, emotion: ${emotions}`;
  }).join('; ');

  // Objetos detectados (ropa, accesorios, fondo)
  const objects = data.objects || [];
  const objectsDesc = objects.map((o: any) => `${o.object} at [${o.rectangle.left},${o.rectangle.top},${o.rectangle.w},${o.rectangle.h}]`).join('; ');

  // Tipo y estilo
  let type = imageTypeRaw;
  if (tagsText.includes('anime') || tagsText.includes('manga')) type = 'Anime';
  else if (imageTypeRaw.toLowerCase().includes('digital')) type = 'Digital Art';

  let style = 'Professional photography';
  if (caption.toLowerCase().includes('portrait') || tagsText.includes('portrait')) style = 'Professional portrait photography';
  else if (caption.toLowerCase().includes('studio') || tagsText.includes('studio')) style = 'Studio photography';
  else if (type === 'Illustration') style = 'Digital illustration with clean lines';
  else if (type === 'Digital Art') style = 'Digital artwork with rich details';
  else if (type === 'Anime') style = 'Anime-style artwork';
  else if (type === '3D Render') style = '3D rendered image';

  // Lighting
  let lighting = 'Balanced natural lighting';
  if (caption.toLowerCase().includes('bright') || caption.toLowerCase().includes('sunny')) lighting = 'Bright and well-lit scene';
  else if (caption.toLowerCase().includes('dark') || caption.toLowerCase().includes('shadowy')) lighting = 'Low light or moody atmosphere';
  else if (caption.toLowerCase().includes('studio')) lighting = 'Studio lighting with controlled shadows';

  // Composición
  let composition = 'Well-composed with balanced elements';
  if (caption.toLowerCase().includes('close-up') || tagsText.includes('close-up')) composition = 'Close-up shot';
  else if (caption.toLowerCase().includes('centered') || caption.toLowerCase().includes('center')) composition = 'Centered subject with balanced framing';

  // Colores
  let colors = 'Natural and balanced color palette';
  if (dominantColors.length > 0) colors = `Color palette featuring: ${dominantColors.join(', ')}`;

  // Mood
  let mood = 'Neutral and balanced';
  if (caption.toLowerCase().includes('happy') || caption.toLowerCase().includes('smile')) mood = 'Cheerful and positive';
  else if (caption.toLowerCase().includes('sad') || caption.toLowerCase().includes('melancholic')) mood = 'Moody and melancholic';
  else if (caption.toLowerCase().includes('dramatic') || caption.toLowerCase().includes('intense')) mood = 'Dramatic and intense';

  // Realismo
  let realism = 'High realism with natural textures';
  if (type === 'Illustration') realism = 'Medium realism - digital illustration';
  else if (type === 'Digital Art') realism = 'Highly detailed digital artwork';
  else if (type === 'Anime') realism = 'Stylized anime aesthetic';

  // Descripción ultra detallada
  const detailedDescription = `
Caption: ${caption}
Faces: ${faceDescription || 'No faces detected'}
Objects: ${objectsDesc || 'No objects detected'}
Colors: ${colors}
Tags: ${tagsText}
Categories: ${data.categories?.map((c:any)=>c.name).join(', ') || 'N/A'}
`;

  return { type, style, lighting, composition, colors, mood, realism, detailedDescription };
}

// Generar prompt ultra detallado
function generatePromptForGemini(analysis: ImageAnalysis): string {
  return `
Create a highly realistic image based on the following analysis:

- Type/Style: ${analysis.type}, ${analysis.style}
- Lighting: ${analysis.lighting}
- Composition: ${analysis.composition}
- Mood: ${analysis.mood}
- Realism: ${analysis.realism}
- Colors: ${analysis.colors}
- Detailed scene analysis:
${analysis.detailedDescription}

Important: Use the user's uploaded face photo as a base, matching the lighting, angle, pose, mood, and all details described above to create a cohesive, realistic portrait. Maintain natural skin texture, realistic hair and clothing details, accurate background, and proper depth of field.
`;
}

// POST handler
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    const validation = validateImageBase64(image);
    if (!validation.valid) return NextResponse.json({ success: false, error: validation.error }, { status: 400 });

    const analysis = await analyzeImageWithAzureVision(image);
    const prompt = generatePromptForGemini(analysis);

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
