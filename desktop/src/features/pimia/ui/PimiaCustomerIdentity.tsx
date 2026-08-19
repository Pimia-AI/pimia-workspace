/**
 * El panel de identidad de la ficha de cliente: **quién es**, en tres pestañas
 * porque son tres preguntas distintas —sus datos, dónde está y cómo paga.
 *
 * ## Todo lo de aquí ya venía en la respuesta
 *
 * Ni un campo de este panel cuesta una petición nueva: `getCustomer` no manda
 * `view=summary`, así que la ficha recibía el `CustomerResource` entero y
 * `normalizeCustomer` se quedaba con nueve campos. Web, prefijo, notas, moneda,
 * forma de pago, direcciones y el bloque SEPA estaban en el cable y se tiraban.
 *
 * ## Las cuatro decisiones que no son de estilo
 *
 * 1. **Un renglón sin valor NO se pinta.** Ni etiqueta suelta, ni raya. La raya
 *    de este ERP significa «se pidió y no se pudo leer», y en una ficha de alta
 *    parcial —el estado normal de un tenant recién migrado— quince rayas en
 *    columna se leen como quince fallos. El filtro es explícito
 *    (`value !== null`) y no por *truthiness*: con `Boolean(value)` un campo
 *    cuyo valor legítimo fuese `""` o `0` desaparecería sin que nadie lo notara,
 *    que es el defecto que arrastraba el `DetailGrid` al que esto sustituye.
 *    ⚠️ El dinero **no** pasa por aquí: los importes van a `PimiaAmount`, que
 *    sí distingue «vale cero» de «no se pudo leer».
 * 2. **Las direcciones son relaciones opcionales.** El contrato no promete que
 *    el `show` las cargue (`billing` lleva `?` incluso en
 *    `GET /customers/{customer}`), así que si no vienen el bloque **no se pinta
 *    y no deja hueco**; y cuando el envío coincide con la facturación se dice en
 *    una línea en vez de repetirla —con `sameAddress`, que es estricta a
 *    propósito: equivocarse ahí manda bultos a otra puerta.
 * 3. **El bloque SEPA es de SÓLO LECTURA, y se nota.** `iban`, `bic`,
 *    `sepa_mandate_id` y `sepa_mandate_date` están en el **Resource** y **no**
 *    en el `CustomerRequest`: se pueden leer y no se pueden escribir. Por eso no
 *    hay ni un botón de editar ahí dentro; ofrecerlo sería una promesa que la
 *    API no cumple.
 * 4. **El IBAN se tapa por defecto**, con un botón para destaparlo. Es patrón
 *    visual de la maqueta y se porta entero: es el único dato de la ficha que no
 *    debería leerse de reojo por encima del hombro. ⛔ Lo que **no** se porta es
 *    el nombre del banco deducido del código de entidad: el servidor no lo
 *    manda, y escribir «Banco Santander» a partir de cuatro dígitos es afirmar
 *    un dato derivado justo donde se paga dinero.
 *
 * ⛔ **`enable_portal` no se pinta**: es un booleano tipado `string` y el
 * contrato no publica sus valores. «Portal: activo» adivinando el valor sería
 * inventar.
 */

import * as React from "react";
import {
  Building2,
  CalendarDays,
  Coins,
  CreditCard,
  Eye,
  EyeOff,
  Globe,
  Hash,
  IdCard,
  Landmark,
  Mail,
  MapPin,
  NotebookPen,
  Phone,
  Truck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { hasAddress, type PimiaAddress } from "@/features/pimia/api/addresses";
import type { PimiaCustomer } from "@/features/pimia/api/customers";
import { openExternalUrl } from "@/features/pimia/api/shell";
import {
  groupIban,
  maskIban,
  sameAddress,
} from "@/features/pimia/lib/customers";
import { addressLines } from "@/features/pimia/ui/PimiaDocumentParts";
import { formatIsoDateShort } from "@/features/pimia/ui/pimiaDates";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { cn } from "@/shared/lib/cn";

/* Ata la `<section>` con su `<h2>`. Constante de módulo y no `useId()`:
 * `aria-labelledby` lo necesita estable entre renders. */
const IDENTITY_TITLE_ID = "pimia-customer-identity-title";

const TAB_LIST =
  "h-10 w-max gap-0 rounded-none bg-transparent px-2 py-0 text-muted-foreground";
const TAB_TRIGGER =
  "h-full rounded-none border-b-2 border-transparent px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
const PANEL = "mt-0 p-4 sm:p-5";
/** Lo que dice una pestaña que no tiene nada que enseñar. */
const EMPTY_LINE = "text-sm text-muted-foreground";

type DatoProps = {
  children: React.ReactNode;
  icon: typeof Mail;
  label: string;
  /** Cifras de ancho fijo: teléfonos, NIF, fechas, prefijos. */
  mono?: boolean;
};

/** Un par etiqueta/valor del panel. */
function Dato({ children, icon: Icon, label, mono }: DatoProps) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/70"
      />
      <div className="min-w-0">
        <dt className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd
          className={cn(
            "mt-0.5 break-words text-sm font-medium text-foreground",
            mono ? "tabular-nums" : undefined,
          )}
        >
          {children}
        </dd>
      </div>
    </div>
  );
}

