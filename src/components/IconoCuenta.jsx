import { Banknote, CreditCard, Landmark, Package } from 'lucide-react'

// Ícono según el tipo de cuenta (antes un emoji repetido en varias pantallas)
const ICONOS = { efectivo: Banknote, tarjeta: CreditCard, tarjeta_credito: CreditCard, banco: Landmark, otro: Package }

export default function IconoCuenta({ tipo, size = 16, color = 'currentColor', style }) {
  const Icono = ICONOS[tipo] || Package
  return <Icono size={size} color={color} aria-hidden="true" style={{ flexShrink: 0, ...style }} />
}
