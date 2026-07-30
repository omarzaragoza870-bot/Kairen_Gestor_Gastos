# Trazo (KAIREN)

PWA de control de gastos — mismo stack y estilo visual que KAIREN.

## Estructura
```
trazo/
├── index.html
├── vite.config.js       # PWA + service worker network-first
├── package.json
└── src/
    ├── main.jsx
    ├── App.jsx           # navegación entre pantallas
    ├── styles/theme.css  # paleta azul-morado + Poppins (tokens de KAIREN)
    ├── components/
    │   ├── InfoTooltip.jsx   # ⓘ mejora #4
    │   └── BottomNav.jsx
    └── screens/
        ├── Inicio.jsx
        ├── NuevaTransaccion.jsx  # selector Efectivo/Tarjeta en Gasto E Ingreso (mejora #1)
        └── Placeholder.jsx       # Análisis, Ahorro, Metas, Ajustes (pendientes)
```

## Levantar en Codespaces / local
```bash
npm install
npm run dev
```

## Estado de las 5 mejoras
| # | Mejora | Estado |
|---|--------|--------|
| 1 | Selector Efectivo/Tarjeta en Ingreso | ✅ hecho en NuevaTransaccion.jsx |
| 2 | Tour guiado de onboarding | ⏳ pendiente (reutilizará el copy de InfoTooltip) |
| 3 | Ahorro externo (solo tracking, sin tocar Metas) | ⏳ tab creado, falta pantalla real |
| 4 | Iconos ⓘ contextuales | ✅ componente listo, falta regarlo en todas las tarjetas |
| 5 | Backup/sync con cuenta Google | ⏳ pendiente — decidir Supabase vs Firebase |

## Siguiente paso sugerido
Elegir backend de sync (punto 5) antes de construir Ahorro externo y Metas,
porque de eso depende el modelo de datos (transacciones) desde el inicio.
