import { usePreferencias } from '../context/PreferenciasContext.jsx'

/**
 * Muestra un monto en la moneda elegida en Ajustes. Si el usuario activó
 * "Ocultar saldos", se reemplaza por •••• en vez del número real.
 *
 * Nota: esto solo cambia el símbolo/formato de despliegue — no convierte
 * el valor con un tipo de cambio real, ya que los montos se guardan tal
 * cual los captura el usuario.
 */
export default function Monto({ valor, prefijo = '', style }) {
  const { ocultarSaldos, moneda } = usePreferencias()

  if (ocultarSaldos) {
    return <span style={style}>{prefijo}••••</span>
  }
  const texto = Number(valor).toLocaleString('es-MX', { style: 'currency', currency: moneda })
  return <span style={style}>{prefijo}{texto}</span>
}