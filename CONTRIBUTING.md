# Cómo trabajamos en equipo (git)

## Ramas

- `main`: siempre desplegable. Es lo que ve el jurado. Nadie hace push directo; todo entra por Pull Request.
- Una rama por capa del sistema, creadas desde `main`:

| Rama | Capa | Carpetas que toca |
|---|---|---|
| `api` | Integración con Factus Pay y Factus Facturación | `lib/factus/`, `lib/builders/`, `app/webhooks/` |
| `backend` | Lógica, datos y validador | `app/api/`, `lib/services/`, `lib/validation/`, `lib/db.ts`, `db/`, `scripts/`, `tests/` |
| `frontend` | Pantallas | `app/page.tsx`, `app/caja/`, `app/facturacion/`, `app/glosas/`, `app/cartera/`, `app/components/`, `app/globals.css` |

Cada uno trabaja en la rama de su capa. Si un cambio necesita tocar carpetas de otra capa, se avisa al equipo antes, para no pisarse.

## Flujo diario

```bash
git checkout api            # o backend / frontend
git pull                    # traer lo último de tu rama
git merge origin/main       # traer lo que ya entró a main desde las otras ramas
# ... trabajar ...
git add <archivos>
git commit -m "feat(pay): verificar llave del webhook"
git push
# Cuando algo funciona, abrir Pull Request  api → main; otra persona revisa y aprueba.
```

Hagan PR a `main` seguido, apenas algo funcione, para que las otras ramas no se queden atrás.

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
