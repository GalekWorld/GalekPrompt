import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Initialize ZAI instance (will be done once and reused)
let zaiInstance: Awaited<ReturnType<typeof ZAI.create>> | null = null

async function getZAIInstance() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
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

  // Check if it's a base64 data URI
  if (!imageData.startsWith('data:image/')) {
    return { valid: false, error: 'Invalid image format' }
  }

  // Check supported formats
  const supportedFormats = ['data:image/jpeg', 'data:image/png', 'data:image/webp']
  const isValidFormat = supportedFormats.some(format => imageData.startsWith(format))

  if (!isValidFormat) {
    return { valid: false, error: 'Unsupported image format. Use JPG, PNG, or WebP' }
  }

  return { valid: true }
}

// Analyze image with VLM
async function analyzeImageWithVLM(imageUrl: string): Promise<ImageAnalysis> {
  const zai = await getZAIInstance()

  const prompt = `Analyze this image in detail and provide a comprehensive breakdown in JSON format with these fields:
{
  "type": "image type (photo/illustration/render/anime/digital art/other)",
  "style": "specific artistic or photographic style",
  "lighting": "detailed lighting description including direction and quality",
  "composition": "framing, angle, and composition details",
  "colors": "color palette, dominant colors, and color harmony",
  "mood": "atmosphere, emotion, and overall feeling",
  "realism": "level of realism (low/medium/high)"
}

Focus on elements that can be replicated in AI image generation. Be specific and descriptive.`

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl
            }
          }
        ]
      }
    ],
    thinking: { type: 'disabled' }
  })

  const content = response.choices[0]?.message?.content

  if (!content) {
    throw new Error('Failed to analyze image')
  }

  // Try to parse JSON from the response
  try {
    // Extract JSON if it's wrapped in markdown code blocks
    let jsonStr = content.trim()
    if (jsonStr.startsWith('```json')) {
      jsonStr = jsonStr.slice(7)
    }
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.slice(3)
    }
    if (jsonStr.endsWith('```')) {
      jsonStr = jsonStr.slice(0, -3)
    }
    jsonStr = jsonStr.trim()

    const parsed = JSON.parse(jsonStr)
    return parsed as ImageAnalysis
  } catch (error) {
    console.error('Failed to parse VLM response:', error)
    // If JSON parsing fails, return a default analysis
    throw new Error('Failed to parse image analysis')
  }
}

// Generate optimized prompt with LLM
async function generatePromptWithLLM(analysis: ImageAnalysis): Promise<string> {
  const zai = await getZAIInstance()

  const systemPrompt = `You are an expert prompt engineer specializing in Gemini Image Generation. Your task is to create highly optimized, natural-language prompts that allow users to recreate specific visual styles using their own face.

Key principles:
1. Write in natural, descriptive English (not keyword lists)
2. Focus on STYLE and ATMOSPHERE, not specific people
3. Be concise but detailed (150-250 words)
4. Use vivid, sensory language
5. Include all visual elements: lighting, composition, colors, mood
6. Optimize specifically for Gemini's image generation capabilities
7. The prompt should feel professional and sophisticated
8. Always include [USER FACE] placeholder for where the face should appear
9. Start with a clear instruction about using the user's uploaded photo

Output format: ONLY the prompt text, no commentary, no "Here's your prompt", just the prompt itself.`

  const userPrompt = `Create an optimized Gemini Image prompt based on this image analysis:

Image Analysis:
- Type: ${analysis.type}
- Style: ${analysis.style}
- Lighting: ${analysis.lighting}
- Composition: ${analysis.composition}
- Colors: ${analysis.colors}
- Mood: ${analysis.mood}
- Realism: ${analysis.realism}

Generate a natural, descriptive prompt that captures all these visual elements. The prompt should enable someone to recreate this exact visual style with their own face. Use [USER FACE] as the placeholder for where the face should appear.

Remember: This prompt will be used in Gemini Image generation where the user will upload their own face photo, so the prompt needs to instruct the AI to use that face while matching all the other visual characteristics.`

  const response = await zai.chat.completions.create({
    messages: [
      {
        role: 'assistant',
        content: systemPrompt
      },
      {
        role: 'user',
        content: userPrompt
      }
    ],
    thinking: { type: 'disabled' }
  })

  const prompt = response.choices[0]?.message?.content

  if (!prompt) {
    throw new Error('Failed to generate prompt')
  }

  return prompt.trim()
}

// Default tips for users
const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder — Gemini will use your uploaded photo',
  'Paste the entire prompt as-is, don\'t edit it',
  'If results aren\'t perfect, try regenerating the prompt',
  'For best results, use a well-lit, front-facing photo of your face'
]

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json()
    const { image } = body

    // Validate image
    const validation = validateImage(image)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    // Step 1: Analyze image with VLM
    console.log('Starting VLM analysis...')
    const analysis = await analyzeImageWithVLM(image)
    console.log('VLM analysis complete:', analysis)

    // Step 2: Generate prompt with LLM
    console.log('Starting LLM prompt generation...')
    const prompt = await generatePromptWithLLM(analysis)
    console.log('LLM prompt generation complete')

    // Step 3: Return results
    const result = {
      success: true,
      analysis,
      prompt,
      tips: DEFAULT_TIPS
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error in /api/analyze:', error)

    // Determine appropriate error message
    let errorMessage = 'Oops! Something went wrong. Please try again.'

    if (error instanceof Error) {
      if (error.message.includes('Failed to analyze')) {
        errorMessage = 'Failed to analyze image. Please try with a different image.'
      } else if (error.message.includes('Failed to generate')) {
        errorMessage = 'Failed to generate prompt. Please try again.'
      } else if (error.message.includes('rate limit')) {
        errorMessage = 'Too many requests. Please wait a moment and try again.'
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

// Handle OPTIONS for CORS if needed
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
