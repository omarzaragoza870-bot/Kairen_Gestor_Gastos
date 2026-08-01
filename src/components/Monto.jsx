import { usePreferencias } from '../context/PreferenciasContext.jsx'

const fmt = (n) => Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })

/**
 * Muestra un monto en pesos. Si el usuario activó "Ocultar saldos"
 * en Ajustes, se reemplaza por •••• en vez del número real.
 */
export default function Monto({ valor, prefijo = '', style }) {
  const { ocultarSaldos } = usePreferencias()

  if (ocultarSaldos) {
    return <span style={style}>{prefijo}••••</span>
  }
  return <span style={style}>{prefijo}{fmt(valor)}</span>
}
