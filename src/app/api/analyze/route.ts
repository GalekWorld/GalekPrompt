import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Create ZAI instance with environment config
async function createZAIInstance() {
  try {
    // Use environment variables if available, otherwise empty strings
    const config = {
      baseUrl: process.env.ZAI_BASE_URL || '',
      apiKey: process.env.ZAI_API_KEY || '',
      chatId: process.env.ZAI_CHAT_ID || '',
      userId: process.env.ZAI_USER_ID || ''
    }

    console.log('[ZAI] Creating instance with config:', {
      hasBaseUrl: !!config.baseUrl,
      hasApiKey: !!config.apiKey
    })

    const zai = new ZAI(config)
    console.log('[ZAI] ✅ Instance created successfully')
    return zai
  } catch (error) {
    console.error('[ZAI] ❌ Failed to create instance:', error)
    throw new Error('AI service initialization failed')
  }
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

// Analyze image with VLM
async function analyzeImageWithVLM(imageUrl: string): Promise<ImageAnalysis> {
  const zai = await createZAIInstance()

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

  try {
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
    console.error('[VLM] ❌ Error:', error?.message || error)
    throw new Error('Failed to analyze image')
  }
}

// Generate optimized prompt with LLM
async function generatePromptWithLLM(analysis: ImageAnalysis): Promise<string> {
  const zai = await createZAIInstance()

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

  try {
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
    console.error('[LLM] ❌ Error:', error?.message || error)
    throw new Error('Failed to generate prompt')
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

  console.log(`[${requestId}] ======== START ========`)
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
    console.log(`[${requestId}] ✓ VLM complete:`, analysis.type, analysis.style)

    // Generate prompt
    console.log(`[${requestId}] → LLM Generation...`)
    const prompt = await generatePromptWithLLM(analysis)
    console.log(`[${requestId}] ✓ LLM complete:`, prompt.length, 'chars')

    const result = {
      success: true,
      analysis,
      prompt,
      tips: DEFAULT_TIPS
    }

    const duration = Date.now() - startTime
    console.log(`[${requestId}] ======== SUCCESS (${duration}ms) ========`)
    return NextResponse.json(result)

  } catch (error: any) {
    const duration = Date.now() - startTime
    console.error(`[${requestId}] ======== ERROR (${duration}ms) ========`)
    console.error(`[${requestId}] Error:`, error?.message || error)

    let errorMessage = 'Something went wrong. Please try again.'

    if (error?.message) {
      if (error.message.includes('initialization')) {
        errorMessage = 'AI service initialization failed. Contact support if this persists.'
      } else if (error.message.includes('Failed to analyze')) {
        errorMessage = 'Could not analyze image. Try a different image.'
      } else if (error.message.includes('Failed to generate')) {
        errorMessage = 'Could not generate prompt. Please try again.'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out. Try with a smaller image.'
      }
    }

    console.error(`[${requestId}] Returning error:`, errorMessage)
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
