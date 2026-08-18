/**
 * Las fechas del ERP, probadas **fuera de España**.
 *
 * El bug que `pimiaDates.ts` existe para no cometer —`new Date("2026-08-18")`
 * es medianoche UTC, que al oeste de Greenwich cae el día 17— no se reproduce
 * jamás en Madrid: aquí el offset es positivo y la medianoche UTC sigue cayendo
 * dentro del mismo día. Un test que solo corriera en local pasaría con la
 * implementación buena **y con la mala**, y sería peor que no tenerlo, porque
 * daría por cubierto justo lo único que hay que cubrir. Por eso el fichero fija
 * `process.env.TZ` a una zona al oeste antes de nada: sin eso, esto no prueba.
 *
 * ⚠️ **Lo que de verdad hace que el truco funcione no es la posición de la
 * línea.** Los `import` de ESM se izan y se evalúan **antes** que el cuerpo del
 * módulo, así que `pimiaDates.ts` ya está cargado cuando se asigna la zona. Sale
 * bien porque ese módulo no guarda ningún formateador: llama a
 * `toLocaleDateString` en cada uso, y ahí lee la zona vigente. `lib/calendar.ts`
 * **sí** cachea sus `Intl.DateTimeFormat` a nivel de módulo, y copiar este
 * patrón allí congelaría `Europe/Madrid` y volvería verde un test ciego. Para
 * ese caso hace falta `import()` dinámico después de fijar `TZ`, o un
 * subproceso con `TZ=` en el entorno.
 */
process.env.TZ = "America/Los_Angeles";

import assert from "node:assert/strict";
import test from "node:test";

import { formatIsoDateLong, formatIsoDateShort } from "./pimiaDates.ts";

/**
 * El fusible del fichero. Si `TZ` dejara de tener efecto en un Node futuro,
 * todo lo de abajo seguiría pasando sin comprobar nada; esto lo convierte en un
 * fallo ruidoso en vez de en una cobertura de mentira.
 */
test("el montaje horario está de verdad al oeste de Greenwich", () => {
  assert.equal(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "America/Los_Angeles",
    "process.env.TZ ya no mueve la zona: el resto del fichero no prueba nada",
  );
  // Y el offset es el que hace daño: por detrás de UTC en las dos mitades del año.
  assert.ok(new Date(2026, 7, 18).getTimezoneOffset() > 0);
  assert.ok(new Date(2026, 0, 1).getTimezoneOffset() > 0);
});

/**
 * La prueba que da sentido al módulo. Las dos fechas están elegidas a los dos
 * lados del horario de verano americano, porque el desplazamiento cambia de
 * tamaño (−7 h en agosto, −8 h en enero) pero el día se corre igual en ambos.
 */
test("la fecha no se corre un día al oeste de Greenwich", () => {
  assert.equal(formatIsoDateShort("2026-08-18"), "18 ago 2026");
  assert.equal(formatIsoDateLong("2026-08-18"), "18 de agosto de 2026");

  // Nochevieja es el caso caro: el día malo se lleva por delante también el mes
  // y el año, y «31 dic 2025» en la ficha de una factura del 1 de enero manda
  // el asiento al ejercicio anterior.
  assert.equal(formatIsoDateShort("2026-01-01"), "01 ene 2026");
  assert.equal(formatIsoDateLong("2026-01-01"), "01 de enero de 2026");

  // El contraste explícito: así se vería con la implementación ingenua que este
  // módulo sustituye. Si algún día esto dejara de dar el día anterior, sería que
  // el montaje ha perdido el efecto y las tres líneas de arriba pasan por suerte.
  const ingenuo = new Date("2026-08-18").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  assert.equal(ingenuo, "17 ago 2026");
  assert.notEqual(formatIsoDateShort("2026-08-18"), ingenuo);
});

test("una fecha válida se escribe con su día, su mes y su año", () => {
  assert.equal(formatIsoDateShort("2026-09-05"), "05 sept 2026");
  assert.equal(formatIsoDateLong("2026-09-05"), "05 de septiembre de 2026");
  assert.equal(formatIsoDateShort("2026-12-31"), "31 dic 2026");
  assert.equal(formatIsoDateLong("2026-12-31"), "31 de diciembre de 2026");
  // Un 29 de febrero real, que es donde revienta cualquier aritmética casera.
  assert.equal(formatIsoDateLong("2028-02-29"), "29 de febrero de 2028");
});

/**
 * La regla moral del repo aplicada a las fechas: lo que no se pudo leer es una
 * raya. Nunca «hoy», que es la tentación fácil y la que hace que una factura sin
 * vencimiento parezca vencer justo el día en que alguien la mira.
 */
