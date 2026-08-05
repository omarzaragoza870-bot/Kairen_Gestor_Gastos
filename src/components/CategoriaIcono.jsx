/**
 * CategoriaIcono — renderiza el ícono Lucide correspondiente a una categoría.
 *
 * Las categorías se guardan en la BD con el nombre del ícono Lucide como
 * string (ej. "UtensilsCrossed") en vez de un emoji, para que el diseño
 * sea consistente con el lenguaje visual minimalista de Kairen Finanzas.
 *
 * Si el ícono no se reconoce (categorías antiguas con emoji, o personalizadas),
 * cae en "Tag" como fallback.
 */
import {
  UtensilsCrossed, Car, Zap, Clapperboard, Shirt, Heart,
  Banknote, TrendingUp, Briefcase, RotateCcw, Gift,
  MoreHorizontal, Tag, Home, ShoppingCart, Dumbbell,
  GraduationCap, Plane, Wifi, Phone, Coffee, Baby,
  PawPrint, Wrench, Building2, DollarSign, PiggyBank,
  CreditCard, Receipt, Landmark, Music, Gamepad2, BookOpen,
  Stethoscope, Fuel, Bus, Train, Bike, ShoppingBag
} from 'lucide-react'

const ICONOS = {
  UtensilsCrossed, Car, Zap, Clapperboard, Shirt, Heart,
  Banknote, TrendingUp, Briefcase, RotateCcw, Gift,
  MoreHorizontal, Tag, Home, ShoppingCart, Dumbbell,
  GraduationCap, Plane, Wifi, Phone, Coffee, Baby,
  PawPrint, Wrench, Building2, DollarSign, PiggyBank,
  CreditCard, Receipt, Landmark, Music, Gamepad2, BookOpen,
  Stethoscope, Fuel, Bus, Train, Bike, ShoppingBag
}

// Mapeo de emojis legacy → nombre de ícono Lucide
// (para categorías creadas antes de la migración)
const EMOJI_FALLBACK = {
  '🍔': 'UtensilsCrossed', '🚗': 'Car', '💡': 'Zap',
  '🎬': 'Clapperboard', '👕': 'Shirt', '🏥': 'Heart',
  '💰': 'Banknote', '📈': 'TrendingUp', '💼': 'Briefcase',
  '↩️': 'RotateCcw', '🎁': 'Gift', '📦': 'MoreHorizontal',
  '🏷️': 'Tag', '🏠': 'Home', '🛒': 'ShoppingCart',
  '💪': 'Dumbbell', '📚': 'BookOpen', '✈️': 'Plane',
  '☕': 'Coffee', '🐾': 'PawPrint', '🔧': 'Wrench',
  '💳': 'CreditCard', '🎵': 'Music', '🎮': 'Gamepad2'
}

export default function CategoriaIcono({ icono, size = 18, color, strokeWidth = 2 }) {
  // Resolver nombre del ícono: puede ser nombre directo ("UtensilsCrossed")
  // o un emoji legacy que mapeamos al nombre Lucide
  const nombreIcono = ICONOS[icono] ? icono : (EMOJI_FALLBACK[icono] || 'Tag')
  const Icono = ICONOS[nombreIcono] || Tag

  return <Icono size={size} strokeWidth={strokeWidth} color={color} />
}

// Exportar la lista de íconos disponibles para el selector de categorías
export const ICONOS_DISPONIBLES = [
  { nombre: 'UtensilsCrossed', label: 'Comida' },
  { nombre: 'Car', label: 'Auto' },
  { nombre: 'Zap', label: 'Servicios' },
  { nombre: 'Clapperboard', label: 'Entretenimiento' },
  { nombre: 'Shirt', label: 'Ropa' },
  { nombre: 'Heart', label: 'Salud' },
  { nombre: 'Home', label: 'Hogar' },
  { nombre: 'ShoppingCart', label: 'Compras' },
  { nombre: 'Dumbbell', label: 'Gym' },
  { nombre: 'GraduationCap', label: 'Educación' },
  { nombre: 'Plane', label: 'Viajes' },
  { nombre: 'Coffee', label: 'Café' },
  { nombre: 'Phone', label: 'Teléfono' },
  { nombre: 'Wifi', label: 'Internet' },
  { nombre: 'Baby', label: 'Bebé' },
  { nombre: 'PawPrint', label: 'Mascotas' },
  { nombre: 'Wrench', label: 'Reparaciones' },
  { nombre: 'Fuel', label: 'Gasolina' },
  { nombre: 'Bus', label: 'Transporte' },
  { nombre: 'Bike', label: 'Bici' },
  { nombre: 'Music', label: 'Música' },
  { nombre: 'Gamepad2', label: 'Juegos' },
  { nombre: 'BookOpen', label: 'Libros' },
  { nombre: 'Banknote', label: 'Dinero' },
  { nombre: 'TrendingUp', label: 'Inversión' },
  { nombre: 'Briefcase', label: 'Trabajo' },
  { nombre: 'RotateCcw', label: 'Reembolso' },
  { nombre: 'Gift', label: 'Regalo' },
  { nombre: 'PiggyBank', label: 'Ahorro' },
  { nombre: 'CreditCard', label: 'Tarjeta' },
  { nombre: 'Landmark', label: 'Banco' },
  { nombre: 'Building2', label: 'Empresa' },
  { nombre: 'Receipt', label: 'Factura' },
  { nombre: 'DollarSign', label: 'Ingreso' },
  { nombre: 'ShoppingBag', label: 'Bolsa' },
  { nombre: 'MoreHorizontal', label: 'Otros' },
]
