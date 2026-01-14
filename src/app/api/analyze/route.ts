import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Simple function to get ZAI instance without caching (more reliable in Vercel)
async function createZAIInstance() {
  try {
    console.log('[ZAI] Initializing SDK...')
    const zai = await ZAI.create()
    console.log('[ZAI] SDK initialized successfully')
    return zai
  } catch (error) {
    console.error('[ZAI] Initialization failed:', error)
    throw new Error('AI service unavailable. Please try again later.')
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

Focus on visual elements for AI image generation.`

  try {
    console.log('[VLM] Sending request...')
    const response = await zai.chat.completions.createVision({
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
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('No content from VLM')
    }

    console.log('[VLM] Response received, length:', content.length)

    // Parse JSON
    let jsonStr = content.trim()
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json?/g, '').replace(/```/g, '').trim()
    }

    return JSON.parse(jsonStr) as ImageAnalysis
  } catch (error) {
    console.error('[VLM] Error:', error)
    throw new Error('Failed to analyze image')
  }
}

// Generate optimized prompt with LLM
async function generatePromptWithLLM(analysis: ImageAnalysis): Promise<string> {
  const zai = await createZAIInstance()

  const systemPrompt = `You are a prompt engineer for Gemini Image Generation. Create optimized prompts in natural English (150-250 words). Include [USER FACE] placeholder. Focus on STYLE, not specific people.`

  const userPrompt = `Based on this analysis, create a Gemini prompt:
Type: ${analysis.type}
Style: ${analysis.style}
Lighting: ${analysis.lighting}
Composition: ${analysis.composition}
Colors: ${analysis.colors}
Mood: ${analysis.mood}
Realism: ${analysis.realism}

Create a natural, descriptive prompt for recreating this visual style with the user's face.`

  try {
    console.log('[LLM] Generating prompt...')
    const response = await zai.chat.completions.create({
      messages: [
        { role: 'assistant', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      thinking: { type: 'disabled' }
    })

    const prompt = response.choices[0]?.message?.content
    if (!prompt) {
      throw new Error('No content from LLM')
    }

    console.log('[LLM] Prompt generated, length:', prompt.length)
    return prompt.trim()
  } catch (error) {
    console.error('[LLM] Error:', error)
    throw new Error('Failed to generate prompt')
  }
}

const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder',
  'Paste the entire prompt as-is',
  'Try regenerating if results are not perfect',
  'Use a well-lit front-facing photo of your face'
]

export async function POST(request: NextRequest) {
  console.log('[API] ======== Request Started ========')

  try {
    if (request.method !== 'POST') {
      return NextResponse.json({ success: false, error: 'Use POST method' }, { status: 405 })
    }

    const body = await request.json()
    const { image } = body

    console.log('[API] Image data length:', image?.length || 0)

    // Validate
    const validation = validateImage(image)
    if (!validation.valid) {
      console.log('[API] Validation failed:', validation.error)
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    // Analyze
    console.log('[API] Starting analysis...')
    const analysis = await analyzeImageWithVLM(image)
    console.log('[API] Analysis complete:', analysis.type, analysis.style)

    // Generate prompt
    const prompt = await generatePromptWithLLM(analysis)
    console.log('[API] Prompt generated, length:', prompt.length)

    const result = { success: true, analysis, prompt, tips: DEFAULT_TIPS }

    console.log('[API] ======== Request Complete ========')
    return NextResponse.json(result)

  } catch (error) {
    console.error('[API] ======== Error ========')
    console.error('[API] Error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Something went wrong'
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
