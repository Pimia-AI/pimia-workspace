/**
 * El rango que se está viendo de una lista paginada.
 *
 * Vive fuera del componente porque es aritmética con esquinas —la última
 * página no está llena, el tenant no siempre manda el total— y esas se prueban,
 * no se miran en una captura.
 */

/** «1–25 de 132», «12 resultados» o «1–25» si no se conoce el total. */
export function describeRange(
  page: number,
  pageSize: number,
  shown: number,
  total: number | null,
): string {
  if (shown <= 0) {
    return "Sin resultados";
  }
  const first = (page - 1) * pageSize + 1;
  const last = first + shown - 1;
  if (total === null) {
    return `${first}–${last}`;
  }
  if (page === 1 && total <= shown) {
    return `${total} ${total === 1 ? "resultado" : "resultados"}`;
  }
  return `${first}–${last} de ${total}`;
}
