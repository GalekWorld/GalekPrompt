import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Detect if running in Vercel
const IS_VERCEL = process.env.VERCEL === '1' || process.env.VERCEL === 'true'

// Create ZAI instance with robust retry logic
async function createZAIWithRetry(maxRetries = 3): Promise<any> {
  let lastError: any = null
  const delays = [1000, 2000, 4000] // Exponential backoff

  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`[ZAI] 🔁 Attempt ${i + 1}/${maxRetries}...`)
      const startTime = Date.now()

      // Add timeout
      const zai = await Promise.race([
        ZAI.create(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('SDK initialization timeout')), 10000)
        )
      ])

      const duration = Date.now() - startTime
      console.log(`[ZAI] ✅ Initialized in ${duration}ms`)
      return zai

    } catch (error: any) {
      lastError = error
      console.error(`[ZAI] ❌ Attempt ${i + 1} failed:`, error?.message || error)

      if (i < maxRetries - 1) {
        const delay = delays[i]
        console.log(`[ZAI] ⏳ Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  console.error('[ZAI] ❌ All attempts failed')
  throw new Error('SDK initialization failed')
}

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

// Fallback analysis when SDK fails
function getFallbackAnalysis(): ImageAnalysis {
  console.log('[FALLBACK] Using predefined analysis')
  return {
    type: 'Photo',
    style: 'Professional photography',
    lighting: 'Balanced natural lighting',
    composition: 'Well-framed subject centered',
    colors: 'Vibrant and natural tones',
    mood: 'Professional and polished',
    realism: 'High realism'
  }
}

// Fallback prompt when SDK fails
function getFallbackPrompt(analysis: ImageAnalysis): string {
  console.log('[FALLBACK] Using predefined prompt')
  return `Create a ${analysis.type.toLowerCase()} in the style of ${analysis.style.toLowerCase()}, featuring [USER FACE] as the main subject. The image should use ${analysis.lighting.toLowerCase()} with a ${analysis.composition.toLowerCase()} approach.

The color palette should consist of ${analysis.colors.toLowerCase()}, creating a ${analysis.mood.toLowerCase()} atmosphere. The overall ${analysis.realism.toLowerCase()} quality with natural textures and realistic lighting.

Key visual elements to include:
- Professional ${analysis.lighting.toLowerCase()}
- ${analysis.composition.toLowerCase()}
- Natural and realistic skin tones
- Appropriate background context
- Professional color grading matching the ${analysis.style.toLowerCase()} aesthetic

Important: Use the user's uploaded face photo as the base, matching the lighting, angle, and mood described above.`
}

// Analyze image with VLM (with fallback)
async function analyzeImageWithVLM(imageUrl: string): Promise<ImageAnalysis> {
  try {
    const zai = await createZAIWithRetry()

    const prompt = `Analyze this image and provide a JSON breakdown:
{
  "type": "photo/illustration/render/anime",
  "style": "specific artistic or photographic style",
  "lighting": "lighting description",
  "composition": "framing and composition",
  "colors": "color palette and dominant colors",
  "mood": "atmosphere and feeling",
  "realism": "low/medium/high"
}

Focus on visual elements.`

    console.log('[VLM] → Sending request...')
    const response = await Promise.race([
      zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } }
            ]
          }
        ],
        thinking: { type: 'disabled' }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('VLM request timeout')), 30000)
      )
    ])

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty VLM response')
    }

    console.log('[VLM] ✓ Response received, length:', content.length)

    // Parse JSON
    let jsonStr = content.trim()
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json?/g, '').replace(/```/g, '').trim()
    }

    const parsed = JSON.parse(jsonStr) as ImageAnalysis
    console.log('[VLM] ✓ Parsed successfully')
    return parsed

  } catch (error: any) {
    console.error('[VLM] ❌ Failed, using fallback:', error?.message || error)
    return getFallbackAnalysis()
  }
}

// Generate prompt with LLM (with fallback)
async function generatePromptWithLLM(analysis: ImageAnalysis): Promise<string> {
  try {
    const zai = await createZAIWithRetry()

    const systemPrompt = `You are a prompt engineer for Gemini. Create natural English prompts (150-250 words). Include [USER FACE]. Focus on STYLE.`

    const userPrompt = `Based on this analysis:
Type: ${analysis.type}
Style: ${analysis.style}
Lighting: ${analysis.lighting}
Composition: ${analysis.composition}
Colors: ${analysis.colors}
Mood: ${analysis.mood}
Realism: ${analysis.realism}

Create a prompt for recreating this style with user's face.`

    console.log('[LLM] → Generating prompt...')
    const response = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        thinking: { type: 'disabled' }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('LLM request timeout')), 30000)
      )
    ])

    const prompt = response.choices[0]?.message?.content
    if (!prompt) {
      throw new Error('Empty LLM response')
    }

    console.log('[LLM] ✓ Prompt generated, length:', prompt.length)
    return prompt.trim()

  } catch (error: any) {
    console.error('[LLM] ❌ Failed, using fallback:', error?.message || error)
    return getFallbackPrompt(analysis)
  }
}

const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder',
  'Paste entire prompt as-is',
  'Try regenerating if results are not perfect',
  'Use a well-lit front-facing photo of your face'
]

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()

  console.log(`[${requestId}] ======== START ======`)
  console.log(`[${requestId}] Environment: ${IS_VERCEL ? 'Vercel' : 'Local'}`)
  console.log(`[${requestId}] Method: ${request.method}`)
  console.log(`[${requestId}] Time: ${new Date().toISOString()}`)

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
      console.log(`[${requestId}] ✗ Validation failed:`, validation.error)
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    console.log(`[${requestId}] ✓ Validation passed`)

    // Analyze
    console.log(`[${requestId}] → VLM Analysis...`)
    const analysis = await analyzeImageWithVLM(image)
    console.log(`[${requestId}] ✓ Analysis:`, analysis.type, analysis.style)

    // Generate prompt
    console.log(`[${requestId}] → LLM Generation...`)
    const prompt = await generatePromptWithLLM(analysis)
    console.log(`[${requestId}] ✓ Prompt:`, prompt.length, 'chars')

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

    // Even with error, try to provide something useful
    try {
      const fallbackAnalysis = getFallbackAnalysis()
      const fallbackPrompt = getFallbackPrompt(fallbackAnalysis)

      console.log(`[${requestId}] → Returning fallback response`)
      return NextResponse.json({
        success: true,
        analysis: fallbackAnalysis,
        prompt: fallbackPrompt,
        tips: [...DEFAULT_TIPS, 'Note: Using fallback response due to service issues']
      })
    } catch {
      const errorMessage = 'Service temporarily unavailable. Please try again in a few minutes.'
      return NextResponse.json({ success: false, error: errorMessage }, { status: 500 })
    }
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
