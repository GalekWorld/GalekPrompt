import { NextRequest, NextResponse } from 'next/server'

// Azure Computer Vision API credentials
const AZURE_VISION_KEY = '1pVJmutTKV1Iz2V9yngrzi3UIOtxVbFje54PEwyKIK1iFXQNXwsVJQQJ99CAACi5YpzXJ3w3AAAFACOGomUn';
const AZURE_ENDPOINT = 'https://galek.cognitiveservices.azure.com';

interface ImageAnalysis {
  type: string
  style: string
  lighting: string
  composition: string
  colors: string
  mood: string
  realism: string
}

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

async function analyzeImageWithAzureVision(imageBase64: string): Promise<ImageAnalysis> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')

  console.log('[Vision] Starting Azure Computer Vision API call...')
  console.log('[Vision] Endpoint:', AZURE_BASE_URL)

  const response = await fetch(AZURE_BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': AZURE_VISION_KEY
    },
    body: JSON.stringify({
      url: `data:image/jpeg;base64,${base64Data}`,
      features: [
        { type: 'Caption', maxResults: 1 },
        { type: 'Tags', maxResults: 20 },
        { type: 'Categories', maxResults: 20 },
        { type: 'ImageType', maxResults: 1 },
        { type: 'Color', maxResults: 10 }
      ]
    })
  })

  console.log('[Vision] Response status:', response.status)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Vision] API Error:', response.status, errorText)
    throw new Error(`Azure Vision API failed with status ${response.status}: ${errorText}`)
  }

  const text = await response.text()

  if (!text || text.trim() === '') {
    console.error('[Vision] Empty response from Azure API')
    throw new Error('Azure Vision API returned empty response. Please try again.')
  }

  let data: any
  try {
    data = JSON.parse(text)
  } catch (e: any) {
    console.error('[Vision] JSON parse error:', e.message)
    console.error('[Vision] Response text preview:', text.substring(0, 200))
    throw new Error('Could not parse Azure Vision API response. Invalid JSON.')
  }

  if (!data || !data.captionResult || !data.tags) {
    console.error('[Vision] Invalid response structure:', data)
    throw new Error('Azure Vision API returned invalid response structure')
  }

  console.log('[Vision] Caption:', data.captionResult?.text || 'No caption')
  console.log('[Vision] Tags count:', data.tags?.length || 0)
  console.log('[Vision] Categories count:', data.categories?.length || 0)
  console.log('[Vision] Image type:', data.imageTypeResult?.type || 'Unknown')

  const imageType = data.imageTypeResult?.type || ''
  const caption = data.captionResult?.text || ''
  const captionLower = caption.toLowerCase()
  const tags = data.tags || []
  const tagsText = tags.map((t: any) => t.name).join(', ').toLowerCase()
  const colorInfo = data.color || {}
  const dominantColors = colorInfo.dominantColors || []

  let type = 'Photo'
  const imageTypeLower = imageType.toLowerCase()

  if (imageTypeLower.includes('illustration') || imageTypeLower.includes('drawing') || imageTypeLower.includes('sketch') || imageTypeLower.includes('cartoon')) {
    type = 'Illustration'
  } else if (imageTypeLower.includes('painting') || imageTypeLower.includes('artwork') || imageTypeLower.includes('digital art')) {
    type = 'Digital Art'
  } else if (imageTypeLower.includes('anime') || imageTypeLower.includes('manga')) {
    type = 'Anime'
  } else if (imageTypeLower.includes('3d') || imageTypeLower.includes('render')) {
    type = '3D Render'
  }

  let style = 'Professional photography'
  if (captionLower.includes('portrait') || tagsText.includes('portrait')) {
    style = 'Professional portrait photography'
  } else if (captionLower.includes('landscape') || tagsText.includes('landscape')) {
    style = 'Landscape photography'
  } else if (captionLower.includes('studio') || tagsText.includes('studio')) {
    style = 'Studio photography'
  } else if (captionLower.includes('cinematic') || captionLower.includes('dramatic')) {
    style = 'Cinematic photography'
  } else if (type !== 'Photo') {
    if (type === 'Illustration') {
      style = 'Digital illustration with clean lines'
    } else if (type === 'Digital Art') {
      style = 'Digital artwork with rich details'
    } else if (type === 'Anime') {
      style = 'Anime-style artwork'
    } else if (type === '3D Render') {
      style = '3D rendered image'
    }
  }

  let lighting = 'Balanced natural lighting'
  if (captionLower.includes('bright') || captionLower.includes('sunny') || captionLower.includes('sunlight')) {
    lighting = 'Bright and well-lit scene'
  } else if (captionLower.includes('backlit')) {
    lighting = 'Backlit subject with dramatic effect'
  } else if (captionLower.includes('dark') || captionLower.includes('shadowy')) {
    lighting = 'Low light or moody atmosphere'
  } else if (captionLower.includes('studio lighting') || captionLower.includes('artificial')) {
    lighting = 'Studio lighting with controlled shadows'
  } else if (captionLower.includes('golden')) {
    lighting = 'Golden hour warm lighting'
  }

  let composition = 'Well-composed with balanced elements'
  if (captionLower.includes('close-up') || tagsText.includes('close-up')) {
    composition = 'Close-up shot'
  } else if (captionLower.includes('centered') || captionLower.includes('center')) {
    composition = 'Centered subject with balanced framing'
  }

  let colors = 'Natural and balanced color palette'
  if (dominantColors.length > 0) {
    const colorNames = dominantColors.slice(0, 5).map((c: any) => c.color).join(', ')
    if (colorNames.length > 0) {
      colors = `Color palette featuring: ${colorNames}`
    }
  }

  let mood = 'Neutral and balanced'
  const description = data.descriptionResult?.text || caption

  if (description.toLowerCase().includes('happy') || description.toLowerCase().includes('joyful') || captionLower.includes('smile')) {
    mood = 'Cheerful and positive'
  } else if (description.toLowerCase().includes('sad') || captionLower.includes('melancholic')) {
    mood = 'Moody and melancholic'
  } else if (description.toLowerCase().includes('dramatic') || captionLower.includes('intense')) {
    mood = 'Dramatic and intense'
  } else if (description.toLowerCase().includes('peaceful') || captionLower.includes('calm') || captionLower.includes('serene')) {
    mood = 'Peaceful and serene'
  } else if (description.toLowerCase().includes('energetic') || captionLower.includes('dynamic')) {
    mood = 'Energetic and dynamic'
  } else if (description.toLowerCase().includes('romantic') || captionLower.includes('intimate')) {
    mood = 'Romantic and intimate'
  } else if (description.toLowerCase().includes('professional') || captionLower.includes('elegant')) {
    mood = 'Professional and elegant'
  }

  let realism = 'High realism with natural textures'
  if (type === 'Illustration') {
    realism = 'Medium realism - digital illustration'
  } else if (type === 'Digital Art') {
    realism = 'Highly detailed digital artwork'
  } else if (type === 'Anime') {
    realism = 'Stylized anime aesthetic'
  } else if (type === '3D Render') {
    realism = 'Photorealistic 3D rendering'
  }

  const analysis: ImageAnalysis = {
    type,
    style,
    lighting,
    composition,
    colors,
    mood,
    realism
  }

  console.log('[Vision] Analysis complete:', {
    type: analysis.type,
    style: analysis.style
  })

  return analysis
}

