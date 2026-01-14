import { NextRequest, NextResponse } from 'next/server'
import { ImageAnalysisClient, AzureKeyCredential } from '@azure/cognitiveservices-computervision'

// Azure Computer Vision API credentials
const AZURE_VISION_KEY = '1pVJmutTKV1Iz2V9yngrzi3UIOtxVbFje54PEwyKIK1iFXQNXwsVJQQJ99CAACi5YpzXJ3w3AAAFACOGomUn algo mas'
const AZURE_ENDPOINT = 'https://galek.cognitiveservices.azure.com'

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

// Analyze image using official Azure Computer Vision SDK
async function analyzeImageWithAzureVision(imageBase64: string): Promise<ImageAnalysis> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')

  console.log('[Vision] Initializing Azure Vision SDK...')
  console.log('[Vision] Endpoint:', AZURE_ENDPOINT)
  console.log('[Vision] API Key:', AZURE_VISION_KEY.substring(0, 15) + '...')

  try {
    // Create Azure Vision client with credentials
    const client = new ImageAnalysisClient(
      AZURE_ENDPOINT,
      new AzureKeyCredential(AZURE_VISION_KEY)
    )

    console.log('[Vision] Client created, analyzing image...')

    // Call analyze method
    const result = await client.path('analyze').post({
      url: `data:image/jpeg;base64,${base64Data}`,
      features: [
        'Caption',
        'Tags',
        'Categories',
        'Objects',
        'Color',
        'Description',
        'ImageType'
      ],
      'language': 'en'
    })

    console.log('[Vision] Azure SDK response received')
    console.log('[Vision] Caption:', result.captionResult?.text || 'No caption')
    console.log('[Vision] Tags count:', result.tags?.length || 0)
    console.log('[Vision] Categories count:', result.categories?.length || 0)
    console.log('[Vision] Objects count:', result.objects?.length || 0)

    // Determine image type
    let type = 'Photo'
    const categories = result.categories || []
    const categoryNames = categories.map(c => c.name).join(' ').toLowerCase()

    if (categoryNames.includes('illustration') || categoryNames.includes('drawing') || categoryNames.includes('sketch') || categoryNames.includes('cartoon') || categoryNames.includes('comics')) {
      type = 'Illustration'
    } else if (categoryNames.includes('painting') || categoryNames.includes('art') || categoryNames.includes('artwork') || categoryNames.includes('digital art')) {
      type = 'Digital Art'
    } else if (categoryNames.includes('text_') || categoryNames.includes('handwriting') || categoryNames.includes('clipart')) {
      type = 'Digital Art'
    } else if (categoryNames.includes('3d') || categoryNames.includes('render') || categoryNames.includes('cg')) {
      type = '3D Render'
    } else if (result.imageType && result.imageType.description) {
      const imageTypeDesc = result.imageType.description.toLowerCase()
      if (imageTypeDesc.includes('anime') || imageTypeDesc.includes('manga')) {
        type = 'Anime'
      } else if (imageTypeDesc.includes('3d')) {
        type = '3D Render'
      }
    }

    // Analyze style
    let style = 'Professional photography'
    const caption = result.captionResult?.text || ''
    const captionLower = caption.toLowerCase()
    const tags = result.tags || []
    const tagsText = tags.map(t => t.name).join(', ').toLowerCase()

    if (captionLower.includes('portrait') || captionLower.includes('headshot') || tagsText.includes('portrait')) {
      style = 'Professional portrait photography'
    } else if (captionLower.includes('landscape') || captionLower.includes('scenery') || tagsText.includes('landscape')) {
      style = 'Landscape photography'
    } else if (captionLower.includes('studio') || captionLower.includes('studio photography')) {
      style = 'Studio photography'
    } else if (captionLower.includes('candid') || captionLower.includes('natural') || tagsText.includes('natural')) {
      style = 'Natural photography'
    } else if (captionLower.includes('cinematic') || captionLower.includes('dramatic')) {
      style = 'Cinematic photography'
    } else if (type === 'Illustration') {
      style = 'Digital illustration with clean lines'
    } else if (type === 'Digital Art') {
      style = 'Digital artwork with rich details'
    } else if (type === 'Anime') {
      style = 'Anime-style artwork'
    } else if (type === '3D Render') {
      style = '3D rendered image'
    }

    // Determine lighting
    let lighting = 'Balanced natural lighting'

    if (captionLower.includes('bright') || captionLower.includes('sunny') || captionLower.includes('daylight') || captionLower.includes('sunlight') || tagsText.includes('bright')) {
      lighting = 'Bright natural lighting'
    } else if (captionLower.includes('backlit') || captionLower.includes('silhouette') || tagsText.includes('backlit')) {
      lighting = 'Backlit with dramatic effect'
    } else if (captionLower.includes('golden') || captionLower.includes('sunset') || captionLower.includes('warm light')) {
      lighting = 'Golden hour warm lighting'
    } else if (captionLower.includes('studio lighting') || tagsText.includes('studio')) {
      lighting = 'Studio lighting'
    } else if (captionLower.includes('dark') || captionLower.includes('low light') || captionLower.includes('night') || captionLower.includes('shadowy')) {
      lighting = 'Low light or moody atmosphere'
    }

    // Determine composition
    let composition = 'Well-composed with balanced elements'

    if (captionLower.includes('close-up') || captionLower.includes('headshot') || captionLower.includes('close up') || tagsText.includes('close-up')) {
      composition = 'Close-up shot with shallow depth of field'
    } else if (captionLower.includes('centered') || captionLower.includes('center') || captionLower.includes('symmetrical') || tagsText.includes('centered')) {
      composition = 'Centered subject with balanced framing'
    } else if (captionLower.includes('wide') || captionLower.includes('panorama') || captionLower.includes('panoramic') || tagsText.includes('wide')) {
      composition = 'Wide-angle panoramic shot'
    }

    // Determine colors
    let colors = 'Natural and balanced color palette'
    const colorInfo = result.color

    if (colorInfo && colorInfo.dominantColors && colorInfo.dominantColors.length > 0) {
      const colorNames = colorInfo.dominantColors.map(c => c.color).join(', ')
      if (colorNames.includes('black') || colorNames.includes('white')) {
        colors = 'Black and white photography'
      } else if (colorNames.includes('vibrant') || colorNames.includes('colorful') || colorNames.includes('vivid')) {
        colors = 'Vibrant and colorful photography'
      } else if (colorNames.includes('warm') || colorNames.includes('orange') || colorNames.includes('red') || colorNames.includes('yellow')) {
        colors = 'Warm-toned photography'
      } else if (colorNames.includes('cool') || colorNames.includes('blue') || colorNames.includes('teal') || colorNames.includes('cyan')) {
        colors = 'Cool-toned photography'
      }
    }

    // Determine mood
    let mood = 'Neutral and balanced'
    const description = result.descriptionResult?.text || caption

    if (description.toLowerCase().includes('happy') || description.toLowerCase().includes('joyful') || description.toLowerCase().includes('smile') || captionLower.includes('smiling')) {
      mood = 'Cheerful and positive'
    } else if (description.toLowerCase().includes('sad') || description.toLowerCase().includes('melancholy') || captionLower.includes('sad') || captionLower.includes('melancholic')) {
      mood = 'Moody and melancholic'
    } else if (description.toLowerCase().includes('dramatic') || description.toLowerCase().includes('intense') || captionLower.includes('dramatic')) {
      mood = 'Dramatic and intense'
    } else if (description.toLowerCase().includes('peaceful') || description.toLowerCase().includes('calm') || description.toLowerCase().includes('serene') || captionLower.includes('peaceful')) {
      mood = 'Peaceful and serene'
    } else if (description.toLowerCase().includes('exciting') || description.toLowerCase().includes('energetic') || description.toLowerCase().includes('dynamic')) {
      mood = 'Energetic and dynamic'
    } else if (description.toLowerCase().includes('romantic') || description.toLowerCase().includes('intimate') || description.toLowerCase().includes('romantic') || captionLower.includes('romantic')) {
      mood = 'Romantic and intimate'
    } else if (description.toLowerCase().includes('professional') || description.toLowerCase().includes('elegant') || description.toLowerCase().includes('sophisticated') || captionLower.includes('professional') || captionLower.includes('elegant')) {
      mood = 'Professional and elegant'
    }

    // Determine realism
    let realism = 'High realism with natural textures'

    if (type === 'Illustration') {
      realism = 'Medium realism - clean digital illustration'
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

  } catch (error: any) {
    console.error('[Vision] Error occurred:', error?.message || error)
    console.error('[Vision] Error name:', error?.name || 'Unknown error')
    console.error('[Vision] Error stack:', error?.stack || 'No stack available')

    // Provide specific error messages based on Azure SDK errors
    let errorMessage = 'Could not analyze image. Please try again.'

    if (error?.name) {
      if (error.name.includes('Unauthorized') || error.name.includes('401') || error.name.includes('invalid')) {
        errorMessage = 'Azure Vision API key is invalid or has expired. Please check your Azure portal configuration.'
      } else if (error.name.includes('Forbidden') || error.name.includes('403') || error.name.includes('permission') || error.name.includes('access')) {
        errorMessage = 'Azure Vision API permission denied. Please check key permissions in your Azure portal.'
      } else if (error.name.includes('TooManyRequests') || error.name.includes('429') || error.name.includes('quota')) {
        errorMessage = 'Azure Vision API quota exceeded. Please check your Azure billing or try again tomorrow.'
      } else if (error.name.includes('timeout') || error.name.includes('timed') || error.message?.toLowerCase().includes('timeout')) {
        errorMessage = 'Request timed out. Please try with a smaller image.'
      } else if (error.name.includes('ServiceUnavailable') || error.name.includes('503') || error.name.includes('busy')) {
        errorMessage = 'Azure Vision service is temporarily unavailable. Please try again in a few minutes.'
      }
    }

    console.error('[Vision] Returning error to client:', errorMessage)
    throw new Error(errorMessage)
  }
}

