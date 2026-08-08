/**
 * Placeholder de la sección Pimia — Fase 0.
 *
 * Su única función es demostrar que la receta de `docs/MAPA-FRONTEND.md`
 * funciona: una sección propia en la nav izquierda, con su ruta y su gate,
 * sin tocar una sola línea del core de mensajería.
 *
 * LA FRONTERA (plan §1, innegociable): cuando esta pantalla deje de ser un
 * placeholder, hablará con la API de Pimia por HTTP (SDK + OAuth + scopes) y
 * NUNCA por el relay. Los mensajes de canal se guardan en claro en el Postgres
 * del relay, que no administramos: ningún dato del ERP —clientes, importes,
 * datos fiscales— puede pasar por ahí. En `shared/api/` eso significa: este
 * módulo no importa nada de `relay*.ts`.
 */

export function PimiaScreen() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-2xl font-semibold text-foreground">Pimia</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        Aquí vivirá el panel del ERP. Hoy es un placeholder de la Fase&nbsp;0:
        prueba de que se puede añadir una sección propia sin tocar el core de
        mensajería.
      </p>
      <p className="max-w-md text-2xs text-muted-foreground">
        Los datos del ERP viajarán por la API de Pimia, nunca por el relay.
      </p>
    </div>
  );
}
