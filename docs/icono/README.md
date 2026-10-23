# Ícono de Kairen — "Anillo con orejas"

Anillo de meta en progreso con dos orejas de cachorro de jaguar; el punto verde (#30D158) es la meta.
Elegido el 23 de octubre de 2026 entre 7 propuestas.

## Archivos

- `svg/icono-oscuro.svg` — ícono principal (marca clara sobre #0A0A0A), lienzo 1024 a sangre.
- `svg/icono-claro.svg` — variante sobre fondo claro (punto #248A3D).
- `svg/glifo.svg` — silueta de un color, para íconos temáticos.
- `svg/capa-frontal.svg` — marca sin fondo (capa frontal del ícono adaptable de Android).
- `geometria.py` — geometría paramétrica (radios, grosor, orejas). Cambia los valores de `P` y vuelve a generar.
- `generar_assets.py` — genera todos los PNG de iOS, Android y web.

## Regenerar

Requiere Python con Pillow y Google Chrome instalado.

```
python docs/icono/geometria.py <carpeta_salida>
python docs/icono/generar_assets.py <carpeta_salida> <raíz_del_proyecto> <carpeta_temporal>
npx cap sync
```

Medidas clave: el lienzo de 1024 equivale a la capa de 108 dp de Android; la zona segura es un círculo de radio 310
centrado. En Android la marca se dibuja al 82 % (`ESCALA_ANDROID`) para que ocupe ~52 dp de los 72 visibles.
