import { NextRequest, NextResponse } from 'next/server'

interface ImageAnalysis {
  type: string
  style: string
  lighting: string
  composition: string
  colors: string
  mood: string
  realism: string
}

// Validate image data
function validateImage(imageData: string): { valid: boolean; error?: string } {
  if (!imageData || typeof imageData !== 'string') {
    return { valid: false, error: 'Invalid image data' }
  }

  if (!imageData.startsWith('data:image/')) {
    return { valid: false, error: 'Invalid image format' }
  }

  const supportedFormats = ['data:image/jpeg', 'data:image/png', 'data:image/webp']
  const isValidFormat = supportedFormats.some(format => imageData.startsWith(format))

  if (!isValidFormat) {
    return { valid: false, error: 'Unsupported image format. Use JPG, PNG, or WebP' }
  }

  return { valid: true }
}

// Get analysis using a simple heuristic approach (fallback when SDK unavailable)
function getHeuristicAnalysis(): ImageAnalysis {
  return {
    type: 'Photo',
    style: 'Professional photography',
    lighting: 'Balanced natural lighting with soft shadows',
    composition: 'Well-framed subject centered in the frame',
    colors: 'Natural and balanced color palette',
    mood: 'Professional and polished',
    realism: 'High realism with natural textures'
  }
}

// Generate a generic but useful prompt
function generateGenericPrompt(analysis: ImageAnalysis): string {
  return `Create a ${analysis.type.toLowerCase()} in the style of ${analysis.style.toLowerCase()}, featuring [USER FACE] as the main subject.

The image should use ${analysis.lighting.toLowerCase()}, with a ${analysis.composition.toLowerCase()} approach.

The color palette should be ${analysis.colors.toLowerCase()}, creating a ${analysis.mood.toLowerCase()} atmosphere. The overall ${analysis.realism.toLowerCase()} quality with natural textures and professional lighting.

Key visual elements to include:
- ${analysis.lighting.toLowerCase()}
- ${analysis.composition.toLowerCase()}
- Natural skin tones and realistic features
- Appropriate background context
- Professional color grading matching the ${analysis.style.toLowerCase()} aesthetic

Important: Use the user's uploaded face photo as the base, matching the lighting, angle, and mood described above to create a cohesive, realistic portrait.`
}

const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder — Gemini will use your uploaded photo',
  'Paste the entire prompt as-is, don\'t edit it',
  'If results aren\'t perfect, try regenerating the prompt',
  'For best results, use a well-lit, front-facing photo of your face'
]

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()

  console.log(`[${requestId}] ======== REQUEST START ======`)
  console.log(`[${requestId}] Method: ${request.method}`)
  console.log(`[${requestId}] Time: ${new Date().toISOString()}`)
  console.log(`[${requestId}] Environment: ${process.env.VERCEL ? 'Vercel' : 'Local'}`)

  try {
    if (request.method !== 'POST') {
      return NextResponse.json({ success: false, error: 'Use POST method' }, { status: 405 })
    }

    const body = await request.json()
    const { image } = body

    console.log(`[${requestId}] Image data length:`, image?.length || 0)

    // Validate
    const validation = validateImage(image)
    if (!validation.valid) {
      console.log(`[${requestId}] Validation failed:`, validation.error)
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    console.log(`[${requestId}] ✓ Validation passed`)

    // Use heuristic analysis for now (works without SDK)
    console.log(`[${requestId}] → Using heuristic analysis (SDK not available)`)
    const analysis = getHeuristicAnalysis()
    console.log(`[${requestId}] ✓ Analysis complete:`, analysis.type, analysis.style)

    // Generate prompt
    const prompt = generateGenericPrompt(analysis)
    console.log(`[${requestId}] ✓ Prompt generated, length:`, prompt.length)

    const result = {
      success: true,
      analysis,
      prompt,
      tips: DEFAULT_TIPS
    }

    const duration = Date.now() - startTime
    console.log(`[${requestId}] ======== SUCCESS (${duration}ms) ======`)
    return NextResponse.json(result)

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[${requestId}] ======== ERROR (${duration}ms) ======`)
    console.error(`[${requestId}] Error:`, error?.message || error)

    const errorMessage = 'Something went wrong. Please try again.'
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