function generatePromptForGemini(analysis: ImageAnalysis): string {
  console.log('[Prompt] Generating optimized Gemini prompt...')

  const prompt = `Create a ${analysis.type.toLowerCase()} in ${analysis.style.toLowerCase()} style, featuring [USER FACE] as the main subject.

The image should use ${analysis.lighting.toLowerCase()}, with a ${analysis.composition.toLowerCase()} approach.

The color palette should consist of ${analysis.colors.toLowerCase()}, creating a ${analysis.mood.toLowerCase()} atmosphere. The overall ${analysis.realism.toLowerCase()} quality with natural textures and professional lighting.

Key visual elements to include:
- ${analysis.lighting.toLowerCase()}
- ${analysis.composition.toLowerCase()}
- Natural skin tones and realistic features
- Appropriate background context
- Professional color grading matching the ${analysis.style.toLowerCase()} aesthetic

Important: Use the user's uploaded face photo as a base, matching the lighting, angle, and mood described above to create a cohesive, realistic portrait. Maintain the ${analysis.mood.toLowerCase()} atmosphere while ensuring that the face looks natural and well-integrated into the scene.`

  console.log('[Prompt] Prompt generated, length:', prompt.length)
  return prompt
}

const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder - Gemini will use your uploaded photo',
  'Paste entire prompt as-is, do not edit it',
  'If results are not perfect, try regenerating the prompt',
  'For best results, use a well-lit, front-facing photo of your face'
]

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()

  console.log(`[${requestId}] ======== REQUEST START ========`)
  console.log(`[${requestId}] Method: ${request.method}`)
  console.log(`[${requestId}] Time: ${new Date().toISOString()}`)
  console.log(`[${requestId}] Environment: ${process.env.VERCEL ? 'Vercel (Production)' : 'Local'}`)
  console.log(`[${requestId}] Endpoint: ${AZURE_BASE_URL}`)

  try {
    if (request.method !== 'POST') {
      return NextResponse.json({ success: false, error: 'Use POST method' }, { status: 405 })
    }

    const body = await request.json()
    const { image } = body

    console.log(`[${requestId}] Image data length:`, image?.length || 0)

    const validation = validateImage(image)
    if (!validation.valid) {
      console.log(`[${requestId}] Validation failed:`, validation.error)
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 })
    }

    console.log(`[${requestId}] Validation passed`)

    const analysis = await analyzeImageWithAzureVision(image)
    console.log(`[${requestId}] Azure Vision complete:`, analysis.type, analysis.style)

    const prompt = generatePromptForGemini(analysis)
    console.log(`[${requestId}] Prompt complete, length:`, prompt.length, 'chars')

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
    console.error(`[${requestId}] Error name:`, error?.name || 'Unknown')

    let errorMessage = 'Something went wrong. Please try again.'

    if (error?.message) {
      const errorMsg = error.message.toString()
      if (errorMsg.includes('empty response')) {
        errorMessage = 'Azure Vision API returned empty response. Please try again.'
      } else if (errorMsg.includes('Could not parse') || errorMsg.includes('Invalid JSON')) {
        errorMessage = 'Could not analyze image due to invalid API response. Please try with a different image.'
      } else if (errorMsg.includes('API failed') || errorMsg.includes('Unauthorized') || errorMsg.includes('invalid key')) {
        errorMessage = 'Azure Vision API key is invalid. Please check your Azure portal.'
      } else if (errorMsg.includes('Forbidden') || errorMsg.includes('permission')) {
        errorMessage = 'Azure Vision API permission denied. Please check key permissions in your Azure portal.'
      } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
        errorMessage = 'Azure Vision API quota exceeded. Please check your Azure billing or try again tomorrow.'
      } else if (errorMsg.includes('408') || errorMsg.includes('timeout')) {
        errorMessage = 'Request timed out. Please try with a smaller image.'
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
