import pg from 'pg';
import 'dotenv/config';

// La base local no soporta/necesita SSL, pero Render Postgres (y la mayoria
// de los hosting en la nube) lo exigen para conexiones externas.
const esLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: esLocal ? false : { rejectUnauthorized: false },
});

// Toda operacion de una empresa pasa por aca: primero le dice a Postgres
// cual es la empresa actual, y las politicas de RLS del schema.sql hacen
// el resto (bloquean cualquier fila que no sea de esa empresa).
//
// BEGIN/COMMIT es necesario: set_config(..., true) es "local a la
// transaccion" y sin una transaccion explicita se resetearia antes de
// llegar a la consulta real, dejando la conexion (que vuelve al pool y se
// reutiliza para otra empresa) sin el filtro puesto.
export async function transaccionDeEmpresa(empresaId, fn) {
    const cliente = await pool.connect();
    try {
        await cliente.query('BEGIN');
        await cliente.query("SELECT set_config('app.empresa_actual', $1, true)", [empresaId]);
        const resultado = await fn(cliente);
        await cliente.query('COMMIT');
        return resultado;
    } catch (error) {
        await cliente.query('ROLLBACK');
        throw error;
    } finally {
        cliente.release();
    }
}

// Para una unica consulta (el caso mas comun). Para varios pasos que deben
// ser todo-o-nada (ej. registrar una venta y descontar stock), usar
// transaccionDeEmpresa directamente.
export function consultaDeEmpresa(empresaId, texto, valores) {
    return transaccionDeEmpresa(empresaId, (cliente) => cliente.query(texto, valores));
}

// Para consultas que todavia no tienen una empresa logueada (login, registro).
export function consulta(texto, valores) {
    return pool.query(texto, valores);
}

export default pool;
