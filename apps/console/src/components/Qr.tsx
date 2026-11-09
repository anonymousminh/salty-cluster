import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 240, errorCorrectionLevel: "M" }).then(setSrc, () => setSrc(undefined));
  }, [value]);
  return src ? <img src={src} alt={`QR code to check in at ${label}`} width={160} height={160} /> : <div className="qr-placeholder" aria-hidden="true" />;
}