/**
 * La web del cliente, abierta **fuera** de la app.
 *
 * Un `<a href>` dentro del webview de Tauri se lleva la aplicación entera a
 * otra página, sin barra de direcciones y sin vuelta; el ERP ya tiene su puerta
 * para esto (`api/shell.ts`), que además sólo deja pasar `http` y `https`.
 *
 * ⚠️ El campo puede llegar **sin esquema** (`reformasvera.es`): sin
 * normalizarlo, `new URL()` lo rechaza y el enlace no abriría nada. Se le pone
 * `https://` para navegar y se enseña sin esquema, que es como se lee.
 */
function WebsiteLink({ website }: { website: string }) {
  const href = /^https?:\/\//i.test(website) ? website : `https://${website}`;
  const shown = website.replace(/^https?:\/\//i, "").replace(/\/$/, "");

  return (
    <button
      className="text-left text-primary hover:underline"
      onClick={() => {
        void openExternalUrl(href).catch((error: unknown) => {
          toast.error(
            error instanceof Error
              ? error.message
              : "No se pudo abrir la web del cliente",
          );
        });
      }}
      type="button"
    >
      {shown}
    </button>
  );
}

/* ⚠️ **La poda de la dirección se importa, no se escribe aquí.**
 *
 * Hasta el 2026-08-19 este fichero tenía su propia `addressLines`, con criterios
 * propios: calle y número en renglones separados, la provincia en el suyo y
 * omitida cuando repetía la ciudad. El papel del presupuesto tenía otra y el de
 * la factura una tercera, así que **el mismo cliente se imprimía distinto en su
 * ficha, en su presupuesto y en su factura** —tres pantallas que se recorren
 * seguidas con un clic—. Una regla escrita tres veces es una regla que un día
 * se «simplifica» en uno de los tres sitios.
 *
 * La regla vive ahora en `PimiaDocumentParts`, que no es de ningún documento, y
 * aquí sólo se usa. Lo que se pierde al adoptarla es el renglón propio de
 * `street2` —cosmético— y la poda de la provincia que repite la ciudad
 * («04620 Almería, Almería»), que **no** es cosmética y está pedida allí en el
 * informe de este trabajo: si se arregla, se arregla para los tres papeles a la
 * vez, que es justo el motivo de que la regla sea una sola. */

function AddressBlock({
  address,
  icon: Icon,
  title,
}: {
  address: PimiaAddress;
  icon: typeof MapPin;
  title: string;
}) {
  const lines = addressLines(address);

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
        <Icon aria-hidden="true" className="h-3.5 w-3.5" />
        {title}
      </p>
      <div className="space-y-0.5 text-sm leading-relaxed">
        {address.name ? (
          <p className="font-medium text-foreground">{address.name}</p>
        ) : null}
        {lines.map((line) => (
          <p className="text-muted-foreground" key={line}>
            {line}
          </p>
        ))}
        {address.phone ? (
          <p className="pt-1 tabular-nums text-muted-foreground">
            {address.phone}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** La tarjeta de un instrumento de cobro: cuadro de icono, título y detalle. */
function PaymentCard({
  children,
  icon: Icon,
  title,
}: {
  children?: React.ReactNode;
  icon: typeof Landmark;
  title: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border px-3.5 py-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="h-4 w-4" />
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {children}
      </div>
    </div>
  );
}

function SepaCard({ customer }: { customer: PimiaCustomer }) {
  const [revealed, setRevealed] = React.useState(false);
  const mandate = [
    customer.sepaMandateId ? `Mandato ${customer.sepaMandateId}` : null,
    customer.sepaMandateDate
      ? `firmado el ${formatIsoDateShort(customer.sepaMandateDate)}`
      : null,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ");

  return (
    <PaymentCard icon={Landmark} title="Domiciliación bancaria">
      {customer.iban ? (
        <p className="flex items-center gap-1.5">
          <span className="text-xs font-medium tabular-nums text-foreground">
            {revealed ? groupIban(customer.iban) : maskIban(customer.iban)}
          </span>
          <Button
            aria-label={revealed ? "Ocultar el IBAN" : "Mostrar el IBAN"}
            className="h-5 w-5 text-muted-foreground"
            onClick={() => setRevealed((current) => !current)}
            size="icon"
            variant="ghost"
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        </p>
      ) : null}
      {customer.bic ? (
        <p className="text-xs tabular-nums text-muted-foreground">
          BIC {customer.bic}
        </p>
      ) : null}
      {mandate === "" ? null : (
        <p className="text-xs text-muted-foreground">{mandate}</p>
      )}
    </PaymentCard>
  );
}

export function PimiaCustomerIdentity({
  customer,
}: {
  customer: PimiaCustomer;
}) {
  /* Los pares de «Info», en el orden en que se leen. El valor es `string | null`
   * —nunca un importe— y el `null` quita el renglón entero. */
  const rows: {
    icon: typeof Mail;
    label: string;
    mono?: boolean;
    value: string | null;
  }[] = [
    {
      icon: Building2,
      label: "Razón social",
      // Sólo cuando dice algo que el nombre comercial no diga ya.
      value:
        customer.companyName && customer.companyName !== customer.name
          ? customer.companyName
          : null,
    },
    {
      icon: UserRound,
      label: "Persona de contacto",
      value: customer.contactName,
    },
    { icon: Mail, label: "Email", value: customer.email },
    { icon: Phone, label: "Teléfono", mono: true, value: customer.phone },
    { icon: IdCard, label: "NIF / CIF", mono: true, value: customer.taxId },
    {
      icon: Hash,
      label: "Prefijo de numeración",
      mono: true,
      value: customer.prefix,
    },
    {
      icon: Coins,
      label: "Moneda",
      // El código ya va de chip en la cabecera; aquí, el nombre.
      value: customer.currencyName ?? customer.currencyCode,
    },
    {
      icon: CalendarDays,
      label: "Alta",
      mono: true,
      // La fecha ya viene recortada a `YYYY-MM-DD` del normalizador.
      value: customer.createdAt ? formatIsoDateShort(customer.createdAt) : null,
    },
  ];

  const visible = rows.filter((row) => row.value !== null);

  /* La web **no está en `rows`** —su valor no es texto, es un botón que abre el
   * navegador— pero es un dato de la pestaña como cualquier otro, así que cuenta
   * para saber si hay algo que enseñar. Colgarla del `visible.length > 0` de las
   * otras ocho filas la tiraba en el borde donde ninguna de ellas llegó: dato ya
   * pagado en la respuesta, perdido en la última línea del viaje, y encima con
   * la ficha afirmando «sólo tiene el nombre» de un cliente del que el ERP tiene
   * también su web. */
  const hasInfo = visible.length > 0 || customer.website !== null;

  const billing = hasAddress(customer.billing) ? customer.billing : null;
  const shipping = hasAddress(customer.shipping) ? customer.shipping : null;
  const shippingIsBilling = sameAddress(billing, shipping);

  /* La otra mitad de `sameAddress`, que su docblock promete y hasta ahora no
   * cumplía nadie: **el teléfono no entra en la comparación** —dos direcciones
   * idénticas con teléfonos distintos siguen siendo el mismo sitio— «y `phone`
   * se pinta aparte». No se pintaba: al coincidir la dirección, el bloque de
   * envío entero se sustituye por una frase, y el único sitio donde se imprimía
   * `address.phone` era ese bloque. Y tener la misma dirección con otro
   * teléfono es justo el motivo normal de tener dos: el contacto de entregas.
   * Sin esta línea, quien llama por un bulto marca administración. */
  const shippingPhone =
    shippingIsBilling &&
    shipping !== null &&
    shipping.phone !== null &&
    shipping.phone !== billing?.phone
      ? shipping.phone
      : null;

  const hasSepa = Boolean(
    customer.iban ||
      customer.bic ||
      customer.sepaMandateId ||
      customer.sepaMandateDate,
  );

  return (
    <section
      aria-labelledby={IDENTITY_TITLE_ID}
      className="overflow-hidden rounded-xl border border-border bg-card"
      data-testid="pimia-customer-identity"
    >
      <h2 className="sr-only" id={IDENTITY_TITLE_ID}>
        Datos del cliente
      </h2>

      <Tabs defaultValue="info">
        <div className="overflow-x-auto border-b border-border">
          <TabsList className={TAB_LIST}>
            <TabsTrigger className={TAB_TRIGGER} value="info">
              Info
            </TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER} value="direcciones">
              Direcciones
            </TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER} value="pago">
              Pago
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className={PANEL} value="info">
          {!hasInfo && customer.notes === null ? (
            <p className={EMPTY_LINE}>
              De este cliente el ERP sólo tiene el nombre.
            </p>
          ) : null}
          {hasInfo ? (
            <dl className="space-y-3.5">
              {visible.map((row) => (
                <Dato
                  icon={row.icon}
                  key={row.label}
                  label={row.label}
                  mono={row.mono}
                >
                  {row.value}
                </Dato>
              ))}
              {customer.website ? (
                <Dato icon={Globe} label="Web">
                  <WebsiteLink website={customer.website} />
                </Dato>
              ) : null}
            </dl>
          ) : null}
          {customer.notes ? (
            <div className="mt-4 border-t border-border pt-3.5">
              <dl>
                <Dato icon={NotebookPen} label="Notas internas">
                  <span className="whitespace-pre-line font-normal">
                    {customer.notes}
                  </span>
                </Dato>
              </dl>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent className={PANEL} value="direcciones">
          {billing === null && shipping === null ? (
            /* Relación opcional: que no venga no significa que no la tenga, y
             * decir «sin dirección» afirmaría más de lo que se sabe. */
            <p className={EMPTY_LINE}>
              Esta respuesta no trae direcciones de este cliente.
            </p>
          ) : (
            <div className="space-y-5">
              {billing ? (
                <AddressBlock
                  address={billing}
                  icon={MapPin}
                  title="Dirección de facturación"
                />
              ) : null}
              {shipping && !shippingIsBilling ? (
                <div className={billing ? "border-t border-border pt-4" : ""}>
                  <AddressBlock
                    address={shipping}
                    icon={Truck}
                    title="Dirección de envío"
                  />
                </div>
              ) : null}
              {shippingIsBilling ? (
                <div className="border-t border-border pt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                    <Truck aria-hidden="true" className="h-3.5 w-3.5" />
                    Dirección de envío
                  </p>
                  <p className="text-sm text-muted-foreground">
                    La misma que la de facturación.
                  </p>
                  {shippingPhone === null ? null : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Con otro teléfono de contacto:{" "}
                      <span className="tabular-nums text-foreground">
                        {shippingPhone}
                      </span>
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent className={PANEL} value="pago">
          {customer.paymentMethodName === null && !hasSepa ? (
            <p className={EMPTY_LINE}>
              Este cliente no trae forma de cobro pactada.
            </p>
          ) : (
            <div className="space-y-2.5">
              {customer.paymentMethodName ? (
                <PaymentCard icon={CreditCard} title="Forma de cobro habitual">
                  <p className="text-xs text-muted-foreground">
                    {customer.paymentMethodName}
                  </p>
                </PaymentCard>
              ) : null}
              {hasSepa ? <SepaCard customer={customer} /> : null}
              {/* Lo dice la pantalla porque lo dice el contrato: estos campos
                  están en el Resource y no en el Request. */}
              <p className="px-1 text-xs text-muted-foreground">
                Datos de cobro de sólo lectura: el ERP los enseña y se cambian
                en Pimia.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
