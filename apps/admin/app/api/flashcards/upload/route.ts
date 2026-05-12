import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@iskotify/utils'
import { randomUUID } from 'crypto'

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(req: NextRequest) {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  if (file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Only PDF files are supported' }, { status: 400 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File too large (max 20MB)' }, { status: 400 })
  }

  const supabase = createServerClient()
  const path = `${randomUUID()}.pdf`

  const bytes = await file.arrayBuffer()
  const { error: storageError } = await supabase.storage
    .from('flashcard-pdfs')
    .upload(path, bytes, { contentType: 'application/pdf' })

  if (storageError) {
    return NextResponse.json({ error: 'Storage error' }, { status: 500 })
  }

  const { data: job, error: dbError } = await supabase
    .from('pdf_jobs')
    .insert({ pdf_url: path, status: 'pending' })
    .select('id')
    .single()

  if (dbError || !job) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  return NextResponse.json({ jobId: job.id })
}
