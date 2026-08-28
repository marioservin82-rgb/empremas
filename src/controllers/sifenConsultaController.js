import { consultaDeEmpresa } from '../config/db.js';
import { consultarRuc as consultarRucConector } from '../services/conectorSifen.js';

// GET /api/(clientes|proveedores)/consultar-ruc?numero=NNNNNNN
// Trae la razón social del padrón de la DNIT (vía el conector -> SIFEN
// consultaRUC) para autocompletar el alta de un cliente o proveedor. Solo
// funciona para números que estén en el registro de contribuyentes (RUC, o
// cédula de una persona física que sea contribuyente). Un consumidor final
// sin RUC no figura.
export async function consultarRucDnit(req, res) {
    const { empresaId } = req.usuario;
    const bruto = String(req.query.numero || '').trim();
    const numero = bruto.split('-')[0].replace(/\D/g, '');
    if (!/^\d{3,8}$/.test(numero)) {
        return res.status(400).json({ error: 'Ingresá un número de cédula o RUC válido' });
    }

    const emp = await consultaDeEmpresa(
        empresaId,
        `SELECT sifen_conector_tenant_id FROM empresas WHERE id = $1`,
        [empresaId]
    );
    const tenantId = emp.rows[0]?.sifen_conector_tenant_id;
    if (!tenantId) {
        return res.status(409).json({ error: 'La facturación electrónica todavía no está configurada' });
    }

    try {
        const r = await consultarRucConector(tenantId, numero);
        if (!r?.encontrado) {
            return res.json({ encontrado: false });
        }
        return res.json({
            encontrado: true,
            razonSocial: r.razonSocial || null,
            dv: r.digitoVerificador || null,
            estado: r.estado || null,
            documento: r.digitoVerificador ? `${numero}-${r.digitoVerificador}` : numero,
        });
    } catch (error) {
        return res.status(502).json({ error: 'No se pudo consultar el padrón de la DNIT en este momento' });
    }
}
