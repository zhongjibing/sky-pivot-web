import { memzero } from './memory'

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const SPECIAL = '!@#$%^&*()_+-=[]{}|;:,.<>?'

export interface PasswordConfig {
  length: number
  uppercase: boolean
  lowercase: boolean
  digits: boolean
  special: boolean
}

export interface StrengthResult {
  score: number
  level: 'weak' | 'fair' | 'strong' | 'verystrong'
}

export function generatePassword(config: PasswordConfig): string {
  let charset = ''
  if (config.lowercase) charset += LOWERCASE
  if (config.uppercase) charset += UPPERCASE
  if (config.digits) charset += DIGITS
  if (config.special) charset += SPECIAL

  if (charset.length === 0) {
    throw new Error('At least one character type must be selected')
  }

  const length = Math.max(8, Math.min(64, config.length))
  const randomBytes = new Uint8Array(length)
  crypto.getRandomValues(randomBytes)

  const chars: string[] = []
  for (let i = 0; i < length; i++) {
    chars.push(charset[randomBytes[i] % charset.length])
  }

  ensureCharacterTypes(chars, config, charset)
  memzero(randomBytes)

  return chars.join('')
}

function ensureCharacterTypes(chars: string[], config: PasswordConfig, charset: string): void {
  const positions = new Set<number>()
  if (config.uppercase) {
    const idx = getRandomPosition(chars.length, positions)
    chars[idx] = UPPERCASE[getRandomIndex(UPPERCASE.length)]
  }
  if (config.lowercase) {
    const idx = getRandomPosition(chars.length, positions)
    chars[idx] = LOWERCASE[getRandomIndex(LOWERCASE.length)]
  }
  if (config.digits) {
    const idx = getRandomPosition(chars.length, positions)
    chars[idx] = DIGITS[getRandomIndex(DIGITS.length)]
  }
  if (config.special) {
    const idx = getRandomPosition(chars.length, positions)
    chars[idx] = SPECIAL[getRandomIndex(SPECIAL.length)]
  }
}

function getRandomPosition(max: number, used: Set<number>): number {
  const available: number[] = []
  for (let i = 0; i < max; i++) {
    if (!used.has(i)) available.push(i)
  }
  const choice = available[Math.floor(Math.random() * available.length)]
  used.add(choice)
  return choice
}

function getRandomIndex(max: number): number {
  const buf = new Uint8Array(1)
  crypto.getRandomValues(buf)
  return buf[0] % max
}

export function checkStrength(password: string): StrengthResult {
  if (!password || password.length === 0) {
    return { score: 0, level: 'weak' }
  }

  let score = 0

  score += Math.min(password.length * 4, 40)

  const hasUpper = /[A-Z]/.test(password)
  const hasLower = /[a-z]/.test(password)
  const hasDigit = /\d/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)

  let categories = 0
  if (hasUpper) categories++
  if (hasLower) categories++
  if (hasDigit) categories++
  if (hasSpecial) categories++

  score += (categories - 1) * 10

  const hasMiddleNumOrSym = /[^A-Za-z]./.test(password.substring(1, password.length - 1))
  if (hasMiddleNumOrSym) score += 2

  const lettersOnly = /^[A-Za-z]+$/.test(password)
  const numbersOnly = /^\d+$/.test(password)

  if (lettersOnly) score -= password.length
  if (numbersOnly) score -= password.length

  let repeatCount = 0
  for (let i = 0; i < password.length - 1; i++) {
    if (password[i] === password[i + 1]) {
      repeatCount++
      score -= 2
    }
  }

  const lc = password.toLowerCase()
  const seqChars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  for (let i = 0; i < lc.length - 2; i++) {
    const seq = lc.substring(i, i + 3)
    if (seqChars.includes(seq)) score -= 3
  }

  let level: 'weak' | 'fair' | 'strong' | 'verystrong'
  if (score < 30) {
    level = 'weak'
  } else if (score < 60) {
    level = 'fair'
  } else if (score < 80) {
    level = 'strong'
  } else {
    level = 'verystrong'
  }

  return { score: Math.max(0, Math.min(100, score)), level }
}
