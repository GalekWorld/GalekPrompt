'use client'

import { useState, useCallback } from 'react'
import { Upload, Image as ImageIcon, Loader2, Copy, RefreshCw, Sparkles, Info, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

interface ImageAnalysis {
  type: string
  style: string
  lighting: string
  composition: string
  colors: string
  mood: string
  realism: string
}

interface AnalysisResult {
  analysis: ImageAnalysis
  prompt: string
  tips: string[]
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleFileSelect = useCallback((file: File) => {
    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a valid image file (JPG, PNG, or WebP)')
      return
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error('File size exceeds 10MB limit')
      return
    }

    setSelectedFile(file)
    setResult(null)

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }, [handleFileSelect])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleAnalyze = async () => {
    if (!selectedFile || !imagePreview) {
      toast.error('Please select an image first')
      return
    }

    setIsAnalyzing(true)
    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: imagePreview }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || 'Failed to analyze image')
      }

      const data = await response.json()
      setResult(data)
      toast.success('✨ Your optimized prompt is ready!')
    } catch (error) {
      console.error('Analysis error:', error)
      toast.error(error instanceof Error ? error.message : 'Oops! Something went wrong. Please try again.')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleCopyPrompt = async () => {
    if (result?.prompt) {
      try {
        await navigator.clipboard.writeText(result.prompt)
        toast.success('Prompt copied to clipboard!')
      } catch (error) {
        toast.error('Failed to copy prompt')
      }
    }
  }

  const handleReset = () => {
    setSelectedFile(null)
    setImagePreview('')
    setResult(null)
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              GalekPrompt
            </h1>
          </div>
          <Badge variant="outline" className="gap-2">
            <Info className="w-3 h-3" />
            <span className="hidden sm:inline">Prompts only, no image generation</span>
            <span className="sm:hidden">Prompts only</span>
          </Badge>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        {/* Hero Section */}
        <div className="text-center mb-12 space-y-4">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
            Transform any image into a{' '}
            <span className="bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent">
              perfect Gemini prompt
            </span>
            {' '}in seconds
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Sube una imagen que te guste de Instagram, Pinterest o Google, y obtén un prompt
            optimizado para recrear ese estilo visual con tu propia cara en Gemini.
            <span className="block mt-2 font-medium text-foreground">No necesitas saber escribir prompts.</span>
          </p>
        </div>

        {/* Upload Section */}
        <Card className="p-6 mb-8">
          {!result ? (
            <div className="space-y-6">
              {/* Upload Area */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all ${
                  isDragging
                    ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/20'
                    : 'border-border hover:border-violet-300 dark:hover:border-violet-700'
                }`}
              >
                <input
                  type="file"
                  id="file-input"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <label htmlFor="file-input" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-cover rounded-full"
                        />
                      ) : (
                        <Upload className="w-8 h-8 text-violet-600 dark:text-violet-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-medium text-foreground">
                        {imagePreview ? 'Click to change image' : 'Drag & drop image here'}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse</p>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Supports: JPG, PNG, WebP (max 10MB)
                    </Badge>
                  </div>
                </label>
              </div>

              {/* Preview Image */}
              {imagePreview && (
                <div className="flex justify-center">
                  <div className="relative max-w-md w-full">
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="w-full rounded-lg shadow-lg"
                    />
                  </div>
                </div>
              )}

              {/* Analyze Button */}
              <div className="flex justify-center">
                <Button
                  onClick={handleAnalyze}
                  disabled={!imagePreview || isAnalyzing}
                  size="lg"
                  className="min-w-[200px] bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing with AI...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Analyze Image
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            /* Results Section */
            <div className="space-y-6">
              {/* Success Header */}
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
                  <Sparkles className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-2xl font-bold">Your optimized prompt is ready!</h3>
                <p className="text-muted-foreground">Copy this prompt and paste it into Gemini</p>
              </div>

              {/* Analysis Grid */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Image Preview */}
                <Card className="p-4">
                  <img
                    src={imagePreview}
                    alt="Analyzed image"
                    className="w-full rounded-lg"
                  />
                </Card>

                {/* Image Analysis */}
                <Card className="p-4">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" />
                    Image Analysis
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span className="font-medium">{result.analysis.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Style:</span>
                      <span className="font-medium">{result.analysis.style}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lighting:</span>
                      <span className="font-medium">{result.analysis.lighting}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Composition:</span>
                      <span className="font-medium">{result.analysis.composition}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Colors:</span>
                      <span className="font-medium">{result.analysis.colors}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Mood:</span>
                      <span className="font-medium">{result.analysis.mood}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Realism:</span>
                      <span className="font-medium">{result.analysis.realism}</span>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Prompt Section */}
              <Card className="p-4 bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/20 dark:to-purple-950/20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Optimized Prompt for Gemini
                  </h4>
                </div>
                <Textarea
                  value={result.prompt}
                  readOnly
                  className="min-h-[200px] resize-none font-mono text-sm mb-4 bg-background"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleCopyPrompt}
                    className="flex-1"
                    variant="default"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Prompt
                  </Button>
                  <Button
                    onClick={handleReset}
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Generate New
                  </Button>
                </div>
              </Card>

              {/* Tips Section */}
              <Card className="p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                <h4 className="font-semibold mb-3 flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <Lightbulb className="w-4 h-4" />
                  Tips for best results in Gemini
                </h4>
                <ul className="space-y-2 text-sm text-amber-900 dark:text-amber-100">
                  {result.tips.map((tip, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 flex-shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </Card>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card/50 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Powered by Galek</p>
          <p className="mt-1">© 2025 GalekPrompt</p>
        </div>
      </footer>
    </div>
  )
}
