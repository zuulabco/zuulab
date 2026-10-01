/**
 * High-precision CODE 128 (Subset B) barcode encoder & generator
 * Generates standards-compliant CODE 128 bar patterns, checksums, and SVG representations.
 */

// Standard Code 128 pattern dictionary (values 0 - 106)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112', // 100-106 (104=StartB, 106=Stop)
]

const START_CODE_B = 104
const STOP_CODE = 106

export interface BarcodeEncodingResult {
  codeText: string
  pattern: string
  checksum: number
  binaryBars: string // String of 1s and 0s
  svg: string
  dataUrl: string
}

export class BarcodeService {
  /**
   * Encodes a string into Code 128 (Subset B)
   */
  public static encodeCode128(text: string): BarcodeEncodingResult {
    const sanitized = (text || '').trim()
    if (!sanitized) {
      throw new Error('BARCODE_ERROR: Barkod metni boş olamaz.')
    }

    const values: number[] = []
    for (let i = 0; i < sanitized.length; i++) {
      const charCode = sanitized.charCodeAt(i)
      if (charCode < 32 || charCode > 126) {
        throw new Error(
          `BARCODE_ERROR: Desteklenmeyen karakter '${sanitized[i]}' (ASCII ${charCode}). Sadece ASCII 32-126 aralığı desteklenir.`
        )
      }
      values.push(charCode - 32)
    }

    // Calculate Modulo 103 checksum
    let checksumSum = START_CODE_B
    for (let i = 0; i < values.length; i++) {
      checksumSum += (i + 1) * values[i]
    }
    const checksum = checksumSum % 103

    // Build pattern tokens
    const sequence = [START_CODE_B, ...values, checksum, STOP_CODE]
    let patternStr = ''
    let binaryBars = ''

    for (const val of sequence) {
      const codePattern = CODE128_PATTERNS[val]
      if (!codePattern) continue
      patternStr += codePattern

      // Convert widths into binary bars (1 for black bar, 0 for white space)
      for (let p = 0; p < codePattern.length; p++) {
        const width = parseInt(codePattern[p], 10)
        const isBar = p % 2 === 0
        binaryBars += (isBar ? '1' : '0').repeat(width)
      }
    }

    // Add final termination bar for stop character
    binaryBars += '11'

    const svg = this.generateSvg(binaryBars, sanitized)
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`

    return {
      codeText: sanitized,
      pattern: patternStr,
      checksum,
      binaryBars,
      svg,
      dataUrl,
    }
  }

  /**
   * Generates a clean vector SVG for the binary barcode bars
   */
  private static generateSvg(binaryBars: string, labelText: string): string {
    const barWidth = 2
    const barHeight = 60
    const quietZone = 20
    const totalWidth = binaryBars.length * barWidth + quietZone * 2
    const totalHeight = barHeight + 35

    let paths = ''
    let currentX = quietZone

    for (let i = 0; i < binaryBars.length; i++) {
      if (binaryBars[i] === '1') {
        paths += `M${currentX},10 h${barWidth} v${barHeight} h-${barWidth} Z `
      }
      currentX += barWidth
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}">
        <rect width="100%" height="100%" fill="#ffffff"/>
        <path d="${paths}" fill="#000000"/>
        <text x="${totalWidth / 2}" y="${barHeight + 28}" font-family="Courier, monospace" font-size="14" font-weight="bold" text-anchor="middle" fill="#000000">
          ${labelText}
        </text>
      </svg>
    `.trim()
  }
}