test("un dato que no hay es una raya, no una fecha inventada", () => {
  assert.equal(formatIsoDateShort(null), "—");
  assert.equal(formatIsoDateLong(null), "—");
  // La cadena vacía es el mismo «no hay dato» con otra ropa; la API manda las dos.
  assert.equal(formatIsoDateShort(""), "—");
  assert.equal(formatIsoDateLong(""), "—");
});

/**
 * La decisión documentada del módulo: lo que no tiene forma `YYYY-MM-DD` se
 * devuelve tal cual. Darle formato sería afirmar que se ha entendido, y esa
 * afirmación es la que impide reconocer que el contrato de la API ha cambiado
 * —un `2026-08-18T00:00:00Z` recién estrenado se vería idéntico a lo de siempre.
 */
test("lo que no tiene forma de fecha se enseña en crudo", () => {
  assert.equal(
    formatIsoDateShort("2026-08-18T00:00:00Z"),
    "2026-08-18T00:00:00Z",
  );
  assert.equal(
    formatIsoDateLong("2026-08-18T00:00:00Z"),
    "2026-08-18T00:00:00Z",
  );
  assert.equal(formatIsoDateShort("18/08/2026"), "18/08/2026");
  assert.equal(formatIsoDateLong("18/08/2026"), "18/08/2026");
  // Sin rellenar a dos dígitos tampoco es el contrato: se enseña como vino.
  assert.equal(formatIsoDateShort("2026-8-18"), "2026-8-18");
  assert.equal(formatIsoDateShort("hoy"), "hoy");
});

/**
 * La forma no basta, y por eso el módulo comprueba además que los tres números
 * **vuelven tal como entraron**.
 *
 * `new Date(2026, 1, 30)` **no falla**: desborda al 2 de marzo. Sin esta
 * comprobación, un `2026-02-30` pasaría el patrón `YYYY-MM-DD` y saldría a
 * pantalla como «02 mar 2026» —una fecha con la misma pinta exacta que una
 * buena, sin nada que invite a mirar dos veces—. Es el fallo que este módulo
 * existe para cerrar, cometido dos pasos más abajo: un vencimiento que se corre
 * de mes no se denuncia solo, se descubre cuando alguien reclama tarde.
 *
 * Los tres casos son las tres formas de desbordar, y ninguno se parece al otro
 * en pantalla: el día se come el mes siguiente, el mes se lleva el AÑO por
 * delante (`2026-13-01` sería «01 ene 2027», que en una factura cambia de
 * ejercicio), y un 29 de febrero de un año que no es bisiesto —el más traidor,
 * porque el de 2028 de aquí arriba es legítimo y se formatea— cae en marzo.
 */
test("una fecha imposible con forma buena se enseña en crudo, no desbordada", () => {
  assert.equal(formatIsoDateShort("2026-02-30"), "2026-02-30");
  assert.equal(formatIsoDateLong("2026-02-30"), "2026-02-30");
  assert.equal(formatIsoDateShort("2026-13-01"), "2026-13-01");
  assert.equal(formatIsoDateLong("2026-13-01"), "2026-13-01");
  assert.equal(formatIsoDateShort("2026-08-32"), "2026-08-32");
  assert.equal(formatIsoDateLong("2026-08-32"), "2026-08-32");
  // 2025 no es bisiesto: el 29 de febrero de ese año es marzo disfrazado.
  assert.equal(formatIsoDateShort("2025-02-29"), "2025-02-29");
  // Y el mes 00, que desborda hacia ATRÁS (diciembre del año anterior).
  assert.equal(formatIsoDateShort("2026-00-10"), "2026-00-10");
});

/**
 * El contrapeso de la prueba de arriba: endurecer no puede llevarse por delante
 * lo que ya funcionaba. Los días elegidos son los **últimos válidos** de cada
 * longitud de mes, que es justo donde una comprobación pasada de frenada
 * empezaría a rayar fechas buenas — y una factura con la fecha en crudo en el
 * listado es tan sospechosa como una desbordada, sólo que al revés.
 */
test("el borde bueno de cada mes sigue formateándose", () => {
  assert.equal(formatIsoDateShort("2026-01-31"), "31 ene 2026");
  assert.equal(formatIsoDateShort("2026-02-28"), "28 feb 2026");
  assert.equal(formatIsoDateShort("2026-04-30"), "30 abr 2026");
  assert.equal(formatIsoDateLong("2026-04-30"), "30 de abril de 2026");
  // El primer día del año, que es el otro extremo del mismo rango.
  assert.equal(formatIsoDateShort("2026-01-01"), "01 ene 2026");
});
