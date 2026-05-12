import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { randomUUID } from 'crypto'

const MAX_BYTES = 20 * 1024 * 1024

function isPdfBytes(buf: ArrayBuffer): boolean {
  const header = new Uint8Array(buf, 0, 5)
  return (
    header[0] === 0x25 && // %
    header[1] === 0x50 && // P
    header[2] === 0x44 && // D
    header[3] === 0x46 && // F
    header[4] === 0x2d    // -
  )
}

export async function POST(req: NextRequest) {
  try {
    let formData: FormData
    try {
      formData = await req.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    if (!isPdfBytes(bytes)) {
      return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
    }

    const supabase = createServerClient()
    const path = `${randomUUID()}.pdf`

    const { error: storageError } = await supabase.storage
      .from('flashcard-pdfs')
      .upload(path, bytes, { contentType: 'application/pdf' })

    if (storageError) {
      console.error('[upload] storage error:', storageError)
      return NextResponse.json({ error: 'Storage error' }, { status: 500 })
    }

    const { data: job, error: dbError } = await supabase
      .from('pdf_jobs')
      .insert({ pdf_url: path, status: 'pending' })
      .select('id')
      .single()

    if (dbError || !job) {
      console.error('[upload] db error:', dbError)
      return NextResponse.json({ error: 'Database error' }, { status: 500 })
    }

    return NextResponse.json({ jobId: job.id })
  } catch (err) {
    console.error('[upload] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
