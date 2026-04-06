import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Wireframe() {
  const { outputId } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('agent_outputs')
        .select('output_css, output_html')
        .eq('id', outputId)
        .single()

      console.log('[Wireframe] output_css length:', data?.output_css?.length ?? 0)
      console.log('[Wireframe] output_html length:', data?.output_html?.length ?? 0)

      if (error || !data) {
        setError('Wireframe not found.')
        setLoading(false)
        return
      }
      if (!data.output_html) {
        setError('No wireframe has been generated for this output yet.')
        setLoading(false)
        return
      }

      const combined = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Homepage Wireframe</title>
  <style>
${data.output_css || ''}
  </style>
</head>
<body>
${data.output_html}
</body>
</html>`

      const blob = new Blob([combined], { type: 'text/html' })
      const url  = URL.createObjectURL(blob)
      window.location.href = url
    }
    load()
  }, [outputId])

  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#f87171', fontFamily: 'sans-serif', fontSize: 14 }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b', color: '#71717a', fontFamily: 'sans-serif', fontSize: 14 }}>
      Loading wireframe…
    </div>
  )
}
