import pool, { consultaDeEmpresa } from '../config/db.js';
import { resolverDocumentoDeVenta } from '../controllers/ventasController.js';

const INTERVALO_MS = 90_000;

// Barre los documentos electrónicos que quedaron sin resolver:
//  - 'enviado' > 3 min -> lote asíncrono que todavía no concluyó (re-consulta).
//  - 'error'   > 2 min -> SIFEN/red falló al emitir (re-emite; 'error' significa
//    que la emisión no llegó a SIFEN, así que re-emitir es seguro).
// NO re-emite 'pendiente' automáticamente (podría duplicar si la emisión llegó
// a SIFEN pero se perdió la respuesta) — sólo lo registra para revisión manual.
export async function barrerDocumentosElectronicos() {
    const empresas = (
        await pool.query(
            `SELECT id FROM empresas
             WHERE sifen_estado = 'produccion' AND sifen_conector_tenant_id IS NOT NULL`
        )
    ).rows;

    for (const empresa of empresas) {
        let pendientes;
        try {
            // documentos_electronicos tiene RLS -> consultaDeEmpresa fija el contexto
            // dentro de una transacción (nunca set_config sobre la conexión del pool).
            pendientes = (
                await consultaDeEmpresa(
                    empresa.id,
                    `SELECT venta_id, estado, cdc FROM documentos_electronicos
                     WHERE creado_en > now() - interval '24 hours'
                       AND (
                            (estado = 'enviado' AND actualizado_en < now() - interval '3 minutes')
                         OR (estado = 'error'   AND actualizado_en < now() - interval '2 minutes')
                         OR (estado = 'pendiente' AND actualizado_en < now() - interval '5 minutes')
                       )
                     LIMIT 50`,
                    []
                )
            ).rows;
        } catch (error) {
            console.error('[barredor DE] error listando pendientes de', empresa.id, error.message);
            continue;
        }

        for (const de of pendientes) {
            // 'pendiente' con CDC = la emisión llegó a SIFEN; se puede re-consultar.
            // 'pendiente' sin CDC = no se sabe si llegó; sólo se avisa (no se re-emite).
            if (de.estado === 'pendiente' && !de.cdc) {
                console.warn(`[barredor DE] venta ${de.venta_id}: documento 'pendiente' sin CDC hace >5 min — revisar a mano`);
                continue;
            }
            try {
                const estado = await resolverDocumentoDeVenta(empresa.id, de.venta_id);
                if (estado && estado !== de.estado) {
                    console.log(`[barredor DE] venta ${de.venta_id}: ${de.estado} -> ${estado}`);
                }
            } catch (error) {
                console.warn(`[barredor DE] venta ${de.venta_id} no se pudo resolver:`, error.message);
            }
        }
    }
}

let corriendo = false;

export function iniciarBarredorDocumentosElectronicos() {
    const ejecutar = () => {
        if (corriendo) return;
        corriendo = true;
        barrerDocumentosElectronicos().finally(() => {
            corriendo = false;
        });
    };
    setInterval(ejecutar, INTERVALO_MS);
    setTimeout(ejecutar, 20_000);
}
