import { NextRequest, NextResponse } from 'next/server'

// Azure Computer Vision API credentials (using North Europe region)
const AZURE_VISION_KEY = '1pVJmutTKV1Iz2V9yngrzi3UIOtxVbFje54PEwyKIK1iFXQNXwsVJQQJ99CAACi5YpzXJ3w3AAAFACOGomUn algo mas'
const AZURE_REGION = 'northeurope'
const AZURE_ENDPOINT = `https://${AZURE_REGION}.api.cognitive.microsoft.com/vision/v3.2/analyze`

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

// Analyze image with Azure Computer Vision API (v3.2)
async function analyzeImageWithAzureVision(imageBase64: string): Promise<ImageAnalysis> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')

  console.log('[Vision] Starting Azure Computer Vision API v3.2 call...')
  console.log('[Vision] Region:', AZURE_REGION)
  console.log('[Vision] Endpoint:', AZURE_ENDPOINT)
  console.log('[Vision] API Key:', AZURE_VISION_KEY.substring(0, 15) + '...')

  try {
    const response = await fetch(AZURE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Ocp-Apim-Subscription-Key': AZURE_VISION_KEY,
      },
      body: JSON.stringify({
        url: `data:image/jpeg;base64,${base64Data}`
      })
    })

    console.log('[Vision] Response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Vision] API Error:', response.status, errorText)
      throw new Error(`Azure Vision API failed: ${errorText}`)
    }

    // Parse Azure Vision response (binary format)
    const arrayBuffer = await response.arrayBuffer()
    const responseText = new TextDecoder().decode(arrayBuffer)
    console.log('[Vision] Response length:', responseText.length)

    // Azure returns JSON in a specific format
    const data = JSON.parse(responseText)

    if (!data || !data.categories) {
      throw new Error('Invalid Azure Vision API response')
    }

    console.log('[Vision] Categories detected:', data.categories.length)
    console.log('[Vision] Objects detected:', data.objects?.length || 0)
    console.log('[Vision] Tags detected:', data.tags?.length || 0)
    console.log('[Vision] Caption:', data.captionResult?.text?.substring(0, 100) + '...')

    // Analyze image type
    let type = 'Photo'

    // Check for specific visual styles in categories
    const categoryNames = data.categories.map(c => c.name).join(' ').toLowerCase()

    if (categoryNames.includes('illustration') || categoryNames.includes('drawing') || categoryNames.includes('sketch') || categoryNames.includes('cartoon')) {
      type = 'Illustration'
    } else if (categoryNames.includes('painting') || categoryNames.includes('art') || categoryNames.includes('artwork')) {
      type = 'Digital Art'
    }

    // Analyze style from tags
    const tags = data.tags || []
    const tagsText = tags.map(t => t.name).join(', ').toLowerCase()

    let style = 'Professional photography'

    if (tagsText.includes('portrait') || tagsText.includes('face')) {
      style = 'Professional portrait photography'
    } else if (tagsText.includes('landscape') || tagsText.includes('nature')) {
      style = 'Landscape photography'
    } else if (tagsText.includes('studio') || tagsText.includes('indoor')) {
      style = 'Studio photography'
    } else if (tagsText.includes('outdoor') || tagsText.includes('city')) {
      style = 'Outdoor photography'
    } else if (tagsText.includes('night') || tagsText.includes('dark')) {
      style = 'Night or low-light photography'
    } else if (tagsText.includes('cinematic') || tagsText.includes('dramatic')) {
      style = 'Cinematic photography'
    }

    // Analyze colors
    let colors = 'Natural and balanced color palette'

    if (tagsText.includes('black') || tagsText.includes('white') || tagsText.includes('monochrome')) {
      colors = 'Black and white photography'
    } else if (tagsText.includes('vibrant') || tagsText.includes('colorful')) {
      colors = 'Vibrant and colorful photography'
    } else if (tagsText.includes('warm') || tagsText.includes('golden')) {
      colors = 'Warm-toned photography'
    } else if (tagsText.includes('cool') || tagsText.includes('blue') || tagsText.includes('teal')) {
      colors = 'Cool-toned photography'
    } else if (tagsText.includes('pastel') || tagsText.includes('soft')) {
      colors = 'Soft and pastel colors'
    }

    // Analyze lighting
    let lighting = 'Balanced natural lighting'

    if (tagsText.includes('bright') || tagsText.includes('overexposed')) {
      lighting = 'Bright and well-lit scene'
    } else if (tagsText.includes('backlit')) {
      lighting = 'Backlit subject with dramatic effect'
    } else if (tagsText.includes('studio lighting') || tagsText.includes('artificial')) {
      lighting = 'Studio lighting with controlled shadows'
    } else if (tagsText.includes('sunlight') || tagsText.includes('golden hour')) {
      lighting = 'Natural sunlight with soft shadows'
    }

    // Analyze composition
    let composition = 'Well-composed with balanced elements'

    if (tagsText.includes('close-up') || tagsText.includes('shallow dof')) {
      composition = 'Close-up shot with shallow depth of field'
    } else if (tagsText.includes('centered') || tagsText.includes('symmetry')) {
      composition = 'Centered subject with balanced framing'
    } else if (tagsText.includes('macro') || tagsText.includes('detail')) {
      composition = 'Macro photography with extreme detail'
    } else if (tagsText.includes('wide') || tagsText.includes('panoramic')) {
      composition = 'Wide-angle panoramic shot'
    }

    // Analyze mood
    let mood = 'Neutral and balanced'

    if (tagsText.includes('happy') || tagsText.includes('joyful') || tagsText.includes('cheerful')) {
      mood = 'Cheerful and positive'
    } else if (tagsText.includes('sad') || tagsText.includes('melancholy')) {
      mood = 'Moody and melancholic'
    } else if (tagsText.includes('dramatic') || tagsText.includes('intense') || tagsText.includes('serious')) {
      mood = 'Dramatic and intense'
    } else if (tagsText.includes('peaceful') || tagsText.includes('calm') || tagsText.includes('serene')) {
      mood = 'Peaceful and serene'
    } else if (tagsText.includes('exciting') || tagsText.includes('dynamic') || tagsText.includes('energetic')) {
      mood = 'Energetic and dynamic'
    } else if (tagsText.includes('romantic') || tagsText.includes('intimate')) {
      mood = 'Romantic and intimate'
    } else if (tagsText.includes('professional') || tagsText.includes('elegant') || tagsText.includes('sophisticated')) {
      mood = 'Professional and elegant'
    }

    // Analyze realism
    let realism = 'High realism with natural textures'

    if (type === 'Illustration') {
      realism = 'Medium realism - clean digital illustration'
    } else if (type === 'Digital Art') {
      realism = 'Highly detailed digital artwork'
    }

    const analysis = {
      type,
      style,
      lighting,
      composition,
      colors,
      mood,
      realism
    }

    console.log('[Vision] ✓ Analysis complete:', {
      type: analysis.type,
      style: analysis.style
    })

    return analysis

  } catch (error: any) {
    console.error('[Vision] ✗ Error:', error?.message || error)
    throw new Error('Failed to analyze image with Azure Vision API')
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

  console.log('[Prompt] ✓ Prompt generated, length:', prompt.length)

  return prompt
}

