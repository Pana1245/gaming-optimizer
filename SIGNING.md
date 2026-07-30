# Firma de código (SignPath Foundation)

Gaming Optimizer es un ejecutable **sin certificado de firma**, así que Windows
SmartScreen muestra una advertencia al instalar ("Windows protegió tu PC"). La
solución sin costo para proyectos open source es **[SignPath Foundation](https://signpath.org/foundation)**,
que dona certificados de firma + infraestructura a proyectos OSS.

Firmar el instalador:
- Elimina (con el tiempo, al ganar reputación) la advertencia de SmartScreen.
- Reduce los falsos positivos de antivirus (incluido el driver de temperatura).

## Cómo funciona

SignPath **no firma localmente**: firma el artefacto que produce el CI, para
garantizar que el binario firmado corresponde al código fuente público. El flujo:

```
GitHub Actions (build) ──► instalador SIN firmar ──► SignPath (firma) ──► instalador FIRMADO
```

Ya está listo el prerequisito: el workflow [`.github/workflows/build.yml`](.github/workflows/build.yml)
compila el instalador NSIS en cada push a `main`/tag y lo sube como artefacto.

## Pasos para activarla (los hace el dueño del repo — requieren identidad)

1. **Aplicar** en https://signpath.org/apply con este repo (público, OSS). Piden
   que el proyecto sea real/establecido y que el build sea reproducible desde CI.
2. Cuando aprueban, SignPath crea una **organización** para el proyecto e instala
   su **GitHub App**. Ahí se define un **signing policy** (release / test).
3. Agregar al workflow un paso que **envía el artefacto a firmar** y descarga el
   firmado, con la acción oficial:

   ```yaml
   - uses: signpath/github-action-submit-signing-request@v1
     with:
       api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
       organization-id: <ORG_ID de SignPath>
       project-slug: gaming-optimizer
       signing-policy-slug: release-signing
       github-artifact-id: ${{ steps.upload.outputs.artifact-id }}
       output-artifact-directory: signed
   ```

4. **Publicar el instalador firmado** (el de `signed/`) en el GitHub Release.

## Updater (importante)

La firma del updater (`.sig` minisign) se genera **sobre el `.exe` ya firmado por
SignPath**, porque la firma depende de los bytes finales del archivo. Orden correcto:

1. CI construye el instalador sin firmar.
2. SignPath lo firma.
3. Recién ahí: `TAURI_SIGNING_PRIVATE_KEY=... tauri signer sign <instalador-firmado>`
   para generar el `.sig`, y armar `latest.json` apuntando al instalador firmado.

Hasta activar SignPath, la publicación sigue siendo manual (ver
[`memoria del flujo de release`]) con el instalador sin certificado.
