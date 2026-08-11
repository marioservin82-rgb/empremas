// Error esperado por una regla del negocio (stock insuficiente, credito
// insuficiente, etc.) - el controller lo devuelve como 400, no como 500.
export class ErrorNegocio extends Error {}
