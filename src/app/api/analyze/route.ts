import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export const runtime = 'nodejs'; // importante en Vercel para usar el SDK de OpenAI

// Frase final obligatoria (exacta)
const FACE_LOCK_SUFFIX =
  "YOU MUST USE THE EXACT SAME FACE, FACIAL STRUCTURE, AND PHYSICAL APPEARANCE 100% IDENTICAL TO THE SUBJECT IN THE INPUT REFERENCE IMAGE. DO NOT ADD FACIAL HAIR OR FEATURES NOT PRESENT IN THE USER'S ACTUAL FACE.";

// Tips opcionales para tu UI
const DEFAULT_TIPS = [
  'Paste the full prompt as-is into your image model',
  'If the output looks too clean, add more grain / Smart HDR / smartphone artifacts',
  'If the output invents brands/logos, add “logo not legible” and “no invented logos”',
  'If scene elements drift, regenerate or tighten object descriptions'
];

// Validación de data URL base64
function validateImageBase64(imageData: string) {
  if (!imageData || typeof imageData !== 'string') return { valid: false, error: 'Invalid image data' };
  if (!imageData.startsWith('data:image/')) return { valid: false, error: 'Invalid image format' };

  const supportedFormats = ['data:image/jpeg', 'data:image/png', 'data:image/webp'];
  const isValidFormat = supportedFormats.some((format) => imageData.startsWith(format));
  if (!isValidFormat) return { valid: false, error: 'Unsupported image format. Use JPG, PNG, or WebP' };

  return { valid: true };
}

// Asegura que el prompt termine EXACTO con la frase final (sin duplicarla)
function ensureSuffixLast(text: string) {
  const t = (text || '').trim();
  const suffixEscaped = FACE_LOCK_SUFFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const stripped = t.replace(new RegExp(`${suffixEscaped}\\s*$`), '').trim();
  return `${stripped} ${FACE_LOCK_SUFFIX}`.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    const validation = validateImageBase64(image);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'Missing OPENAI_API_KEY' }, { status: 500 });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
      baseURL: 'https://api.openai.com/v1'
    });

    // Instrucciones: prompt único, hiper fiel, sin inventar marcas/textos
    const system = [
      'You generate ONE single image-generation prompt that replicates the input photo as faithfully as possible.',
      'Be extremely specific about: clothing, accessories, posture, exact subject position in frame, background setting, time of day, lighting direction/quality, camera artifacts, and composition.',
      'Do NOT invent brands, logos, or readable text. If present but unclear, say "logo not legible" / "text not legible".',
      'If uncertain about a detail, describe it generically rather than guessing.',
      'Output ONLY the final prompt text (no JSON, no headings, no bullet points).',
      'Start with exactly: "Shot on iPhone 15 Pro."',
      'Include an aspect ratio token at the end like "--ar 9:16" if the photo is vertical (otherwise choose appropriately).',
      'Immediately after the aspect ratio token, append the exact face-lock sentence provided (do not paraphrase it).'
    ].join(' ');

    const userText =
      'Write a realistic smartphone-photo prompt that matches the image exactly. Include clothing details, pose, facial expression (without inventing features), background environment, lighting, and smartphone computational photography artifacts (Smart HDR, grain, slight motion blur, lens flare if present).';

    // Modelo recomendado por calidad/precio
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      max_tokens: 750, // controla coste
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: image } }
          ]
        }
      ]
    });

    const raw = resp.choices?.[0]?.message?.content ?? '';
    const prompt = ensureSuffixLast(raw);

    // analysis mínimo para evitar que tu frontend rompa (type existe, arrays existen)
    const analysis = {
      type: 'Photo',
      style: 'Smartphone photography',
      lighting: 'As in reference image',
      composition: 'As in reference image',
      colors: 'As in reference image',
      mood: 'As in reference image',
      realism: 'High realism (photo)',
      personDescription: '',
      objectsDescription: '',
      environmentDescription: '',
      imageWidth: undefined as number | undefined,
      imageHeight: undefined as number | undefined,
      tags: [] as string[],
      objects: [] as any[],
      faces: [] as any[],
      categories: [] as string[],
      dominantColors: [] as string[]
    };

    return NextResponse.json({
      success: true,
      prompt,
      analysis,
      tips: DEFAULT_TIPS
    });
  } catch (err: any) {
    const message = err?.message ? String(err.message) : 'Unknown error';
    console.error('[POST] Error:', message);

    const isDev = process.env.NODE_ENV !== 'production';
    return NextResponse.json(
      { success: false, error: isDev ? message : 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

// CORS preflight
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
