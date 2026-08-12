# Manda un archivo de bytes crudos (ESC/POS) directo al spooler de Windows
# en modo RAW, sin pasar por el driver grafico de la impresora - por eso
# sale como texto (rapido, nitido) en vez de como imagen rasterizada.
# Basado en el ejemplo clasico de Microsoft "How to send raw data to a
# printer" (KB322091), adaptado a PowerShell via Add-Type en vez de un
# .exe C# aparte - asi no hace falta compilar nada, ni en esta compu ni en
# la del comercio: PowerShell y .NET ya vienen instalados en cualquier
# Windows moderno.
param(
    [Parameter(Mandatory = $true)][string]$Impresora,
    [Parameter(Mandatory = $true)][string]$Archivo
)

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public class ImpresionCrudaEmpremas
{
    [StructLayout(LayoutKind.Sequential)]
    public class DOCINFOA
    {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.drv", EntryPoint = "ClosePrinter")]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterA", SetLastError = true, CharSet = CharSet.Ansi, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);

    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter")]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter")]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter")]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.drv", EntryPoint = "WritePrinter")]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void EnviarBytes(string impresora, byte[] datos)
    {
        IntPtr hPrinter;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Ticket EMPREMAS";
        di.pDataType = "RAW";

        if (!OpenPrinter(impresora, out hPrinter, IntPtr.Zero))
            throw new Exception("No se pudo abrir la impresora: " + impresora);

        try
        {
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("No se pudo iniciar el documento de impresion");
            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("No se pudo iniciar la pagina de impresion");
                IntPtr pUnmanagedBytes = Marshal.AllocCoTaskMem(datos.Length);
                Marshal.Copy(datos, 0, pUnmanagedBytes, datos.Length);
                int escritos;
                bool ok = WritePrinter(hPrinter, pUnmanagedBytes, datos.Length, out escritos);
                Marshal.FreeCoTaskMem(pUnmanagedBytes);
                EndPagePrinter(hPrinter);
                if (!ok) throw new Exception("Fallo al escribir en la impresora");
            }
            finally
            {
                EndDocPrinter(hPrinter);
            }
        }
        finally
        {
            ClosePrinter(hPrinter);
        }
    }
}
"@

try {
    $bytes = [System.IO.File]::ReadAllBytes($Archivo)
    [ImpresionCrudaEmpremas]::EnviarBytes($Impresora, $bytes)
    exit 0
} catch {
    # Sin esto, una excepcion de .NET dentro de Add-Type no hace que el
    # script termine con codigo de salida distinto de 0 - el agente
    # Node.js necesita ese codigo para saber si la impresion fallo.
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
