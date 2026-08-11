// Arma el link wa.me con el numero paraguayo normalizado (595 + sin el 0
// inicial) y un mensaje precargado. No hay forma de adjuntar la imagen
// automaticamente por este link — WhatsApp no lo permite desde la web —
// asi que el mensaje le pide a quien manda que adjunte la imagen ya
// descargada a mano.
export function linkWhatsapp(celular, mensaje) {
  if (!celular) return null;
  const soloNumeros = celular.replace(/\D/g, "");
  const numeroParaguayo = soloNumeros.startsWith("595")
    ? soloNumeros
    : `595${soloNumeros.replace(/^0/, "")}`;
  return `https://wa.me/${numeroParaguayo}?text=${encodeURIComponent(mensaje)}`;
}
