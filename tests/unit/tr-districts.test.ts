import { describe, expect, it } from 'vitest'
import { TR_PROVINCES } from '@/lib/geo/tr-provinces'
import {
  districtError, districtsOf, matchDistrict, postalCodeError, postalCodesFor, suggestDistricts, suggestedPostalCode,
  DISTRICT_INVALID_MESSAGE, DISTRICT_NEEDS_CITY_MESSAGE, DISTRICT_REQUIRED_MESSAGE, POSTAL_CODE_MESSAGE,
} from '@/lib/geo/tr-districts'

describe('the address data', () => {
  it('has districts for all 81 provinces, 970+ in total, and every district has a 5-digit postal code', () => {
    let total = 0
    for (const province of TR_PROVINCES) {
      const districts = districtsOf(province)
      expect(districts.length, province).toBeGreaterThan(0)
      total += districts.length
      for (const d of districts) {
        const codes = postalCodesFor(province, d)
        expect(codes.length, `${province}/${d}`).toBeGreaterThan(0)
        for (const c of codes) expect(c, `${province}/${d}`).toMatch(/^[0-9]{5}$/)
      }
    }
    expect(total).toBeGreaterThanOrEqual(970)
  })

  it.each([
    ['İstanbul', 39, 'Kadıköy'],
    ['Ankara', 25, 'Çankaya'],
    ['İzmir', 30, 'Konak'],
    ['Bolu', 9, 'Merkez'],
  ])('%s has %i districts including %s', (city, count, district) => {
    expect(districtsOf(city)).toHaveLength(count)
    expect(districtsOf(city)).toContain(district)
  })

  it('a postal code starts with the province\'s plate number (the first two digits)', () => {
    expect(suggestedPostalCode('İstanbul', 'Kadıköy')).toMatch(/^347/)
    expect(suggestedPostalCode('Ankara', 'Çankaya')).toMatch(/^06/)
    expect(suggestedPostalCode('İzmir', 'Konak')).toMatch(/^35/)
    expect(suggestedPostalCode('Bolu', 'Merkez')).toMatch(/^14/)
    for (const [city, plate] of [['Adana', '01'], ['Konya', '42'], ['Trabzon', '61'], ['Van', '65']] as const) {
      for (const d of districtsOf(city)) {
        for (const c of postalCodesFor(city, d)) expect(c.startsWith(plate), `${city}/${d}/${c}`).toBe(true)
      }
    }
  })
})

describe('districts of a province', () => {
  it('are listed A–Z and only for the chosen province', () => {
    const list = districtsOf('Bolu')
    expect(list).toEqual([...list].sort((a, b) => a.localeCompare(b, 'tr')))
    expect(list).not.toContain('Kadıköy')
    expect(districtsOf('istanbul')).toContain('Kadıköy') // the province can be typed any way
    expect(districtsOf('')).toEqual([])
    expect(districtsOf('londra')).toEqual([])
  })

  it.each([
    ['İstanbul', 'kadikoy', 'Kadıköy'],
    ['İstanbul', 'KADIKÖY', 'Kadıköy'],
    ['İstanbul', ' beşiktaş ', 'Beşiktaş'],
    ['Ankara', 'cankaya', 'Çankaya'],
    ['istanbul', 'sisli', 'Şişli'],
  ])('%s: "%s" is %s', (city, typed, official) => {
    expect(matchDistrict(city, typed)).toBe(official)
  })

  it('refuses a district of another province, a made-up one and an empty one', () => {
    expect(matchDistrict('Ankara', 'Kadıköy')).toBeNull()
    expect(matchDistrict('İstanbul', 'Çankaya')).toBeNull()
    expect(matchDistrict('İstanbul', 'Kadıkoyy')).toBeNull()
    expect(matchDistrict('İstanbul', '')).toBeNull()
    expect(matchDistrict('londra', 'Kadıköy')).toBeNull()
  })

  it('suggestions: everything A–Z when empty, narrowing while typing, prefix matches first', () => {
    expect(suggestDistricts('Bolu', '')).toEqual(districtsOf('Bolu'))
    expect(suggestDistricts('İstanbul', 'kad')[0]).toBe('Kadıköy')
    expect(suggestDistricts('İstanbul', 'kad').length).toBeLessThan(5)
    const s = suggestDistricts('İstanbul', 'bahce')
    expect(s[0]).toBe('Bahçelievler')
    expect(suggestDistricts('Bolu', 'xyz')).toEqual([])
    expect(suggestDistricts('', 'a')).toEqual([])
  })
})

describe('postal codes of a district', () => {
  it('lists the codes in use, most common first, and suggests the first', () => {
    const codes = postalCodesFor('İstanbul', 'Kadıköy')
    expect(codes.length).toBeGreaterThan(1)
    expect(codes.length).toBeLessThanOrEqual(8)
    expect(suggestedPostalCode('İstanbul', 'kadikoy')).toBe(codes[0])
  })

  it('nothing for an unknown province or district', () => {
    expect(postalCodesFor('Ankara', 'Kadıköy')).toEqual([])
    expect(suggestedPostalCode('londra', 'Kadıköy')).toBeNull()
    expect(suggestedPostalCode('İstanbul', '')).toBeNull()
  })
})

describe('field checks', () => {
  it('district: needs a province first, then a real district of it', () => {
    expect(districtError('', 'Kadıköy')).toBe(DISTRICT_NEEDS_CITY_MESSAGE)
    expect(districtError('İstanbul', '')).toBe(DISTRICT_REQUIRED_MESSAGE)
    expect(districtError('İstanbul', 'Çankaya')).toBe(DISTRICT_INVALID_MESSAGE)
    expect(districtError('İstanbul', 'kadikoy')).toBe('')
  })

  it('postal code: exactly 5 digits', () => {
    expect(postalCodeError('34710')).toBe('')
    expect(postalCodeError(' 34710 ')).toBe('')
    for (const bad of ['', '3471', '347100', '3471a', 'abcde', '34 710']) expect(postalCodeError(bad), bad).toBe(POSTAL_CODE_MESSAGE)
  })
})
