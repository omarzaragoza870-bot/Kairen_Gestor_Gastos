# Kairen Finanzas — Android con Capacitor

Esto envuelve tu PWA en una app Android nativa real. El resultado es un
archivo `.apk` que puedes mandar por WhatsApp/Drive/lo que sea — tus
amigos solo necesitan activar "Instalar de orígenes desconocidos" en su
teléfono para abrirlo. **No pasa por Google Play, no cuesta nada.**

## Requisitos en tu Codespace (o tu compu)

Necesitas **Java (JDK 17)** y el **Android SDK**. En Codespaces, corre esto una vez:

```bash
# Java
sudo apt update && sudo apt install -y openjdk-17-jdk

# Android SDK (línea de comandos, sin Android Studio completo)
mkdir -p ~/android-sdk/cmdline-tools
cd ~/android-sdk/cmdline-tools
curl -o cmdtools.zip https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip cmdtools.zip && mv cmdline-tools latest
cd ~
echo 'export ANDROID_HOME=$HOME/android-sdk' >> ~/.bashrc
echo 'export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools' >> ~/.bashrc
source ~/.bashrc

# Acepta licencias e instala las piezas necesarias
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## 1. Instala las dependencias de Capacitor

```bash
npm install
```

(Ya agregué `@capacitor/core`, `@capacitor/android`, `@capacitor/browser`,
`@capacitor/app` y `@capacitor/cli` a tu `package.json`.)

## 2. Construye la web y agrega la plataforma Android

```bash
npm run build
npm run android:add
```

Esto crea una carpeta `android/` con el proyecto nativo completo — es
normal que sea grande, esa carpeta **no se sube a git** (agrégala a
`.gitignore` si no está ya).

## 3. Configura el esquema de deep link para el login de Google

Abre `android/app/src/main/AndroidManifest.xml` y busca la actividad
principal (`<activity android:name=".MainActivity" ...>`). Agrégale este
`intent-filter` adentro (junto a los que ya tiene):

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="com.kairen.finanzas" android:host="login-callback" />
</intent-filter>
```

## 4. Registra la URL de regreso en Supabase

Ve a Supabase → **Authentication → URL Configuration → Redirect URLs**, y agrega:
```
com.kairen.finanzas://login-callback
```

## 5. Sincroniza y genera el APK

```bash
npm run android:sync
npm run android:build-debug
```

El archivo queda en:
```
android/app/build/outputs/apk/debug/app-debug.apk
```

Ese es el archivo que le mandas a tus amigos. Descárgalo desde Codespaces
(clic derecho → Download en el explorador de archivos de VSCode).

## Notas importantes

- **APK debug vs release**: el comando de arriba genera un APK "debug" —
  funciona perfecto para que tus amigos lo prueben, pero técnicamente no
  está pensado para producción final (no está firmado con una llave de
  release). Para eso, cuando quieras publicar de verdad, se genera un
  "release" firmado — te ayudo con eso cuando llegue el momento.
- **Cada vez que cambies código**, repite desde el paso 5 (`android:sync`
  y `android:build-debug`) para que el APK tenga los cambios nuevos.
- **El ícono/splash screen** de la app seguirán siendo los genéricos de
  Capacitor hasta que generemos los tuyos — dímelo cuando quieras
  encargarte de eso.