const DEFAULT_TIPS = [
  'Upload a clear photo of your face first in Gemini',
  'The prompt uses [USER FACE] placeholder - Gemini will use your uploaded photo',
  'Paste entire prompt as-is, don\'t edit it',
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
  console.log(`[${requestId}] Azure Region: ${AZURE_REGION}`)

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
    console.log(`[${requestId}] → Azure Vision Analysis...`)
    const analysis = await analyzeImageWithAzureVision(image)
    console.log(`[${requestId}] ✓ Azure Vision complete:`, analysis.type, analysis.style)

    // Generate prompt
    console.log(`[${requestId}] → Prompt Generation...`)
    const prompt = await generatePromptForGemini(analysis)
    console.log(`[${requestId}] ✓ Prompt complete:`, prompt.length, 'chars')

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
    console.error(`[${requestId}] Error stack:`, error?.stack || 'No stack available')

    let errorMessage = 'Something went wrong. Please try again.'

    if (error?.message) {
      if (error.message.includes('API key is invalid')) {
        errorMessage = 'Azure Vision API key is invalid or has expired. Please check your Azure portal configuration.'
      } else if (error.message.includes('quota')) {
        errorMessage = 'Azure Vision API quota exceeded. Please try again tomorrow.'
      } else if (error.message.includes('permission')) {
        errorMessage = 'Azure Vision API permission denied. Please check key permissions in your Azure portal.'
      } else if (error.message.includes('Failed to analyze')) {
        errorMessage = 'Could not analyze image. Please try with a different image.'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Request timed out. Please try with a smaller image.'
      } else if (error.message.includes('Vision API failed')) {
        errorMessage = 'Vision API error. Please try again.'
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
}
