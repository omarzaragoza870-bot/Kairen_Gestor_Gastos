// ============================================================
// Kairen Finanzas — Suscripción Premium (RevenueCat + Google Play)
//
// La compra la cobra Google Play; RevenueCat la valida. La app nunca decide
// sola si alguien es premium: después de comprar o restaurar se llama a la
// Edge Function sincronizar-premium, que pregunta a RevenueCat y actualiza
// perfiles.plan. El webhook de RevenueCat hace lo mismo con renovaciones y
// vencimientos.
//
// VITE_REVENUECAT_ANDROID_KEY es la llave PÚBLICA del SDK (empieza con goog_);
// es segura en el código de la app. Sin ella, la tienda simplemente no aparece.
// ============================================================

import { Capacitor } from '@capacitor/core'
import { supabase } from './supabaseClient.js'
import { logWarn } from './logger.js'

const LLAVE_ANDROID = import.meta.env.VITE_REVENUECAT_ANDROID_KEY
const ENTITLEMENT = 'premium'

// Códigos de error del SDK (PURCHASES_ERROR_CODE)
const CANCELADA = '1'
const YA_COMPRADO = '6'
const PAGO_PENDIENTE = '20' // OXXO, efectivo y otros métodos lentos de Google Play

// configure() va una sola vez por arranque; después solo logIn/logOut
let sdkConfigurado = false
// Los cambios de usuario van en fila: un logout y un login seguidos no se pisan
let cola = Promise.resolve()
const enCola = (tarea) => (cola = cola.then(tarea, tarea))

export const esAndroid = () => Capacitor.getPlatform() === 'android'

/** La tienda solo existe en la app de Android con la llave configurada. */
export function pagosDisponibles() {
  return esAndroid() && Boolean(LLAVE_ANDROID)
}

// El plugin se carga solo en Android: en la web no hay nada que cobrar
const sdk = async () => (await import('@revenuecat/purchases-capacitor')).Purchases

/** Deja RevenueCat identificado con este usuario de Supabase. Lanza error si no puede. */
async function identificar(userId) {
  const Purchases = await sdk()
  if (!sdkConfigurado) {
    await Purchases.configure({ apiKey: LLAVE_ANDROID, appUserID: userId })
    sdkConfigurado = true
    return Purchases
  }
  const { appUserID } = await Purchases.getAppUserID()
  if (appUserID !== userId) await Purchases.logIn({ appUserID: userId })
  return Purchases
}

/** Al iniciar sesión (o cambiar de cuenta). Si falla, se reintenta antes de comprar. */
export function iniciarPagos(userId) {
  if (!pagosDisponibles() || !userId) return Promise.resolve()
  return enCola(async () => {
    try {
      await identificar(userId)
      // Corrige el plan si se perdió un aviso del webhook (renovación o vencimiento)
      await confirmarEnServidor().catch(err => logWarn('No se pudo revisar la suscripción', err))
    } catch (err) {
      logWarn('No se pudo iniciar RevenueCat', err)
    }
  })
}

/** Al cerrar sesión, la siguiente cuenta no hereda la suscripción de la anterior. */
export function cerrarPagos() {
  if (!pagosDisponibles() || !sdkConfigurado) return Promise.resolve()
  return enCola(async () => {
    try {
      const Purchases = await sdk()
      await Purchases.logOut()
    } catch (err) {
      // logOut falla si el usuario ya era anónimo en RevenueCat: no importa
      logWarn('RevenueCat logOut', err)
    }
  })
}

/** Usuario de Supabase con sesión; las compras siempre quedan a su nombre. */
async function usuarioActual() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')
  return user.id
}

/** Planes a la venta: [{ id, titulo, precio, periodo, paquete }]. */
export async function obtenerPlanes() {
  const Purchases = await enCola(async () => identificar(await usuarioActual()))
  const ofertas = await Purchases.getOfferings()
  return (ofertas.current?.availablePackages || []).map(p => ({
    id: p.identifier,
    titulo: p.product.title,
    precio: p.product.priceString,
    periodo: p.packageType, // MONTHLY, ANNUAL, LIFETIME…
    paquete: p
  }))
}

/** Pide a la Edge Function que confirme con RevenueCat. Devuelve true si quedó premium. */
async function confirmarEnServidor() {
  const { data, error } = await supabase.functions.invoke('sincronizar-premium')
  if (error) throw error
  return Boolean(data?.premium)
}

/**
 * Compra un plan. Devuelve { premium, cancelado, pendiente, yaComprado }.
 * Antes de cobrar se verifica que RevenueCat tenga al usuario correcto: si
 * no, la compra quedaría a nombre de otra cuenta.
 */
export async function comprar(plan) {
  const Purchases = await enCola(async () => identificar(await usuarioActual()))
  try {
    await Purchases.purchasePackage({ aPackage: plan.paquete })
  } catch (err) {
    if (err?.userCancelled || err?.code === CANCELADA) return { premium: false, cancelado: true }
    if (err?.code === PAGO_PENDIENTE) return { premium: false, pendiente: true }
    if (err?.code === YA_COMPRADO) return { premium: false, yaComprado: true }
    throw err
  }
  return { premium: await confirmarEnServidor() }
}

/** "Restaurar compras": recupera una suscripción hecha con la misma cuenta de Google. */
export async function restaurar() {
  const Purchases = await enCola(async () => identificar(await usuarioActual()))
  const { customerInfo } = await Purchases.restorePurchases()
  const activoEnTienda = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT])
  const premium = await confirmarEnServidor()
  return { premium, activoEnTienda }
}

/** Página de Google Play para cancelar o cambiar la suscripción. */
export const URL_ADMINISTRAR_SUSCRIPCION = 'https://play.google.com/store/account/subscriptions?package=com.kairen.finanzas'
