import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { HttpError } from './errors'

const MAX_BYTES = 2_500_000
const MAX_REDIRECTS = 4

function isPrivateIpv4(ip: string): boolean {
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIpv4(ip)
  const lower = ip.toLowerCase()
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isPrivateIpv4(mapped[1])
  return lower === '::' || lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
}

async function assertPublicUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) throw new HttpError(400, 'Chỉ hỗ trợ đường dẫn http hoặc https.')
  if (url.port && !['80', '443'].includes(url.port)) throw new HttpError(400, 'Đường dẫn không hợp lệ.')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => [])
  if (!addresses.length) throw new HttpError(400, 'Không tìm thấy trang web này. Hãy kiểm tra lại đường dẫn.')
  if (addresses.some((a) => isPrivateIp(a.address))) throw new HttpError(400, 'Đường dẫn này không được phép truy cập.')
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    chunks.push(value)
    if (total > MAX_BYTES) {
      await reader.cancel()
      break
    }
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}

export async function fetchPublicPage(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let url: URL
  try {
    url = new URL(rawUrl.trim())
  } catch {
    throw new HttpError(400, 'Đường dẫn không hợp lệ. Hãy dán đầy đủ địa chỉ bắt đầu bằng https://')
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url)
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; LabLuyenBot/1.0; +quiz-generator)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'vi,en;q=0.8',
      },
    }).catch(() => {
      throw new HttpError(502, 'Không thể tải trang này. Trang có thể đang chặn truy cập tự động.')
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      url = new URL(location, url)
      continue
    }

    if (!response.ok) throw new HttpError(502, `Trang web trả về lỗi ${response.status}. Hãy thử đường dẫn khác.`)
    const type = response.headers.get('content-type') ?? ''
    if (!/text\/html|application\/xhtml|text\/plain/i.test(type)) {
      throw new HttpError(400, 'Đường dẫn này không phải trang bài viết. Nếu là tệp PDF, hãy tải tệp lên.')
    }
    return { html: await readCapped(response), finalUrl: url.toString() }
  }
  throw new HttpError(502, 'Trang web chuyển hướng quá nhiều lần.')
}
