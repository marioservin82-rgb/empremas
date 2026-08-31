"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

const MOTIVOS = {
  1: "Traslado por venta",
  2: "Traslado por consignación",
  3: "Exportación",
  4: "Traslado por compra",
  5: "Importación",
  6: "Traslado por devolución",
  7: "Traslado entre locales de la empresa",
  8: "Traslado por transformación",
  9: "Traslado por reparación",
  10: "Traslado por emisor móvil",
  11: "Exhibición o demostración",
  12: "Participación en ferias",
  13: "Traslado de encomienda",
  99: "Otro",
};
const TIPO_TRANSPORTE = { 1: "Propio", 2: "Tercero" };
const MODALIDAD = { 1: "Terrestre", 2: "Fluvial", 3: "Aéreo", 4: "Multimodal" };
const RESP_FLETE = {
  1: "Emisor de la factura",
  2: "Receptor de la factura",
  3: "Tercero",
  4: "Agente intermediario",
  5: "Transporte propio",
};

const fmt = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 3 });
const fecha = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString("es-PY") : "—");
const fechaHora = (v) =>
  v ? new Date(v).toLocaleString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const grupoCdc = (cdc) => (cdc ? cdc.replace(/(.{4})/g, "$1 ").trim() : "—");

export default function ImprimirRemision() {
  const router = useRouter();
  const { id } = useParams();
  const [r, setR] = useState(null);
  const [emp, setEmp] = useState(null);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!localStorage.getItem("empremas_token")) {
      router.push("/");
      return;
    }
    Promise.all([apiFetch(`/api/remisiones/${id}`), apiFetch("/api/empresas/actual")])
      .then(([rr, ee]) => {
        setR(rr);
        setEmp(ee);
      })
      .catch((e) => setError(e.message));
  }, [id, router]);

  // QR de verificación: abre la consulta pública del CDC en e-Kuatia. El QR
  // criptográfico oficial va en el KuDE PDF del conector.
  useEffect(() => {
    if (!r?.cdc) return;
    let cancelado = false;
    import("qrcode").then((QRCode) => {
      const url = `https://ekuatia.set.gov.py/consultas/qr?nVersion=150&Id=${r.cdc}`;
      QRCode.toDataURL(url, { margin: 0, width: 240, errorCorrectionLevel: "M" }).then((d) => {
        if (!cancelado) setQr(d);
      });
    });
    return () => {
      cancelado = true;
    };
  }, [r?.cdc]);

  if (error) return <main className="p-6 text-sm text-red-600">{error}</main>;
  if (!r || !emp) return <main className="p-6 text-slate-500">Cargando…</main>;

  const t = r.transporte || {};
  const veh = t.vehiculo || {};
  const trp = t.transportista || {};
  const chofer = trp.chofer || {};
  const actividades = Array.isArray(emp.sifen_actividades)
    ? emp.sifen_actividades.map((a) => a.descripcion).join(", ")
    : "";
  const totalUnidades = r.items.reduce((a, i) => a + Number(i.cantidad || 0), 0);

  return (
    <div className="kw">
      <style>{CSS}</style>

      <div className="toolbar">
        <button onClick={() => window.print()}>Imprimir</button>
        <button className="sec" onClick={() => router.back()}>
          Volver
        </button>
        <span>El encabezado de la tabla se repite en cada hoja.</span>
      </div>

      <div className="kude">
        <div className="frame">
          <div className="head">
            <div className="emisor">
              <div className="brand">{emp.razon_social}</div>
              <div className="line">
                RUC {emp.ruc}
                {actividades ? ` · Act. económica: ${actividades}` : ""}
              </div>
              {emp.direccion && <div className="line">{emp.direccion}</div>}
              {(emp.telefono || emp.email) && (
                <div className="line">
                  {[emp.telefono && `Tel. ${emp.telefono}`, emp.email].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <div className="doc">
              <div className="kind">
                Nota de Remisión
                <br />
                Electrónica
              </div>
              <div className="num">{r.numero_formateado || "—"}</div>
              <div className="timb">
                {emp.sifen_timbrado_numero ? `Timbrado Nº ${emp.sifen_timbrado_numero}` : ""}
                {emp.sifen_timbrado_inicio ? ` · vig. desde ${fecha(emp.sifen_timbrado_inicio)}` : ""}
              </div>
            </div>
          </div>

          <div className="control">
            <div className="cdc">
              <div className="lab">Código de control (CDC)</div>
              <div className="val">{grupoCdc(r.cdc)}</div>
              <div className="emis">
                <span className="lab">Emisión</span> <b>{fechaHora(r.creado_en)}</b> &nbsp;·&nbsp;
                <span className="lab"> Traslado</span> <b>{fecha(r.fecha_traslado)}</b> &nbsp;·&nbsp;
                <span className="lab"> Km est.</span> <b>{fmt.format(r.km_estimados)}</b>
              </div>
            </div>
            <div className="qr">
              <div className="box">
                {qr ? <img src={qr} alt="QR de verificación SIFEN" /> : "QR"}
              </div>
              <div className="cap">ekuatia.set.gov.py</div>
            </div>
          </div>

          <div className="band">Destinatario · Motivo · Transporte</div>
          <div className="kv">
            <div className="f full">
              <div className="k">Nombre o razón social</div>
              <div className="v">
                {r.cliente_nombre || "Consumidor Final"}
                {r.cliente_documento ? ` — ${r.cliente_documento}` : ""}
              </div>
            </div>
            <div className="f full">
              <div className="k">Dirección de entrega</div>
              <div className="v">{r.direccion_entrega}</div>
            </div>
            <div className="f">
              <div className="k">Motivo del traslado</div>
              <div className="v">{MOTIVOS[r.motivo] || "—"}</div>
            </div>
            <div className="f">
              <div className="k">Tipo de transporte</div>
              <div className="v">{TIPO_TRANSPORTE[t.tipoTransporte] || "Propio"}</div>
            </div>
            <div className="f">
              <div className="k">Responsable del flete</div>
              <div className="v">{RESP_FLETE[t.responsableFlete] || "Transporte propio"}</div>
            </div>
            <div className="f">
              <div className="k">Modalidad</div>
              <div className="v">{MODALIDAD[t.modalidad] || "Terrestre"}</div>
            </div>
            <div className="f">
              <div className="k">Factura asociada</div>
              <div className="v">
                {r.factura_cdc
                  ? "Emitida"
                  : r.fecha_futura_factura
                    ? `a facturar (est. ${fecha(r.fecha_futura_factura)})`
                    : "—"}
              </div>
            </div>
          </div>

          <div className="band">Transportista · Vehículo</div>
          <div className="kv">
            <div className="f">
              <div className="k">Transportista</div>
              <div className="v">{trp.nombre || "—"}</div>
            </div>
            <div className="f">
              <div className="k">RUC / Documento</div>
              <div className="v">{trp.contribuyente ? trp.ruc : trp.documentoNumero || "—"}</div>
            </div>
            <div className="f">
              <div className="k">Chofer</div>
              <div className="v">
                {chofer.nombre || "—"}
                {chofer.documentoNumero ? ` · C.I. ${chofer.documentoNumero}` : ""}
              </div>
            </div>
            <div className="f">
              <div className="k">Vehículo (tipo / marca)</div>
              <div className="v">
                {veh.tipo || "—"} / {veh.marca || "—"}
              </div>
            </div>
            <div className="f">
              <div className="k">Chapa / matrícula</div>
              <div className="v mono">{veh.chapa || "—"}</div>
            </div>
          </div>

          <div className="items-band">
            <span>Detalle de mercaderías trasladadas</span>
            <span className="note">sin valores — es un traslado, no una venta</span>
          </div>
          <table>
            <colgroup>
              <col className="i" />
              <col />
              <col className="q" />
              <col className="u" />
            </colgroup>
            <thead>
              <tr>
                <th className="c">#</th>
                <th>Descripción</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th>Unidad</th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="c">{idx + 1}</td>
                  <td>{it.producto_nombre}</td>
                  <td className="n">{fmt.format(it.cantidad)}</td>
                  <td className="c">{it.unidad_medida || "Unidad"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="tot">
            <div className="t">
              <div className="k lab">Total de ítems</div>
              <div className="v">{r.items.length}</div>
            </div>
            <div className="t">
              <div className="k lab">Cantidad total de unidades</div>
              <div className="v">{fmt.format(totalUnidades)}</div>
            </div>
          </div>

          <div className="firmas">
            <div className="fbox">
              <div className="sign" />
              <div className="rol">Entregó — por el emisor</div>
              <div className="meta">
                <span>Aclaración</span>
                <span>C.I. Nº</span>
              </div>
            </div>
            <div className="fbox">
              <div className="sign" />
              <div className="rol">Recibí conforme la mercadería detallada</div>
              <div className="meta">
                <span>Aclaración</span>
                <span>C.I. Nº</span>
                <span>Fecha</span>
              </div>
            </div>
          </div>

          <div className="legal">
            <b>Representación gráfica de un documento electrónico (KuDE).</b> La validez legal reside en el XML
            firmado digitalmente y aprobado por el SIFEN — verifique en ekuatia.set.gov.py o escaneando el QR. La
            Nota de Remisión Electrónica respalda el traslado de mercaderías y no acredita por sí sola crédito o
            débito fiscal.
          </div>
        </div>
      </div>
    </div>
  );
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
.kw{--paper:#fff;--ink:#12181f;--rule:#3a4653;--hair:#c9d0d8;--muted:#5b6672;--band:#0b2545;--zebra:#f2f5f8;--thead:#e7ecf1;
  background:#e7e9ec;min-height:100vh;padding:20px 12px 40px;color:var(--ink);
  font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;}
.kw *{box-sizing:border-box;margin:0;padding:0;}
.kw .toolbar{max-width:210mm;margin:0 auto 14px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;font-size:12px;color:#4a5560;}
.kw .toolbar button{background:#0b2545;color:#fff;border:0;border-radius:8px;padding:8px 16px;font-weight:600;font-size:13px;cursor:pointer;}
.kw .toolbar button.sec{background:#e2e6ea;color:#38424d;}
.kw .kude{width:210mm;margin:0 auto;background:var(--paper);padding:7mm;border:1px solid var(--hair);
  box-shadow:0 1px 3px rgba(10,20,40,.14),0 12px 40px rgba(10,20,40,.10);font-size:9.5px;line-height:1.22;}
.kw .frame{border:1px solid var(--rule);}
.kw .frame>*+*{border-top:1px solid var(--rule);}
.kw .head{display:grid;grid-template-columns:1fr 62mm;}
.kw .head .emisor{padding:5px 8px;border-right:1px solid var(--rule);}
.kw .head .doc{padding:5px 8px;text-align:center;display:flex;flex-direction:column;gap:2px;}
.kw .brand{font-family:"Oswald","Arial Narrow",sans-serif;font-weight:700;font-size:15px;letter-spacing:.03em;line-height:1;}
.kw .emisor .line{color:var(--muted);font-size:8.7px;margin-top:1px;}
.kw .doc .kind{font-family:"Oswald","Arial Narrow",sans-serif;font-weight:600;font-size:12px;letter-spacing:.06em;text-transform:uppercase;border:1.5px solid var(--rule);padding:3px 4px;}
.kw .doc .num{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:12px;}
.kw .doc .timb{color:var(--muted);font-size:8.7px;}
.kw .control{display:grid;grid-template-columns:1fr 24mm;align-items:center;}
.kw .control .cdc{padding:4px 8px;border-right:1px solid var(--rule);}
.kw .lab{font-family:"Oswald","Arial Narrow",sans-serif;font-weight:500;font-size:7.6px;letter-spacing:.09em;text-transform:uppercase;color:var(--muted);}
.kw .cdc .val{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:10px;letter-spacing:.04em;word-break:break-all;}
.kw .cdc .emis{margin-top:3px;font-size:8.8px;}
.kw .cdc .emis b{font-weight:600;font-variant-numeric:tabular-nums;}
.kw .control .qr{padding:3px;text-align:center;}
.kw .control .qr .box{width:18mm;height:18mm;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:6.5px;color:var(--muted);}
.kw .control .qr .box img{width:100%;height:100%;display:block;image-rendering:pixelated;}
.kw .control .qr .cap{font-size:6.6px;color:var(--muted);margin-top:1px;}
.kw .band{font-family:"Oswald","Arial Narrow",sans-serif;font-weight:600;font-size:8.4px;letter-spacing:.08em;text-transform:uppercase;background:var(--band);color:#fff;padding:2.5px 8px;}
.kw .kv{display:grid;grid-template-columns:repeat(3,1fr);gap:3px 14px;padding:5px 8px;}
.kw .kv .f{min-width:0;}
.kw .kv .f.full{grid-column:1 / -1;}
.kw .kv .k{font-family:"Oswald","Arial Narrow",sans-serif;font-weight:500;font-size:7.4px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);}
.kw .kv .v{font-weight:500;font-size:9.4px;overflow-wrap:anywhere;}
.kw .kv .v.mono{font-family:"IBM Plex Mono",monospace;}
.kw .items-band{display:flex;justify-content:space-between;align-items:baseline;font-family:"Oswald","Arial Narrow",sans-serif;font-weight:600;font-size:8.4px;letter-spacing:.08em;text-transform:uppercase;background:var(--band);color:#fff;padding:2.5px 8px;}
.kw .items-band .note{font-weight:400;letter-spacing:.02em;text-transform:none;opacity:.85;font-family:"IBM Plex Sans",sans-serif;font-size:8px;}
.kw table{width:100%;border-collapse:collapse;table-layout:fixed;}
.kw thead{display:table-header-group;}
.kw tr{page-break-inside:avoid;break-inside:avoid;}
.kw th,.kw td{border:1px solid var(--hair);padding:3.5px 7px;font-size:11px;vertical-align:top;}
.kw th{background:var(--thead);color:var(--ink);font-family:"Oswald","Arial Narrow",sans-serif;font-weight:600;font-size:9px;letter-spacing:.05em;text-transform:uppercase;text-align:left;border-color:var(--rule);}
.kw tbody tr:nth-child(even){background:var(--zebra);}
.kw td.c{text-align:center;}
.kw td.n{text-align:right;font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;font-size:11px;}
.kw col.i{width:9mm;} .kw col.q{width:22mm;} .kw col.u{width:24mm;}
.kw .tot{display:flex;justify-content:flex-end;gap:26px;padding:4px 8px;}
.kw .tot .t{text-align:right;}
.kw .tot .t .v{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:11px;font-variant-numeric:tabular-nums;margin-top:1px;}
.kw .firmas{display:grid;grid-template-columns:1fr 1fr;}
.kw .firmas .fbox{padding:6px 10px 4px;}
.kw .firmas .fbox + .fbox{border-left:1px solid var(--rule);}
.kw .firmas .sign{height:13mm;border-bottom:1px solid var(--ink);margin-bottom:3px;}
.kw .firmas .rol{font-family:"Oswald","Arial Narrow",sans-serif;font-weight:600;font-size:8.4px;letter-spacing:.06em;text-transform:uppercase;}
.kw .firmas .meta{display:flex;gap:14px;margin-top:2px;font-size:8px;color:var(--muted);}
.kw .firmas .meta span{flex:1;border-bottom:1px dotted var(--hair);padding-bottom:1px;}
.kw .legal{padding:4px 8px;font-size:7.8px;line-height:1.3;color:var(--muted);text-align:center;}
.kw .legal b{color:var(--ink);font-weight:600;}
@media print{
  @page{size:A4;margin:7mm;}
  .kw{background:#fff;padding:0;min-height:0;}
  .kw,.kw *{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  .kw .toolbar{display:none;}
  /* .kw .kude se posiciona en globals.css (top-left, ancho completo) */
  .kw .kude{border:none;box-shadow:none;padding:0;}
}
`;