// Generate optimized prompt for Gemini
async function generatePromptForGemini(analysis: ImageAnalysis): Promise<string> {
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
  'Paste the entire prompt as-is, don\'t edit it',
  'If results aren\'t perfect, try regenerating the prompt',
  'For best results, use a well-lit, front-facing photo of your face'
]

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7)
  const startTime = Date.now()

  console.log(`[${requestId}] ======== REQUEST START ========`)
  console.log(`[${requestId}] Method: ${request.method}`)
  console.log(`[${requestId}] Time: ${new Date().toISOString()}`)
  console.log(`[${requestId}] Environment: ${process.env.VERCEL ? 'Vercel' : 'Local'}`)
  console.log(`[${requestId}] Azure Endpoint: ${AZURE_ENDPOINT}`)

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

    console.log(`[${requestId}] Validation passed`)

    // Analyze image with Azure Computer Vision SDK
    console.log(`[${requestId}] Starting Azure Vision Analysis...`)
    const analysis = await analyzeImageWithAzureVision(image)
    console.log(`[${requestId}] Azure Vision complete:`, analysis.type, analysis.style)

    // Generate prompt
    console.log(`[${requestId}] Generating prompt...`)
    const prompt = await generatePromptForGemini(analysis)
    console.log(`[${requestId}] Prompt complete:`, prompt.length, 'chars')

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
    console.error(`[${requestId}] Error stack:`, error?.stack || 'No stack available')

    let errorMessage = 'Something went wrong. Please try again.'

    if (error?.message) {
      if (error.message.includes('API key is invalid')) {
        errorMessage = 'Azure Vision API key is invalid or has expired. Please check your Azure portal configuration.'
      } else if (error.message.includes('quota')) {
        errorMessage = 'Azure Vision API quota exceeded. Please check your Azure billing or try again tomorrow.'
      } else if (error.message.includes('permission')) {
        errorMessage = 'Azure Vision API permission denied. Please check key permissions in your Azure portal.'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out. Please try with a smaller image.'
      } else if (error.message.includes('service') || error.message.includes('unavailable') || error.message.includes('temporarily')) {
        errorMessage = 'Azure Vision service is temporarily unavailable. Please try again in a few minutes.'
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
