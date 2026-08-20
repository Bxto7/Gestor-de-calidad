# Activos de marca — Universidad Continental

## Convención de nombres

`<marca>-<tinta>[-sobre-<fondo>].<ext>`

**Sin sufijo `sobre-…` significa fondo transparente.** Con sufijo, el fondo viene pegado
al archivo y solo sirve sobre ese color exacto.

## Inventario actual

| Archivo                | Tamaño real | Fondo        | Estado                              |
| ---------------------- | ----------- | ------------ | ----------------------------------- |
| `logo-uc-negro.png`    | 890×187     | Transparente | **En uso** — panel morado del login |
| `isotipo-uc-negro.png` | 257×187     | Transparente | **En uso** — panel blanco del login |

Se eliminaron tres archivos del kit original por venir con el fondo opaco pegado
(`logo-uc-negro-sobre-blanco`, `logo-uc-blanco-sobre-negro`,
`isotipo-uc-negro-sobre-blanco`): sobre el panel morado mostraban un recuadro sólido, y no
aportaban nada que el archivo transparente no cubra.

### Advertencia: son PNG, no SVG

Los archivos del kit original llegaron como PNG **con extensión `.svg`**. Eso no es
cosmético: el servidor manda `Content-Type: image/svg+xml` según la extensión, el
navegador intenta parsear XML, encuentra binario y la imagen no carga. Se verificó y los
tres daban `naturalWidth = 0`. Ya están renombrados a `.png`.

Sigue pendiente pedir el kit oficial en **SVG**. La resolución actual alcanza (el lockup
se renderiza a 162px desde 890px), pero un vector elimina el peso del raster y aguanta
cualquier tamaño futuro.

### `isotipo-uc-negro.png` es un derivado

No vino en el kit. Es un **recorte directo** del símbolo dentro de `logo-uc-negro.png`
(región x 0–256, donde termina el símbolo y empieza un hueco de 49px antes del texto). No
se repintó ni se alteró nada, solo se recortó. Reemplazar por el isotipo oficial cuando
esté disponible.

El isotipo que sí venía en el kit (`isotipo-uc-...-sobre-blanco`) no servía: lienzo de
440×440 con la marca ocupando solo 314×238 y márgenes enormes, lo que en un cuadro de
44px la dejaba en ~31×24.

## Cómo se recolorea a blanco

El único archivo con transparencia es negro. La clase `.uc-logo-img--blanco` aplica
`filter: brightness(0) invert(1)`, que lo pasa a blanco puro respetando el alfa.

Funciona porque el logo es monocromático. **Si algún día llega una versión multicolor,
este truco la destruye** — en ese caso hay que pedir la versión monocromática blanca
oficial en lugar de forzarla por CSS.

## Dónde se usan

Los imports están en
[`../../features/auth/components/icons.tsx`](../../features/auth/components/icons.tsx)
(`LogotipoUC` e `IsotipoUC`). Las medidas viven en la sección "Logo institucional" de
[`../../features/auth/pages/LoginPage.css`](../../features/auth/pages/LoginPage.css).

## Nota legal

El logo es marca registrada de la Universidad Continental.
