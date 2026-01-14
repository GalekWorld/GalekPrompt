import { NextRequest, NextResponse } from 'next/server';

// Azure credentials desde variables de entorno
const AZURE_VISION_KEY = process.env.AZURE_VISION_KEY!;
const AZURE_ANALYZE_URL = `${process.env.AZURE_ENDPOINT}/vision/v3.2/analyze?visualFeatures=Description,Tags,Categories,ImageType,Color`;

interface ImageAnalysis {
  type: string;
  style: string;
  lighting: string;
  composition: string;
  colors: string;
  mood: string;
  realism: string;
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

// Convertir base64 a ArrayBuffer para Azure
function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

// Función que llama a Azure Vision usando array buffer
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

  // ---------- Mantengo tu lógica original ----------
  const imageTypeRaw =
    data.imageType?.lineDrawingType === 1 || data.imageType?.clipArtType === 1
      ? 'Illustration'
      : 'Photo';
  const caption = data.description?.captions?.[0]?.text || '';
  const captionLower = caption.toLowerCase();
  const tags = data.tags?.map((t: any) => t.name) || [];
  const tagsText = tags.join(', ').toLowerCase();
  const dominantColors = data.color?.dominantColors || [];

  // Tipo
  let type = imageTypeRaw;
  if (tagsText.includes('anime') || tagsText.includes('manga')) type = 'Anime';
  else if (imageTypeRaw.toLowerCase().includes('digital')) type = 'Digital Art';

  // Estilo
  let style = 'Professional photography';
  if (captionLower.includes('portrait') || tagsText.includes('portrait')) style = 'Professional portrait photography';
  else if (captionLower.includes('landscape') || tagsText.includes('landscape')) style = 'Landscape photography';
  else if (captionLower.includes('studio') || tagsText.includes('studio')) style = 'Studio photography';
  else if (captionLower.includes('cinematic') || captionLower.includes('dramatic')) style = 'Cinematic photography';
  else if (type === 'Illustration') style = 'Digital illustration with clean lines';
  else if (type === 'Digital Art') style = 'Digital artwork with rich details';
  else if (type === 'Anime') style = 'Anime-style artwork';
  else if (type === '3D Render') style = '3D rendered image';

  // Lighting
  let lighting = 'Balanced natural lighting';
  if (captionLower.includes('bright') || captionLower.includes('sunny') || captionLower.includes('sunlight')) lighting = 'Bright and well-lit scene';
  else if (captionLower.includes('backlit')) lighting = 'Backlit subject with dramatic effect';
  else if (captionLower.includes('dark') || captionLower.includes('shadowy')) lighting = 'Low light or moody atmosphere';
  else if (captionLower.includes('studio lighting') || captionLower.includes('artificial')) lighting = 'Studio lighting with controlled shadows';
  else if (captionLower.includes('golden')) lighting = 'Golden hour warm lighting';

  // Composición
  let composition = 'Well-composed with balanced elements';
  if (captionLower.includes('close-up') || tagsText.includes('close-up')) composition = 'Close-up shot';
  else if (captionLower.includes('centered') || captionLower.includes('center')) composition = 'Centered subject with balanced framing';

  // Colores
  let colors = 'Natural and balanced color palette';
  if (dominantColors.length > 0) {
    const colorNames = dominantColors.slice(0, 5).join(', ');
    if (colorNames.length > 0) colors = `Color palette featuring: ${colorNames}`;
  }

  // Mood
  let mood = 'Neutral and balanced';
  if (captionLower.includes('happy') || captionLower.includes('joyful') || captionLower.includes('smile')) mood = 'Cheerful and positive';
  else if (captionLower.includes('sad') || captionLower.includes('melancholic')) mood = 'Moody and melancholic';
  else if (captionLower.includes('dramatic') || captionLower.includes('intense')) mood = 'Dramatic and intense';
  else if (captionLower.includes('peaceful') || captionLower.includes('calm') || captionLower.includes('serene')) mood = 'Peaceful and serene';
  else if (captionLower.includes('romantic') || captionLower.includes('intimate')) mood = 'Romantic and intimate';

  // Realismo
  let realism = 'High realism with natural textures';
  if (type === 'Illustration') realism = 'Medium realism - digital illustration';
  else if (type === 'Digital Art') realism = 'Highly detailed digital artwork';
  else if (type === 'Anime') realism = 'Stylized anime aesthetic';
  else if (type === '3D Render') realism = 'Photorealistic 3D rendering';

  return { type, style, lighting, composition, colors, mood, realism };
}

// Generar prompt
function generatePromptForGemini(analysis: ImageAnalysis): string {
  return `Create a ${analysis.type.toLowerCase()} in ${analysis.style.toLowerCase()} style, featuring [USER FACE] as the main subject.

The image should use ${analysis.lighting.toLowerCase()}, with a ${analysis.composition.toLowerCase()} approach.

The color palette should consist of ${analysis.colors.toLowerCase()}, creating a ${analysis.mood.toLowerCase()} atmosphere. The overall ${analysis.realism.toLowerCase()} quality with natural textures and professional lighting.

Key visual elements to include:
- ${analysis.lighting.toLowerCase()}
- ${analysis.composition.toLowerCase()}
- Natural skin tones and realistic features
- Appropriate background context
- Professional color grading matching the ${analysis.style.toLowerCase()} aesthetic

Important: Use the user's uploaded face photo as a base, matching the lighting, angle, and mood described above to create a cohesive, realistic portrait. Maintain the ${analysis.mood.toLowerCase()} atmosphere while ensuring that the face looks natural and well-integrated into the scene.`;
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
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
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
