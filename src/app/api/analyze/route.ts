import { NextRequest, NextResponse } from 'next/server'

// Google Cloud Vision API Key
const GOOGLE_VISION_API_KEY = 'AIzaSyBO5HhgJ8RX-8K09276OjcN7jMAl-_wKO4'

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

// Analyze image with Google Cloud Vision API
async function analyzeImageWithVision(imageBase64: string): Promise<ImageAnalysis> {
  const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '')

  console.log('[Vision] Starting Google Cloud Vision API call...')

  try {
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_VISION_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: base64Data
            },
            features: [
              { type: 'LABEL_DETECTION', maxResults: 10 },
              { type: 'IMAGE_PROPERTIES' },
              { type: 'WEB_DETECTION', maxResults: 10 },
              { type: 'SAFE_SEARCH_DETECTION' }
            ]
          }
        ]
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Vision] API Error:', response.status, errorText)
      throw new Error(`Vision API failed: ${errorText}`)
    }

    const data = await response.json()
    console.log('[Vision] API Response received')

    const result = data.responses?.[0]

    if (!result) {
      throw new Error('No analysis result from Vision API')
    }

    const labels = result.labelAnnotations || []
    const properties = result.imagePropertiesAnnotation || {}
    const webDetection = result.webDetection || {}
    const safeSearch = result.safeSearchAnnotation || {}

    // Determine image type
    let type = 'Photo'
    const objectLabels = labels.map(l => l.description.toLowerCase()).join(', ')

    if (objectLabels.includes('illustration') || objectLabels.includes('drawing') || objectLabels.includes('sketch') || objectLabels.includes('cartoon')) {
      type = 'Illustration'
    } else if (objectLabels.includes('painting') || objectLabels.includes('art') || objectLabels.includes('artwork')) {
      type = 'Digital Art'
    } else if (objectLabels.includes('anime') || objectLabels.includes('manga') || objectLabels.includes('animation')) {
      type = 'Anime'
    } else if (objectLabels.includes('3d') || objectLabels.includes('render') || objectLabels.includes('cg')) {
      type = '3D Render'
    }

    // Determine style
    let style = 'Professional photography'

    const dominantColors = properties.dominantColors?.colors || []
    const colorCount = dominantColors.length

    if (colorCount === 1 && dominantColors[0].color) {
      const color = dominantColors[0].color.toLowerCase()
      if (color.includes('black') || color.includes('gray') || color.includes('white')) {
        style = 'Black and white photography'
      } else if (color.includes('red') || color.includes('orange') || color.includes('yellow')) {
        style = 'Warm-toned photography'
      } else if (color.includes('blue') || color.includes('cyan') || color.includes('teal')) {
        style = 'Cool-toned photography'
      } else if (color.includes('green')) {
        style = 'Nature photography with vibrant greens'
      } else if (color.includes('purple') || color.includes('pink')) {
        style = 'Vibrant and colorful photography'
      }
    } else if (colorCount === 2) {
      style = 'Two-tone color photography'
    } else if (colorCount > 2) {
      style = 'Colorful and dynamic photography'
    }

    const labelsText = labels.map(l => l.description.toLowerCase()).join(', ')

    if (labelsText.includes('cinematic')) {
      style = 'Cinematic photography with dramatic lighting'
    } else if (labelsText.includes('portrait')) {
      style = 'Professional portrait photography'
    } else if (labelsText.includes('landscape')) {
      style = 'Landscape photography'
    } else if (labelsText.includes('studio')) {
      style = 'Studio photography with controlled lighting'
    }

    // Determine lighting
    let lighting = 'Balanced natural lighting'

    if (properties.brightness === 'VERY_BRIGHT') {
      lighting = 'Very bright and overexposed lighting'
    } else if (properties.brightness === 'BRIGHT') {
      lighting = 'Bright and well-lit scene'
    } else if (properties.brightness === 'UNDEREXPOSED') {
      lighting = 'Underexposed with moody shadows'
    }

    if (labelsText.includes('golden')) {
      lighting = 'Golden hour warm lighting'
    } else if (labelsText.includes('sunlight')) {
      lighting = 'Natural sunlight with soft shadows'
    } else if (labelsText.includes('backlit')) {
      lighting = 'Backlit subject with dramatic effect'
    } else if (labelsText.includes('studio')) {
      lighting = 'Studio lighting with controlled shadows'
    }

    // Determine composition
    let composition = 'Well-composed with balanced elements'

    if (labelsText.includes('close-up')) {
      composition = 'Close-up shot with shallow depth of field'
    } else if (labelsText.includes('profile')) {
      composition = 'Side profile view'
    } else if (labelsText.includes('macro')) {
      composition = 'Macro photography with extreme detail'
    } else if (labelsText.includes('centered')) {
      composition = 'Centered subject with balanced framing'
    } else if (labelsText.includes('rule of thirds')) {
      composition = 'Rule of thirds composition'
    }

    // Determine colors
    let colors = 'Natural and balanced color palette'

    if (dominantColors.length > 0) {
      const colorNames = dominantColors.map(c => c.color).join(', ')
      colors = `Color palette featuring: ${colorNames}`
    }

    // Determine mood
    let mood = 'Neutral and balanced'

    if (labelsText.includes('happy') || labelsText.includes('joyful')) {
      mood = 'Cheerful and positive'
    } else if (labelsText.includes('sad') || labelsText.includes('melancholy')) {
      mood = 'Moody and melancholic'
    } else if (labelsText.includes('dramatic')) {
      mood = 'Dramatic and intense'
    } else if (labelsText.includes('peaceful') || labelsText.includes('calm')) {
      mood = 'Peaceful and serene'
    } else if (labelsText.includes('exciting') || labelsText.includes('dynamic')) {
      mood = 'Energetic and dynamic'
    } else if (labelsText.includes('romantic')) {
      mood = 'Romantic and intimate'
    } else if (labelsText.includes('professional') || labelsText.includes('elegant')) {
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

    const analysis = {
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
    console.error('[Vision] Error:', error?.message || error)
    throw new Error('Failed to analyze image with Vision API')
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

Important: Use the user's uploaded face photo as the base, matching the lighting, angle, and mood described above to create a cohesive, realistic portrait. Maintain the ${analysis.mood.toLowerCase()} atmosphere while ensuring that the face looks natural and well-integrated into the scene.`

  console.log('[Prompt] Prompt generated, length:', prompt.length)

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

    // Analyze image with Google Cloud Vision API
    console.log(`[${requestId}] Starting Vision Analysis...`)
    const analysis = await analyzeImageWithVision(image)
    console.log(`[${requestId}] Vision complete:`, analysis.type, analysis.style)

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

    let errorMessage = 'Something went wrong. Please try again.'

    if (error?.message) {
      if (error.message.includes('Failed to analyze')) {
        errorMessage = 'Could not analyze image. Please try with a different image.'
      } else if (error.message.includes('quota') || error.message.includes('429')) {
        errorMessage = 'API quota exceeded. Please try again later today.'
      } else if (error.message.includes('key') || error.message.includes('403') || error.message.includes('401')) {
        errorMessage = 'Invalid API key. Please check Google Cloud Vision configuration.'
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
