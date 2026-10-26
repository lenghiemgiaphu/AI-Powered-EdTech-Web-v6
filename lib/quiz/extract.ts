import JSZip from 'jszip'
import { HttpError } from './errors'

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (m) => XML_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => safeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => safeFromCodePoint(parseInt(n, 16)))
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

export function tidyText(input: string): string {
  return input
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function readEntry(zip: JSZip, path: string): Promise<string | null> {
  const entry = zip.file(path)
  return entry ? entry.async('string') : null
}

export async function extractDocx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer).catch(() => {
    throw new HttpError(400, 'Không đọc được tệp Word. Hãy chắc chắn đây là tệp .docx hợp lệ.')
  })
  const xml = await readEntry(zip, 'word/document.xml')
  if (!xml) throw new HttpError(400, 'Tệp Word không có nội dung văn bản.')

  const text = xml
    .replace(/<w:tab\s*\/>/g, '\t')
    .replace(/<w:br\s*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
  return tidyText(decodeEntities(text))
}

export async function extractPptx(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer).catch(() => {
    throw new HttpError(400, 'Không đọc được tệp PowerPoint. Hãy chắc chắn đây là tệp .pptx hợp lệ.')
  })

  const slideNumber = (path: string) => Number(path.match(/(\d+)\.xml$/)?.[1] ?? 0)
  const paths = (pattern: RegExp) =>
    Object.keys(zip.files)
      .filter((p) => pattern.test(p))
      .sort((a, b) => slideNumber(a) - slideNumber(b))

  const toText = (xml: string) =>
    tidyText(
      decodeEntities(
        xml
          .replace(/<\/a:p>/g, '\n')
          .replace(/<a:br\s*\/>/g, '\n')
          .replace(/<[^>]+>/g, ''),
      ),
    )

  const notes = new Map<number, string>()
  for (const path of paths(/^ppt\/notesSlides\/notesSlide\d+\.xml$/)) {
    const xml = await readEntry(zip, path)
    if (xml) notes.set(slideNumber(path), toText(xml))
  }

  const blocks: string[] = []
  for (const path of paths(/^ppt\/slides\/slide\d+\.xml$/)) {
    const xml = await readEntry(zip, path)
    if (!xml) continue
    const n = slideNumber(path)
    const body = toText(xml)
    const note = notes.get(n)
    blocks.push(`--- Slide ${n} ---\n${body}${note ? `\nGhi chú của người trình bày: ${note}` : ''}`)
  }
  return blocks.join('\n\n')
}

export function extractHtmlArticle(html: string): { title: string; text: string } {
  const title =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ??
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ??
    ''

  let body = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|svg|iframe|form|nav|header|footer|aside)\b[\s\S]*?<\/\1>/gi, '')

  const main =
    body.match(/<article\b[\s\S]*?<\/article>/i)?.[0] ?? body.match(/<main\b[\s\S]*?<\/main>/i)?.[0]
  body = main ?? body.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? body

  const text = body
    .replace(/<\/(p|div|section|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  return { title: tidyText(decodeEntities(title)), text: tidyText(decodeEntities(text)) }
}

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'])

export function parseYoutubeUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim())
    if (!['http:', 'https:'].includes(url.protocol) || !YOUTUBE_HOSTS.has(url.hostname)) return null
    const id =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/')
          ? url.pathname.split('/')[2]
          : url.searchParams.get('v')
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null
    return new URL(`https://www.youtube.com/watch?v=${id}`)
  } catch {
    return null
  }
}
