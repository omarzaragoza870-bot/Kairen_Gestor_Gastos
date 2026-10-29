import { describe, it, expect } from 'vitest'
import { fechaProximoCorte, repartirDeuda } from './meses.js'

const dia = (s) => new Date(`${s}T12:00:00`)

describe('fechaProximoCorte', () => {
  it('es el corte de este mes si todavía no pasa (o es hoy), si no el del siguiente', () => {
    expect(fechaProximoCorte(5, dia('2026-10-03'))).toBe('2026-10-05')
    expect(fechaProximoCorte(5, dia('2026-10-05'))).toBe('2026-10-05')
    expect(fechaProximoCorte(5, dia('2026-10-06'))).toBe('2026-11-05')
  })

  it('ajusta los días que no existen en el mes y usa fin de mes sin día de corte', () => {
    expect(fechaProximoCorte(31, dia('2026-02-10'))).toBe('2026-02-28')
    expect(fechaProximoCorte(31, dia('2026-01-31'))).toBe('2026-01-31')
    expect(fechaProximoCorte(30, dia('2026-01-31'))).toBe('2026-02-28')
    expect(fechaProximoCorte(null, dia('2026-10-29'))).toBe('2026-10-31')
  })
})

describe('repartirDeuda', () => {
  const visa = { id: 'visa', saldo: 3000, fecha_corte: 5 }
  const compra = [
    { cuenta_id: 'visa', monto: 1000, fecha: '2026-10-20' },
    { cuenta_id: 'visa', monto: 1000, fecha: '2026-11-20' },
    { cuenta_id: 'visa', monto: 1000, fecha: '2026-12-20' },
    { cuenta_id: 'otra', monto: 999, fecha: '2027-01-20' },
  ]

  it('al corte solo entran las mensualidades hasta el día de corte', () => {
    // Corte 5 de noviembre: entra la del 20 de octubre; las de nov y dic quedan a meses
    expect(repartirDeuda(visa, compra, dia('2026-10-25'))).toEqual({ alCorte: 1000, aMeses: 2000 })
    // Pasado ese corte, el siguiente es el 5 de diciembre: entra también la de noviembre
    expect(repartirDeuda(visa, compra, dia('2026-11-06'))).toEqual({ alCorte: 2000, aMeses: 1000 })
  })

  it('lo que queda a meses nunca pasa de la deuda', () => {
    expect(repartirDeuda({ ...visa, saldo: 0 }, compra, dia('2026-10-25'))).toEqual({ alCorte: 0, aMeses: 0 })
    expect(repartirDeuda({ ...visa, saldo: 1500 }, compra, dia('2026-10-25'))).toEqual({ alCorte: 0, aMeses: 1500 })
  })
})
