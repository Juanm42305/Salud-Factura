# Cómo trabajamos en equipo (git)

## Ramas

- `main`: siempre desplegable. Es lo que ve el jurado. Nadie hace push directo.
- `develop`: integración del equipo. Las ramas de trabajo se fusionan aquí.
- Ramas de trabajo, creadas desde `develop`:
  - `feat/pay-<tema>`: Integración Factus Pay (ej. `feat/pay-webhook`)
  - `feat/factus-<tema>`: Integración Factus Facturación (ej. `feat/factus-ss-recaudo`)
  - `feat/backend-<tema>`: Backend y validador (ej. `feat/backend-validador`)
  - `feat/front-<tema>`: Frontend (ej. `feat/front-caja`)
  - `fix/<tema>`: correcciones

## Flujo diario

```bash
git checkout develop
git pull
git checkout -b feat/pay-webhook
# ... trabajar ...
git add <archivos>
git commit -m "feat(pay): verificar llave del webhook"
git push -u origin feat/pay-webhook
# Abrir Pull Request hacia develop; otra persona revisa y aprueba.
```

Cuando `develop` está estable y probado contra sandbox, se abre un PR `develop → main`.

## Commits

Formato: `tipo(área): descripción corta`

- Tipos: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`
- Áreas: `pay`, `factus`, `backend`, `validador`, `front`, `db`, `deploy`

## Reglas de seguridad (obligatorias)

1. **Nunca** subir `.env` ni credenciales. Solo `.env.example` con valores vacíos.
2. Antes de cada push revisar `git diff --staged`: que no haya tokens, contraseñas ni client secret.
3. Factus Pay tiene **un solo token activo por usuario**. Si se autentican en paralelo, se revocan entre ustedes. Solo el servidor desplegado se autentica con el usuario real; en local usen el mock o coordinen.
4. Los datos de pacientes son ficticios.
5. Si alguien sube una credencial por error: avisar de inmediato, rotarla y limpiar el historial.

## Orden de construcción (sección 15.1 de la especificación)

1. Base: clientes HTTP, gestores de token, `/api/salud` en verde
2. Cobro: recaudo, QR, simulador, polling
3. Factura del copago (SS-Recaudo), PDF y XML
4. Despliegue y webhook
5. Factura a la EPS (SS-CUFE), manejo del 409
6. Validador V01–V20
7. Cartera y glosas (nota crédito)
8. README, video y pitch

Los pasos 1 a 4 son el mínimo para no quedar descalificados.
