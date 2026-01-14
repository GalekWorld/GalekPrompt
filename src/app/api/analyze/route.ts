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
  personDescription: string;
  objectsDescription: string;
  environmentDescription: string;
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

// Analizar imagen con Azure Vision
async function analyzeImageWithAzureVision(imageBase64: string): Promise<ImageAnalysis> {
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

  // ----------- PERSON / FACES -----------
  const faces = data.faces || [];
  const personDescription = faces.map((f: any, i: number) => {
    const emotions = f.emotion ? Object.entries(f.emotion).sort((a,b)=>b[1]-a[1])[0][0] : '';
    return `Person ${i+1}: Age ${f.age}, ${f.gender}, emotion: ${emotions}, face rectangle [${f.faceRectangle.left},${f.faceRectangle.top},${f.faceRectangle.width},${f.faceRectangle.height}]`;
  }).join('\n') || 'No faces detected';

  // ----------- OBJECTS -----------
  const objects = data.objects || [];
  const objectsDescription = objects.map((o: any) => {
    return `${o.object} located at [${o.rectangle.left},${o.rectangle.top},${o.rectangle.w},${o.rectangle.h}]`;
  }).join('\n') || 'No prominent objects detected';

  // ----------- ENVIRONMENT / SCENE -----------
  const caption = data.description?.captions?.[0]?.text || '';
  const tags = data.tags?.map((t: any) => t.name) || [];
  const tagsText = tags.join(', ').toLowerCase();
  const dominantColors = data.color?.dominantColors || [];

  let environmentDescription = `Scene summary: ${caption}. `;
  if (dominantColors.length) environmentDescription += `Dominant colors: ${dominantColors.join(', ')}. `;
  if (tags.length) environmentDescription += `Tags: ${tagsText}. `;
  if (data.categories?.length) environmentDescription += `Categories: ${data.categories.map((c:any)=>c.name).join(', ')}. `;

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

  return { type, style, lighting, composition, colors, mood, realism, personDescription, objectsDescription, environmentDescription };
}

// Generar prompt ultra detallado tipo ejemplo que me diste
function generatePromptForGemini(analysis: ImageAnalysis): string {
  return `
With the reference image and without changing facial features, create an image using the following detailed analysis:

Person:
${analysis.personDescription}
Clothing and accessories: inferred from objects and tags if possible.

Objects / Key Elements:
${analysis.objectsDescription}

Environment / Scene:
${analysis.environmentDescription}

Image Attributes:
- Type/Style: ${analysis.type}, ${analysis.style}
- Lighting: ${analysis.lighting}
- Composition: ${analysis.composition}
- Mood: ${analysis.mood}
- Realism: ${analysis.realism}

Important: Use the user's uploaded face photo as a base, keeping pose, expression, clothing, accessories, and environment consistent with the original image. Maintain natural textures, realistic lighting, depth, and color accuracy.
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

}
